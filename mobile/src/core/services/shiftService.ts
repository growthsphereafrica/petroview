/**
 * Shift lifecycle service for the universal build.
 * Enforces the same rules as the web shiftService: readings validation,
 * cash-book reconciliation and sync-queue enqueueing.
 */

import { DomainError, describeError } from '../domain/errors'
import { PRODUCTION_STATION, PRODUCTION_PUMPS, uid, getStationPumps } from '../domain/config'
import type { Attendant, PaymentsBreakdown, Shift, SyncQueueItem } from '../domain/types'
import {
  getActiveShiftForAttendant,
  getShift,
  saveShift,
  enqueue,
  pendingSyncCount,
  addAudit,
} from '../infra/repositories'
import { mobileProductService } from './productService'

export interface OpenShiftInput {
  attendant: Attendant
  pumpId: string
  openingReadings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>
}

export interface RecordSaleInput {
  shiftId: string
  fuelCode: 'PMS' | 'AGO' | 'DPK' | 'KERO'
  litres: number
  method: 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'
}

export interface CloseShiftInput {
  shiftId: string
  closingReadings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>
  notes?: string
  remittance?: Partial<PaymentsBreakdown>
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export class ShiftService {
  async openShift(input: OpenShiftInput): Promise<Shift> {
    const { attendant, pumpId, openingReadings } = input
    const existing = await getActiveShiftForAttendant(attendant.id)
    if (existing) {
      throw new DomainError('SHIFT_ALREADY_EXISTS', 'A shift is already open.')
    }

    const stationPumps = getStationPumps(attendant.stationId)
    const pump = stationPumps.find(p => p.id === pumpId) || PRODUCTION_PUMPS.find(p => p.id === pumpId)
    if (!pump) throw new DomainError('READINGS_EMPTY', 'Unknown pump.')

    const readings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }> = {}
    let readingsTotal = 0

    const providedKeys = Object.keys(openingReadings).filter(k => openingReadings[k] && typeof openingReadings[k].value === 'number')
    if (providedKeys.length === 0) {
      throw new DomainError('READINGS_EMPTY', 'At least one nozzle opening reading is required.')
    }

    for (const key of providedKeys) {
      const r = openingReadings[key]
      if (r.value < 0) {
        throw new DomainError('READING_NEGATIVE', `Reading cannot be negative.`, r.fuelCode || key)
      }
      if (r.value > 1_000_000) {
        throw new DomainError('READING_OUT_OF_RANGE', 'Reading out of range.', r.fuelCode || key)
      }
      const nozzleIndex = r.nozzleIndex ?? (parseInt(key.replace(/\D/g, ''), 10) || 1)
      const isDuplicate = pump.fuels.filter(f => f === r.fuelCode).length > 1
      const defaultLabel = isDuplicate ? `Side ${nozzleIndex} (${r.fuelCode})` : (r.fuelCode || `Nozzle ${nozzleIndex}`)
      const label = r.nozzleLabel || defaultLabel
      readings[key] = {
        fuelCode: r.fuelCode || pump.fuels[nozzleIndex - 1] || 'PMS',
        value: round2(r.value),
        nozzleIndex,
        nozzleLabel: label,
      }
      readingsTotal += round2(r.value)
    }

    const now = new Date().toISOString()
    const shift: Shift = {
      id: uid('shift'),
      number: `SH-${Date.now().toString().slice(-6)}`,
      stationId: attendant.stationId || PRODUCTION_STATION.id,
      stationName: (attendant as any).stationName || PRODUCTION_STATION.name,
      companyId: attendant.companyId,
      companyShortCode: attendant.companyShortCode,
      attendantId: attendant.id,
      attendantName: attendant.fullName,
      pumpId,
      pumpName: pump.name,
      assignedNozzles: Object.values(readings).map(r => r.nozzleLabel || (r.nozzleIndex ? `Nozzle ${r.nozzleIndex}` : r.fuelCode)),
      openedAt: now,
      closedAt: null,
      openingReadings: readings as never,
      closingReadings: null,
      sales: [],
      payments: { CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
      readingsTotal,
      salesTotal: 0,
      actualTotal: 0,
      variance: 0,
      status: 'OPEN',
      reviewNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      syncStatus: 'PENDING',
      updatedAt: now,
      version: 1,
    }

    await saveShift(shift)
    await addAudit({
      id: uid('audit'),
      action: 'SHIFT_OPENED',
      actorId: attendant.id,
      actorRole: 'ATTENDANT',
      targetId: shift.id,
      notes: `${attendant.fullName} opened ${shift.number} on ${pump.name}`,
      timestamp: now,
    })
    return shift
  }

  async recordSale(input: RecordSaleInput): Promise<Shift> {
    const shift = await getShift(input.shiftId)
    if (!shift) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.')
    if (shift.status !== 'OPEN') throw new DomainError('SHIFT_NOT_OPEN', 'Shift is not open.')

    const unitPrice = PRODUCTION_STATION.fuelPrices[input.fuelCode]
    if (input.litres <= 0) {
      throw new DomainError('SALE_ZERO_LITRES', 'Sale volume must be greater than zero.')
    }
    const amount = round2(input.litres * unitPrice)
    if (Math.abs(amount - round2(amount)) > 0.01) {
      throw new DomainError('SALE_AMOUNT_MISMATCH', 'Sale amount mismatch.')
    }

    const sale = { fuelCode: input.fuelCode, litres: round2(input.litres), unitPrice, amount }
    const shiftNew: Shift = {
      ...shift,
      sales: [...shift.sales, sale],
      payments: {
        ...shift.payments,
        [input.method]: round2((shift.payments as PaymentsBreakdown)[input.method] + amount),
      },
      actualTotal: round2(shift.actualTotal + amount),
      salesTotal: round2(shift.salesTotal + amount),
      updatedAt: new Date().toISOString(),
      version: shift.version + 1,
    }
    await saveShift(shiftNew)
    return shiftNew
  }

  async closeShift(input: CloseShiftInput): Promise<Shift> {
    const shift = await getShift(input.shiftId)
    if (!shift) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.')
    if (shift.status !== 'OPEN') throw new DomainError('SHIFT_ALREADY_CLOSED', 'Shift already closed.')

    const closing: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }> = {}
    let readingsTotal = 0
    let meteredSalesTotal = 0
    const salesByFuel: Record<string, { litres: number; amount: number; unitPrice: number }> = {}

    const dynamicPrices = await mobileProductService.getFuelPrices().catch(() => ({} as Record<string, number>))

    for (const [key, r] of Object.entries(input.closingReadings)) {
      if (typeof r.value !== 'number') {
        throw new DomainError('READINGS_EMPTY', `Closing reading required for ${key}.`, r.fuelCode || key)
      }
      const openingEntry = shift.openingReadings[key] ??
        Object.values(shift.openingReadings).find((o: any) => o.nozzleIndex === r.nozzleIndex) ??
        shift.openingReadings[r.fuelCode]
      const opening = openingEntry?.value ?? 0
      if (r.value < 0) {
        throw new DomainError('READING_NEGATIVE', 'Reading cannot be negative.', r.fuelCode || key)
      }
      if (r.value < opening) {
        throw new DomainError('CLOSING_BELOW_OPENING', 'Closing below opening.', r.fuelCode || key)
      }
      closing[key] = {
        fuelCode: r.fuelCode,
        value: round2(r.value),
        nozzleIndex: r.nozzleIndex,
        nozzleLabel: r.nozzleLabel,
      }
      readingsTotal += round2(r.value)

      const litres = round2(r.value - opening)
      const unitPrice = dynamicPrices[r.fuelCode] ?? PRODUCTION_STATION.fuelPrices[r.fuelCode as keyof typeof PRODUCTION_STATION.fuelPrices] ?? 14.80
      const amount = round2(litres * unitPrice)
      meteredSalesTotal = round2(meteredSalesTotal + amount)

      if (!salesByFuel[r.fuelCode]) {
        salesByFuel[r.fuelCode] = { litres: 0, amount: 0, unitPrice }
      }
      salesByFuel[r.fuelCode].litres = round2(salesByFuel[r.fuelCode].litres + litres)
      salesByFuel[r.fuelCode].amount = round2(salesByFuel[r.fuelCode].amount + amount)
    }

    const salesList = Object.entries(salesByFuel).map(([fuelCode, s]) => ({
      fuelCode,
      litres: s.litres,
      unitPrice: s.unitPrice,
      amount: s.amount,
    }))

    const payments: PaymentsBreakdown = input.remittance
      ? {
          CASH: round2(input.remittance.CASH ?? 0),
          MOMO: round2(input.remittance.MOMO ?? 0),
          VOUCHER: round2(input.remittance.VOUCHER ?? 0),
          CREDIT: round2(input.remittance.CREDIT ?? 0),
        }
      : (shift.payments as PaymentsBreakdown)
    const actualTotal = round2(payments.CASH + payments.MOMO + payments.VOUCHER + payments.CREDIT)
    const variance = round2(actualTotal - meteredSalesTotal)
    const now = new Date().toISOString()

    const closed: Shift = {
      ...shift,
      closedAt: now,
      closingReadings: closing as never,
      sales: salesList.length > 0 ? (salesList as any) : shift.sales,
      salesTotal: meteredSalesTotal,
      payments,
      actualTotal,
      readingsTotal,
      variance,
      status: 'CLOSED',
      reviewNotes: input.notes ?? null,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now,
      version: shift.version + 1,
    }

    await saveShift(closed)
    await enqueue({
      id: uid('sync'),
      type: 'SHIFT',
      entityType: 'SHIFT',
      refId: closed.id,
      payload: closed,
      status: 'PENDING',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    })
    await addAudit({
      id: uid('audit'),
      action: 'SHIFT_CLOSED',
      actorId: shift.attendantId,
      actorRole: 'ATTENDANT',
      targetId: closed.id,
      notes: `${shift.number} closed with variance GHS ${variance.toFixed(2)}`,
      timestamp: now,
    })
    return closed
  }

