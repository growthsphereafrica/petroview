/**
 * Production shift lifecycle service.
 * Orchestrates: open shift -> opening readings -> sales/payments -> receipts -> closing -> close.
 * Every mutation persists to IndexedDB immediately (offline-first).
 */

import { DomainError } from '../domain/errors'
import { PRODUCTION_PUMPS, PRODUCTION_STATION } from '../domain/config'
import {
  applyPayment,
  computeFuelSales,
  emptyPayments,
  finalizeClosedShift,
  saleAmount,
  sumSales,
  validateMeterReading,
  validateReadingsSet,
  validateSale,
} from '../domain/rules'
import { shiftRepo, transactionRepo } from '../infra/repositories'
import { syncQueueRepo } from '../infra/repositories'
import { liveSyncBus } from './liveSyncBus'
import type {
  Attendant,
  FuelCode,
  FuelSale,
  MeterReading,
  PaymentMethod,
  Shift,
  ShiftTransaction,
} from '../domain/types'

export interface OpenShiftInput {
  attendant: Attendant
  pumpId: string
  openingReadings: MeterReading[]
}

export interface RecordSaleInput {
  shift: Shift
  fuelCode: FuelCode
  litres: number
  method: PaymentMethod
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
      sales: computeFuelSales(readings, readings, PRODUCTION_STATION.fuelPrices).map(s => ({ ...s, litres: 0, amount: 0 })),
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
      throw new DomainError('SHIFT_NOT_OPEN', 'Shift is not open.', undefined, { shiftId: input.shift.id })
    }

    const price = PRODUCTION_STATION.fuelPrices[input.fuelCode]
    if (!price) throw new DomainError('SHIFT_NOT_FOUND', 'Unknown fuel code.', input.fuelCode)

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

    // Recompute cumulative sales from recorded transactions for an audit-proof trail.
    const txs = await transactionRepo.listForShift(input.shift.id)
    const sales = this.aggregateSales(txs)
    const expectedTotal = sumSales(sales)
    const next = applyPayment(input.shift, this.paymentKey(input.method), amount)
    const updated: Shift = {
      ...next,
      sales,
      expectedTotal,
      variance: Math.round((next.actualTotal - expectedTotal) * 100) / 100,
      updatedAt: new Date().toISOString(),
    }

    await shiftRepo.upsert(updated)
    liveSyncBus.publish({ table: 'SHIFTS', reason: 'UPDATE', key: updated.id })
    return updated
  }

  private paymentKey(method: PaymentMethod): 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT' {
    return method
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

    const closed = finalizeClosedShift(shift, closingReadings, PRODUCTION_STATION.fuelPrices, notes)
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