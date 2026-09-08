/**
 * Production shift lifecycle service.
 * Orchestrates: open shift -> opening readings -> sales/payments -> receipts -> closing -> close.
 * Every mutation persists to IndexedDB immediately (offline-first).
 */

import { DomainError } from '../domain/errors'
import { PRODUCTION_PUMPS, PRODUCTION_STATION } from '../domain/config'
import {
  computeFuelSales,
  emptyPayments,
  finalizeClosedShift,
  saleAmount,
  sumSales,
  validateMeterReading,
  validateReadingsSet,
  validateSale,
} from '../domain/rules'
import { shiftRepo, transactionRepo, syncQueueRepo } from '../infra/repositories'
import { liveSyncBus } from './liveSyncBus'
import { productService } from './productService'
import type {
  Attendant,
  FuelCode,
  FuelSale,
  MeterReading,
  PaymentsBreakdown,
  PaymentMethod,
  Shift,
  ShiftTransaction,
} from '../domain/types'

export interface OpenShiftInput {
  attendant: Attendant
  pumpId: string
  openingReadings: MeterReading[]
  customFuelPrices?: Record<string, number>
}

export interface RecordSaleInput {
  shift: Shift
  fuelCode: FuelCode
  litres: number
  method: PaymentMethod
  unitPrice?: number
  customerRef?: string
}

export interface UpdateTransactionInput {
  fuelCode?: FuelCode
  litres?: number
  method?: PaymentMethod
  unitPrice?: number
  customerRef?: string
}