  async resubmitShift(input: {
    shiftId: string
    pumpId?: string
    openingReadings?: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>
    closingReadings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>
    notes?: string
    remittance?: Partial<PaymentsBreakdown>
  }): Promise<Shift> {
    const shift = await getShift(input.shiftId)
    if (!shift) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.')
    if (shift.status !== 'REJECTED' && shift.status !== 'CLOSED') {
      throw new DomainError('INVALID_STATE' as any, 'Only rejected or closed shifts can be resubmitted with corrections.')
    }

    const workingPumpId = input.pumpId || shift.pumpId
    const workingOpenings = input.openingReadings || shift.openingReadings

    const closing: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }> = {}
    let readingsTotal = 0
    let meteredSalesTotal = 0
    const salesByFuel: Record<string, { litres: number; amount: number; unitPrice: number }> = {}

    const dynamicPrices = await mobileProductService.getFuelPrices().catch(() => ({} as Record<string, number>))

    for (const [key, r] of Object.entries(input.closingReadings)) {
      if (typeof r.value !== 'number') {
        throw new DomainError('READINGS_EMPTY', `Closing reading required for ${key}.`, r.fuelCode || key)
      }
      const openingEntry = workingOpenings[key] ??
        Object.values(workingOpenings).find((o: any) => o.nozzleIndex === r.nozzleIndex) ??
        workingOpenings[r.fuelCode]
      const opening = openingEntry?.value ?? 0
      if (r.value < 0) {
        throw new DomainError('READING_NEGATIVE', 'Reading cannot be negative.', r.fuelCode || key)
      }
      if (r.value < opening) {
        throw new DomainError('CLOSING_BELOW_OPENING', 'Closing below opening.', r.fuelCode || key)
      }
      closing[key] = {
        fuelCode: r.fuelCode,
        value: round2(r.value),
        nozzleIndex: r.nozzleIndex,
        nozzleLabel: r.nozzleLabel,
      }
      readingsTotal += round2(r.value)

      const litres = round2(r.value - opening)
      const unitPrice = dynamicPrices[r.fuelCode] ?? PRODUCTION_STATION.fuelPrices[r.fuelCode as keyof typeof PRODUCTION_STATION.fuelPrices] ?? 14.80
      const amount = round2(litres * unitPrice)
      meteredSalesTotal = round2(meteredSalesTotal + amount)

      if (!salesByFuel[r.fuelCode]) {
        salesByFuel[r.fuelCode] = { litres: 0, amount: 0, unitPrice }
      }
      salesByFuel[r.fuelCode].litres = round2(salesByFuel[r.fuelCode].litres + litres)
      salesByFuel[r.fuelCode].amount = round2(salesByFuel[r.fuelCode].amount + amount)
    }

