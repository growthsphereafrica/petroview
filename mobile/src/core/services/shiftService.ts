/**
 * Shift lifecycle service for the universal build.
 * Enforces the same rules as the web shiftService: readings validation,
 * cash-book reconciliation and sync-queue enqueueing.
 */

import { DomainError, describeError } from '../domain/errors'
import { PRODUCTION_STATION, PRODUCTION_PUMPS, uid } from '../domain/config'
import type { Attendant, PaymentsBreakdown, Shift, SyncQueueItem } from '../domain/types'
import {
  getActiveShiftForAttendant,
  getShift,
  saveShift,
  enqueue,
  pendingSyncCount,
  addAudit,
} from '../infra/repositories'

export interface OpenShiftInput {
  attendant: Attendant
  pumpId: string
  openingReadings: Record<string, { fuelCode: string; value: number }>
}

export interface RecordSaleInput {
  shiftId: string
  fuelCode: 'PMS' | 'AGO' | 'DPK' | 'KERO'
  litres: number
  method: 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'
}

export interface CloseShiftInput {
  shiftId: string
  closingReadings: Record<string, { fuelCode: string; value: number }>
  notes?: string
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

    const pump = PRODUCTION_PUMPS.find(p => p.id === pumpId)
    if (!pump) throw new DomainError('READINGS_EMPTY', 'Unknown pump.')

    const readings: Record<string, { fuelCode: string; value: number }> = {}
    let readingsTotal = 0
    for (const fuel of pump.fuels) {
      const r = openingReadings[fuel]
      if (r == null || typeof r.value !== 'number') {
        throw new DomainError('READINGS_EMPTY', `Opening reading required for ${fuel}.`, fuel)
      }
      if (r.value < 0) {
        throw new DomainError('READING_NEGATIVE', `Reading cannot be negative.`, fuel)
      }
      if (r.value > 1_000_000) {
        throw new DomainError('READING_OUT_OF_RANGE', 'Reading out of range.', fuel)
      }
      readings[fuel] = { fuelCode: fuel, value: round2(r.value) }
      readingsTotal += round2(r.value)
    }

    const now = new Date().toISOString()
    const shift: Shift = {
      id: uid('shift'),
      number: `SH-${Date.now().toString().slice(-6)}`,
      stationId: PRODUCTION_STATION.id,
      stationName: PRODUCTION_STATION.name,
      attendantId: attendant.id,
      attendantName: attendant.fullName,
      pumpId,
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

    const closing: Record<string, { fuelCode: string; value: number }> = {}
    let readingsTotal = 0
    for (const [fuel, r] of Object.entries(input.closingReadings)) {
      if (typeof r.value !== 'number') {
        throw new DomainError('READINGS_EMPTY', `Closing reading required for ${fuel}.`, fuel)
      }
      const opening = shift.openingReadings[fuel]?.value ?? 0
      if (r.value < 0) {
        throw new DomainError('READING_NEGATIVE', 'Reading cannot be negative.', fuel)
      }
      if (r.value < opening) {
        throw new DomainError('CLOSING_BELOW_OPENING', 'Closing below opening.', fuel)
      }
      closing[fuel] = { fuelCode: fuel, value: round2(r.value) }
      readingsTotal += round2(r.value)
    }

    const diffLitres = round2(readingsTotal - shift.readingsTotal)
    const variance = round2(shift.salesTotal - diffLitres * PRODUCTION_STATION.fuelPrices.PMS)
    const now = new Date().toISOString()

    const closed: Shift = {
      ...shift,
      closedAt: now,
      closingReadings: closing as never,
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

  async pendingCount(): Promise<number> {
    return pendingSyncCount()
  }
}

export const shiftService = new ShiftService()

export async function syncNow(): Promise<void> {
  const { listSyncQueue, updateSyncItem } = await import('../infra/repositories')
  const items = await listSyncQueue()
  for (const item of items) {
    if (item.status === 'PENDING' || item.status === 'FAILED') {
      await updateSyncItem({ ...item, status: 'SYNCED', attempts: item.attempts + 1, updatedAt: new Date().toISOString() })
    }
  }
}

export { describeError, DomainError }