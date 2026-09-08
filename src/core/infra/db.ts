/**
 * Production persistence layer built on Dexie (IndexedDB).
 * Uses a dedicated database name so the production core never collides
 * with the demo/sandbox database.
 */

import Dexie, { type Table } from 'dexie'
import { hashPin } from './password'
import { PRODUCTION_PUMPS, PRODUCTION_STATION } from '../domain/config'
import { emptyPayments, saleAmount } from '../domain/rules'
import type {
  AuditEntry,
  Attendant,
  AttendantSession,
  ReceiptRecord,
  Shift,
  ShiftTransaction,
  Supervisor,
  SupervisorSession,
  SyncQueueItem,
} from '../domain/types'

export class ProductionDatabase extends Dexie {
  attendants!: Table<Attendant, string>
  sessions!: Table<AttendantSession, string>
  supervisors!: Table<Supervisor, string>
  supervisorSessions!: Table<SupervisorSession, string>
  shifts!: Table<Shift, string>
  transactions!: Table<ShiftTransaction, string>
  receipts!: Table<ReceiptRecord, string>
  syncQueue!: Table<SyncQueueItem, string>
  auditLog!: Table<AuditEntry, string>

  constructor() {
    super('MasterViewProductionDB')
    this.version(1).stores({
      attendants: 'id, employeeCode, active',
      sessions: 'id, token, attendantId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
    })
    this.version(2).stores({
      attendants: 'id, employeeCode, stationId, active',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, active',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
    })
    this.version(3).stores({
      attendants: 'id, employeeCode, stationId, active',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, active',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
      auditLog: 'id, action, actorId, actorRole, targetId, timestamp',
    })
  }
}

export const prodDb = new ProductionDatabase()

export interface SeedAttendant {
  employeeCode: string
  fullName: string
  pin: string
  pumpId: string
  stationId: string
}

/** Registered production attendants. PINs are documented for the demo device. */
export const SEED_ATTENDANTS: SeedAttendant[] = [
  { employeeCode: 'ATT1001', fullName: 'Aisha Boateng', pin: '2024', pumpId: 'pump-1', stationId: 'STN-GV-042' },
  { employeeCode: 'ATT1002', fullName: 'Kofi Asante', pin: '3319', pumpId: 'pump-2', stationId: 'STN-GV-042' },
  { employeeCode: 'ATT1003', fullName: 'Nana Yaw Owusu', pin: '1187', pumpId: 'pump-3', stationId: 'STN-GV-042' },
  { employeeCode: 'ATT1004', fullName: 'Esi Mensah', pin: '5520', pumpId: 'pump-4', stationId: 'STN-GV-042' },
  { employeeCode: 'ATT2001', fullName: 'Kwabena Owusu', pin: '4726', pumpId: 'pump-1', stationId: 'STN-AB-015' },
  { employeeCode: 'ATT3001', fullName: 'Adjoa Baidoo', pin: '8391', pumpId: 'pump-1', stationId: 'STN-TH-021' },
]

interface SeedSupervisor {
  employeeCode: string
  fullName: string
  pin: string
  stationId: string
}

export const SEED_SUPERVISORS: SeedSupervisor[] = [
  { employeeCode: 'SUP1001', fullName: 'Kwame Mensah', pin: '5678', stationId: 'STN-GV-042' },
  { employeeCode: 'SUP1002', fullName: 'Ebenezer Osei', pin: '5678', stationId: 'STN-AB-015' },
  { employeeCode: 'SUP1003', fullName: 'Daniel Larbi', pin: '5678', stationId: 'STN-TH-021' },
]