    const salesList = Object.entries(salesByFuel).map(([fuelCode, s]) => ({
      fuelCode,
      litres: s.litres,
      unitPrice: s.unitPrice,
      amount: s.amount,
    }))

    const payments: PaymentsBreakdown = input.remittance
      ? {
          CASH: round2(input.remittance.CASH ?? 0),
          MOMO: round2(input.remittance.MOMO ?? 0),
          VOUCHER: round2(input.remittance.VOUCHER ?? 0),
          CREDIT: round2(input.remittance.CREDIT ?? 0),
        }
      : (shift.payments as PaymentsBreakdown)
    const actualTotal = round2(payments.CASH + payments.MOMO + payments.VOUCHER + payments.CREDIT)
    const variance = round2(actualTotal - meteredSalesTotal)
    const now = new Date().toISOString()
    const attendantCorrectionNote = input.notes ? `[Corrected & Resubmitted] ${input.notes}` : '[Resubmitted with corrections]'

    const resubmitted: Shift = {
      ...shift,
      pumpId: workingPumpId,
      pumpName: pump.name,
      assignedNozzles: Object.values(workingOpenings).map((r: any) => r.nozzleLabel || (r.nozzleIndex ? `Nozzle ${r.nozzleIndex}` : r.fuelCode)),
      openingReadings: workingOpenings,
      closedAt: now,
      closingReadings: closing as never,
      sales: salesList.length > 0 ? (salesList as any) : shift.sales,
      salesTotal: meteredSalesTotal,
      payments,
      actualTotal,
      readingsTotal,
      variance,
      status: 'CLOSED',
      reviewNotes: attendantCorrectionNote,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: now,
      version: shift.version + 1,
    }