export class ShiftService {
  async openShift(input: OpenShiftInput): Promise<Shift> {
    validateReadingsSet(input.openingReadings)

    const pump = PRODUCTION_PUMPS.find(p => p.id === input.pumpId)
    if (!pump) throw new DomainError('SHIFT_NOT_FOUND', 'Selected pump does not exist.', input.pumpId)

    const existing = await shiftRepo.getActiveForAttendant(input.attendant.id)
    if (existing) {
      throw new DomainError('SHIFT_ALREADY_EXISTS', 'Attendant already has an open shift.', undefined, {
        shiftId: existing.id,
      })
    }

    const prices =
      input.customFuelPrices || (await productService.getFuelPriceMap(input.attendant.companyId))

    const now = new Date()
    const dayCount = (await shiftRepo.countForDate(input.attendant.id, now.toISOString())) + 1
    const number = `MVP-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${input.attendant.employeeCode.slice(-4)}-${String(
      dayCount,
    ).padStart(3, '0')}`

    const readings = input.openingReadings.filter(r => pump.fuels.includes(r.fuelCode))
    for (const r of readings) validateMeterReading(r)

    const shift: Shift = {
      id: `shift-${crypto.randomUUID()}`,
      number,
      attendantId: input.attendant.id,
      attendantName: input.attendant.fullName,
      pumpId: pump.id,
      pumpName: pump.name,
      stationId: PRODUCTION_STATION.id,
      stationName: PRODUCTION_STATION.name,
      status: 'OPEN',
      openedAt: now.toISOString(),
      closedAt: null,
      openingReadings: readings,
      closingReadings: [],
      sales: computeFuelSales(readings, readings, prices).map(s => ({ ...s, litres: 0, amount: 0 })),
      expectedTotal: 0,
      payments: emptyPayments(),
      actualTotal: 0,
      variance: 0,
      notes: null,
      reviewerNotes: null,
      syncStatus: 'PENDING',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    await shiftRepo.upsert(shift)
    liveSyncBus.publish({ table: 'SHIFTS', reason: 'INSERT', key: shift.id })
    return shift
  }

  async getActiveShift(attendantId: string): Promise<Shift | null> {
    return (await shiftRepo.getActiveForAttendant(attendantId)) ?? null
  }

  async recordSale(input: RecordSaleInput): Promise<Shift> {
    if (input.shift.status !== 'OPEN') {
      throw new DomainError('SHIFT_NOT_OPEN', 'Shift is closed and submitted. Sales cannot be recorded.', undefined, {
        shiftId: input.shift.id,
      })
    }

    // Lookup price from input or database
    let price = input.unitPrice
    if (!price || price <= 0) {
      const prices = await productService.getFuelPriceMap()
      price = prices[input.fuelCode] || PRODUCTION_STATION.fuelPrices[input.fuelCode as 'PMS'] || 14.8
    }

    const amount = validateSale({ fuelCode: input.fuelCode, litres: input.litres, unitPrice: price })

    const tx: ShiftTransaction = {
      id: `tx-${crypto.randomUUID()}`,
      shiftId: input.shift.id,
      attendantId: input.shift.attendantId,
      fuelCode: input.fuelCode,
      litres: Math.round(input.litres * 100) / 100,
      amount,
      unitPrice: price,
      method: input.method,
      customerRef: input.customerRef,
      recordedAt: new Date().toISOString(),
      syncStatus: 'PENDING',
    }
    await transactionRepo.add(tx)
    liveSyncBus.publish({ table: 'TRANSACTIONS', reason: 'INSERT', key: tx.id })

    // Recompute cumulative sales & payments from all recorded transactions for an audit-proof trail.
    return this.recalculateShiftTotals(input.shift.id)
  }

  /**
   * Updates an existing shift transaction.
   * STRICT ENFORCEMENT: Transactions can only be edited while shift.status === 'OPEN'.
   * Once submitted/closed, editing is permanently locked.
   */
  async updateTransaction(shiftId: string, txId: string, updates: UpdateTransactionInput): Promise<Shift> {
    const shift = await shiftRepo.getById(shiftId)
    if (!shift) {
      throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.', shiftId)
    }

    if (shift.status !== 'OPEN') {
      throw new DomainError(
        'SHIFT_LOCKED' as any,
        'Shift is closed/submitted and locked. Transactions cannot be edited after shift submission.',
        undefined,
        { shiftId, status: shift.status },
      )
    }

    const tx = await transactionRepo.getById(txId)
    if (!tx || tx.shiftId !== shiftId) {
      throw new DomainError('TRANSACTION_NOT_FOUND' as any, 'Transaction record not found.', txId)
    }

    const nextFuelCode = updates.fuelCode || tx.fuelCode
    const nextLitres = updates.litres !== undefined ? Math.max(0, updates.litres) : tx.litres
    let nextUnitPrice = updates.unitPrice !== undefined ? updates.unitPrice : tx.unitPrice

    if (!nextUnitPrice || nextUnitPrice <= 0) {
      const prices = await productService.getFuelPriceMap()
      nextUnitPrice = prices[nextFuelCode] || 14.8
    }

    const nextAmount = Math.round(nextLitres * nextUnitPrice * 100) / 100
    const nextMethod = updates.method || tx.method

    const updatedTx: ShiftTransaction = {
      ...tx,
      fuelCode: nextFuelCode,
      litres: Math.round(nextLitres * 100) / 100,
      unitPrice: nextUnitPrice,
      amount: nextAmount,
      method: nextMethod,
      customerRef: updates.customerRef !== undefined ? updates.customerRef : tx.customerRef,
      recordedAt: new Date().toISOString(),
    }

    await transactionRepo.update(updatedTx)
    liveSyncBus.publish({ table: 'TRANSACTIONS', reason: 'UPDATE', key: txId })

    return this.recalculateShiftTotals(shiftId)
  }

  /**
   * Deletes a transaction from an open shift.
   * Blocked if shift is closed/submitted.
   */
  async deleteTransaction(shiftId: string, txId: string): Promise<Shift> {
    const shift = await shiftRepo.getById(shiftId)
    if (!shift) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.', shiftId)

    if (shift.status !== 'OPEN') {
      throw new DomainError(
        'SHIFT_LOCKED' as any,
        'Shift is closed/submitted and locked. Transactions cannot be deleted.',
        undefined,
        { shiftId },
      )
    }

    await transactionRepo.delete(txId)
    liveSyncBus.publish({ table: 'TRANSACTIONS', reason: 'DELETE', key: txId })

    return this.recalculateShiftTotals(shiftId)
  }

  /**
   * Recomputes all cumulative sales, payment method breakdowns, and actual total
   * directly from current transactions for exact mathematical accuracy.
   */
  private async recalculateShiftTotals(shiftId: string): Promise<Shift> {
    const shift = await shiftRepo.getById(shiftId)
    if (!shift) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.', shiftId)

    const txs = await transactionRepo.listForShift(shiftId)
    const sales = this.aggregateSales(txs)
    const expectedTotal = sumSales(sales)

    const payments: PaymentsBreakdown = {
      CASH: 0,
      MOMO: 0,
      VOUCHER: 0,
      CREDIT: 0,
    }

    for (const tx of txs) {
      if (tx.method in payments) {
        payments[tx.method] = Math.round((payments[tx.method] + tx.amount) * 100) / 100
      }
    }

    const actualTotal = Math.round(
      (payments.CASH + payments.MOMO + payments.VOUCHER + payments.CREDIT) * 100,
    ) / 100

    const updated: Shift = {
      ...shift,
      sales,
      expectedTotal,
      payments,
      actualTotal,
      variance: Math.round((actualTotal - expectedTotal) * 100) / 100,
      updatedAt: new Date().toISOString(),
    }

    await shiftRepo.upsert(updated)
    liveSyncBus.publish({ table: 'SHIFTS', reason: 'UPDATE', key: updated.id })
    return updated
  }

  private aggregateSales(txs: ShiftTransaction[]): FuelSale[] {
    const map = new Map<FuelCode, FuelSale>()
    for (const tx of txs) {
      const existing = map.get(tx.fuelCode)
      if (existing) {
        existing.litres = Math.round((existing.litres + tx.litres) * 100) / 100
        existing.amount = Math.round((existing.amount + tx.amount) * 100) / 100
      } else {
        map.set(tx.fuelCode, {
          fuelCode: tx.fuelCode,
          litres: tx.litres,
          unitPrice: tx.unitPrice,
          amount: tx.amount,
        })
      }
    }
    return Array.from(map.values())
  }

  async closeShift(shift: Shift, closingReadings: MeterReading[], notes: string | null): Promise<Shift> {
    if (shift.status !== 'OPEN') {
      throw new DomainError('SHIFT_ALREADY_CLOSED', 'Shift is already closed.', undefined, { shiftId: shift.id })
    }

    const prices = await productService.getFuelPriceMap()
    const closed = finalizeClosedShift(shift, closingReadings, prices as any, notes)
    await shiftRepo.upsert(closed)
    liveSyncBus.publish({ table: 'SHIFTS', reason: 'UPDATE', key: closed.id })

    await syncQueueRepo.add({
      id: `sync-shift-${closed.id}`,
      entityType: 'SHIFT',
      entityId: closed.id,
      status: 'PENDING',
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    liveSyncBus.publish({ table: 'SYNC_QUEUE', reason: 'INSERT', key: `sync-shift-${closed.id}` })

    return closed
  }

  async listShifts(attendantId: string): Promise<Shift[]> {
    return shiftRepo.listForAttendant(attendantId)
  }

  static saleAmount(litres: number, unitPrice: number): number {
    return saleAmount(litres, unitPrice)
  }
}

export const shiftService = new ShiftService()