function todayAt(daysAgo: number, hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

interface SeedShiftSpec {
  id: string
  number: string
  attendantId: string
  attendantName: string
  stationId: string
  stationName: string
  pumpId: string
  pumpName: string
  daysAgo: number
  startHour: number
  endHour: number
  opening: Record<string, number>
  closing: Record<string, number>
  payments: { CASH: number; MOMO: number; VOUCHER: number; CREDIT: number }
  status: Shift['status']
  notes: string | null
  reviewerNotes: string | null
  syncStatus: Shift['syncStatus']
}

function buildSeedShift(spec: SeedShiftSpec): Shift {
  const prices = PRODUCTION_STATION.fuelPrices
  const sales = (['PMS', 'AGO', 'DPK', 'KERO'] as const).map(fuel => {
    const o = spec.opening[fuel] ?? 0
    const c = spec.closing[fuel] ?? 0
    const litres = Math.max(0, c - o)
    return { fuelCode: fuel, litres, amount: saleAmount(litres, prices[fuel]), unitPrice: prices[fuel] }
  })
  const expectedTotal = sales.reduce((a, s) => a + s.amount, 0)
  const payments = { ...emptyPayments(), ...spec.payments }
  const actualTotal = payments.CASH + payments.MOMO + payments.VOUCHER + payments.CREDIT
  const openedAt = todayAt(spec.daysAgo, spec.startHour, 0)
  const closedAt = todayAt(spec.daysAgo, spec.endHour, 0)
  return {
    id: spec.id,
    number: spec.number,
    attendantId: spec.attendantId,
    attendantName: spec.attendantName,
    pumpId: spec.pumpId,
    pumpName: spec.pumpName,
    stationId: spec.stationId,
    stationName: spec.stationName,
    status: spec.status,
    openedAt,
    closedAt,
    openingReadings: (['PMS', 'AGO', 'DPK', 'KERO'] as const)
      .filter(f => Number.isFinite(spec.opening[f]))
      .map(f => ({ fuelCode: f, value: spec.opening[f] })),
    closingReadings: (['PMS', 'AGO', 'DPK', 'KERO'] as const)
      .filter(f => Number.isFinite(spec.closing[f]))
      .map(f => ({ fuelCode: f, value: spec.closing[f] })),
    sales,
    expectedTotal,
    payments,
    actualTotal,
    variance: Math.round((actualTotal - expectedTotal) * 100) / 100,
    notes: spec.notes,
    reviewerNotes: spec.reviewerNotes,
    syncStatus: spec.syncStatus,
    createdAt: openedAt,
    updatedAt: closedAt,
  }
}

const SEED_SHIFTS: SeedShiftSpec[] = [
  {
    id: 'hist-01',
    number: 'MVP-H0001',
    attendantId: 'att-att1001',
    attendantName: 'Aisha Boateng',
    stationId: 'STN-GV-042',
    stationName: 'Green Valley Main',
    pumpId: 'pump-1',
    pumpName: 'Pump 1',
    daysAgo: 0,
    startHour: 6,
    endHour: 14,
    opening: { PMS: 100000, AGO: 80000 },
    closing: { PMS: 100150, AGO: 80110 },
    payments: { CASH: 2000, MOMO: 1892, VOUCHER: 0, CREDIT: 0 },
    status: 'APPROVED',
    notes: null,
    reviewerNotes: 'Approved by Kwame Mensah. Reconciled to the pesewa.',
    syncStatus: 'SYNCED',
  },
  {
    id: 'hist-02',
    number: 'MVP-H0002',
    attendantId: 'att-att1002',
    attendantName: 'Kofi Asante',
    stationId: 'STN-GV-042',
    stationName: 'Green Valley Main',
    pumpId: 'pump-2',
    pumpName: 'Pump 2',
    daysAgo: 0,
    startHour: 8,
    endHour: 16,
    opening: { PMS: 50000, AGO: 40000 },
    closing: { PMS: 50200, AGO: 40120 },
    payments: { CASH: 2960, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'CLOSED',
    notes: 'Busy morning rush.',
    reviewerNotes: null,
    syncStatus: 'PENDING',
  },
  {
    id: 'hist-03',
    number: 'MVP-H0003',
    attendantId: 'att-att2001',
    attendantName: 'Kwabena Owusu',
    stationId: 'STN-AB-015',
    stationName: 'Airport Bypass Express',
    pumpId: 'pump-1',
    pumpName: 'Pump 1',
    daysAgo: 0,
    startHour: 7,
    endHour: 15,
    opening: { PMS: 30000, AGO: 25000 },
    closing: { PMS: 30160, AGO: 25250 },
    payments: { CASH: 3700, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'REJECTED',
    notes: 'Cash count shortfall at handover.',
    reviewerNotes: 'Rejected by Ebenezer Osei — GHS 100 unexplained cash shortage.',
    syncStatus: 'SYNCED',
  },
  {
    id: 'hist-04',
    number: 'MVP-H0004',
    attendantId: 'att-att3001',
    attendantName: 'Adjoa Baidoo',
    stationId: 'STN-TH-021',
    stationName: 'Takoradi Harbour Hub',
    pumpId: 'pump-1',
    pumpName: 'Pump 1',
    daysAgo: 0,
    startHour: 9,
    endHour: 17,
    opening: { PMS: 75000, AGO: 60000, DPK: 20000 },
    closing: { PMS: 75120, AGO: 60100, DPK: 20080 },
    payments: { CASH: 2908, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'CLOSED',
    notes: null,
    reviewerNotes: null,
    syncStatus: 'PENDING',
  },
  {
    id: 'hist-05',
    number: 'MVP-H0005',
    attendantId: 'att-att1001',
    attendantName: 'Aisha Boateng',
    stationId: 'STN-GV-042',
    stationName: 'Green Valley Main',
    pumpId: 'pump-1',
    pumpName: 'Pump 1',
    daysAgo: 1,
    startHour: 6,
    endHour: 14,
    opening: { PMS: 98500, AGO: 79000 },
    closing: { PMS: 98710, AGO: 79140 },
    payments: { CASH: 3080, MOMO: 1030, VOUCHER: 0, CREDIT: 0 },
    status: 'APPROVED',
    notes: null,
    reviewerNotes: 'Approved. Minor coin variance justified.',
    syncStatus: 'SYNCED',
  },
  {
    id: 'hist-06',
    number: 'MVP-H0006',
    attendantId: 'att-att2001',
    attendantName: 'Kwabena Owusu',
    stationId: 'STN-AB-015',
    stationName: 'Airport Bypass Express',
    pumpId: 'pump-1',
    pumpName: 'Pump 1',
    daysAgo: 1,
    startHour: 7,
    endHour: 15,
    opening: { PMS: 28000, AGO: 23000 },
    closing: { PMS: 28105, AGO: 23090 },
    payments: { CASH: 1554, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'APPROVED',
    notes: null,
    reviewerNotes: 'Approved without discrepancy.',
    syncStatus: 'SYNCED',
  },
]

async function buildSeedTransactions(): Promise<ShiftTransaction[]> {
  return [
    {
      id: `seed-tx-1`, shiftId: 'hist-01', attendantId: 'att-att1001',
      fuelCode: 'PMS', litres: 100, amount: 1480, unitPrice: 14.8, method: 'CASH', recordedAt: todayAt(0, 9, 15), syncStatus: 'SYNCED',
    },
    {
      id: `seed-tx-2`, shiftId: 'hist-01', attendantId: 'att-att1001',
      fuelCode: 'AGO', litres: 110, amount: 1672, unitPrice: 15.2, method: 'MOMO', recordedAt: todayAt(0, 10, 40), syncStatus: 'SYNCED',
    },
    {
      id: `seed-tx-3`, shiftId: 'hist-02', attendantId: 'att-att1002',
      fuelCode: 'PMS', litres: 200, amount: 2960, unitPrice: 14.8, method: 'CASH', recordedAt: todayAt(0, 12, 5), syncStatus: 'PENDING',
    },
    {
      id: `seed-tx-4`, shiftId: 'hist-04', attendantId: 'att-att3001',
      fuelCode: 'DPK', litres: 80, amount: 1112, unitPrice: 13.9, method: 'CASH', recordedAt: todayAt(0, 14, 20), syncStatus: 'PENDING',
    },
  ]
}

export async function seedProductionData(): Promise<boolean> {
  const count = await prodDb.attendants.count()
  if (count > 0) return false

  const now = new Date().toISOString()
  const attendants: Attendant[] = []

  for (const seed of SEED_ATTENDANTS) {
    const { salt, hash } = await hashPin(seed.pin)
    attendants.push({
      id: `att-${seed.employeeCode.toLowerCase()}`,
      employeeCode: seed.employeeCode,
      fullName: seed.fullName,
      pinSalt: salt,
      pinHash: hash,
      pumpId: PRODUCTION_PUMPS.some(p => p.id === seed.pumpId) ? seed.pumpId : null,
      stationId: seed.stationId,
      active: true,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: now,
    })
  }
  await prodDb.attendants.bulkAdd(attendants)

  const supervisors: Supervisor[] = []
  for (const seed of SEED_SUPERVISORS) {
    const { salt, hash } = await hashPin(seed.pin)
    supervisors.push({
      id: `sup-${seed.employeeCode.toLowerCase()}`,
      employeeCode: seed.employeeCode,
      fullName: seed.fullName,
      pinSalt: salt,
      pinHash: hash,
      stationId: seed.stationId,
      active: true,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: now,
    })
  }
  await prodDb.supervisors.bulkAdd(supervisors)

  const shifts = SEED_SHIFTS.map(buildSeedShift)
  await prodDb.shifts.bulkAdd(shifts)
  await prodDb.transactions.bulkAdd(await buildSeedTransactions())
  await prodDb.syncQueue.bulkAdd(
    shifts
      .filter(s => s.syncStatus === 'PENDING')
      .map(s => ({
        id: `sync-shift-${s.id}`,
        entityType: 'SHIFT' as const,
        entityId: s.id,
        status: 'PENDING' as const,
        attempts: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
  )

  return true
}

/** Clears all production data and re-seeds (used by reset in settings). */
export async function resetProductionData(): Promise<void> {
  await prodDb.transactions.clear()
  await prodDb.shifts.clear()
  await prodDb.receipts.clear()
  await prodDb.syncQueue.clear()
  await prodDb.sessions.clear()
  await prodDb.supervisorSessions.clear()
  await prodDb.auditLog.clear()
  await prodDb.attendants.clear()
  await prodDb.supervisors.clear()
  await seedProductionData()
}