    await saveShift(resubmitted)

    try {
      const { cloudResubmitShift } = await import('../infra/cloudApi')
      await cloudResubmitShift(resubmitted.id, {
        pumpId: resubmitted.pumpId,
        pumpName: resubmitted.pumpName,
        assignedNozzles: resubmitted.assignedNozzles,
        openingReadings: Object.values(resubmitted.openingReadings ?? {}),
        closingReadings: Object.values(resubmitted.closingReadings ?? {}),
        sales: resubmitted.sales,
        expectedTotal: resubmitted.salesTotal,
        payments: resubmitted.payments,
        actualTotal: resubmitted.actualTotal,
        variance: resubmitted.variance,
        notes: resubmitted.reviewNotes,
      })
      resubmitted.syncStatus = 'SYNCED'
      await saveShift(resubmitted)
    } catch {
      await enqueue({
        id: uid('sync'),
        type: 'SHIFT',
        entityType: 'SHIFT',
        refId: resubmitted.id,
        payload: resubmitted,
        status: 'PENDING',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
    }

    await addAudit({
      id: uid('audit'),
      action: 'SHIFT_CLOSED',
      actorId: shift.attendantId,
      actorRole: 'ATTENDANT',
      targetId: resubmitted.id,
      notes: `${shift.number} corrected & resubmitted with variance GHS ${variance.toFixed(2)}`,
      timestamp: now,
    })

    return resubmitted
  }

  async pendingCount(): Promise<number> {
    return pendingSyncCount()
  }
}

export const shiftService = new ShiftService()

export async function syncNow(): Promise<{ synced: number; failed: number; unreachable: boolean }> {
  const { listSyncQueue, updateSyncItem } = await import('../infra/repositories')
  const { uploadShiftsToCloud, getCloudApiBase } = await import('../infra/cloudApi')
  const items = await listSyncQueue()
  const pending = items.filter(i => i.status === 'PENDING' || i.status === 'FAILED')
  if (pending.length === 0) return { synced: 0, failed: 0, unreachable: false }

  if (!getCloudApiBase()) {
    for (const item of pending) {
      await updateSyncItem({ ...item, status: 'SYNCED', attempts: item.attempts + 1, updatedAt: new Date().toISOString() })
    }
    return { synced: pending.length, failed: 0, unreachable: false }
  }

  const shifts = await Promise.all(
    pending.filter(i => i.type === 'SHIFT').map(async i => {
      const { getShift } = await import('../infra/repositories')
      return getShift(i.refId)
    }),
  )
  const toUpload = shifts.filter((s): s is Shift => s !== null)

  let result: Awaited<ReturnType<typeof uploadShiftsToCloud>>
  try {
    result = await uploadShiftsToCloud(toUpload)
  } catch {
    return { synced: 0, failed: pending.length, unreachable: true }
  }

  let synced = 0
  let failed = 0
  const now = new Date().toISOString()
  for (const item of pending) {
    const ok = result.accepted.includes(item.refId)
    const rejected = result.rejected.find(r => r.id === item.refId)
    if (ok || item.type !== 'SHIFT') {
      await updateSyncItem({ ...item, status: 'SYNCED', attempts: item.attempts + 1, updatedAt: now })
      synced += 1
    } else {
      const attempts = item.attempts + 1
      await updateSyncItem({ ...item, status: 'FAILED', attempts, updatedAt: now, ...(rejected ? { lastError: rejected.reason } : {}) })
      failed += 1
    }
  }
  return { synced, failed, unreachable: false }
}

export { describeError, DomainError }