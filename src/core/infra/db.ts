/**
 * Production persistence layer built on Dexie (IndexedDB).
 * Uses a dedicated database name so the production core never collides
 * with the demo/sandbox database.
 */

import Dexie, { type Table } from 'dexie'
import type {
  AuditEntry,
  Attendant,
  AttendantSession,
  Company,
  CompanyStation,
  Product,
  ReceiptRecord,
  Shift,
  ShiftTransaction,
  Supervisor,
  SupervisorSession,
  SyncQueueItem,
  StationExpense,
  TankReadingRecord,
} from '../domain/types'

export class ProductionDatabase extends Dexie {
  attendants!: Table<Attendant, string>
  sessions!: Table<AttendantSession, string>
  supervisors!: Table<Supervisor, string>
  supervisorSessions!: Table<SupervisorSession, string>
  shifts!: Table<Shift, string>
  transactions!: Table<ShiftTransaction, string>
  companies!: Table<Company, string>
  companyStations!: Table<CompanyStation, string>
  products!: Table<Product, string>
  expenses!: Table<StationExpense, string>
  receipts!: Table<ReceiptRecord, string>
  tankReadings!: Table<TankReadingRecord, string>
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
    this.version(4).stores({
      attendants: 'id, employeeCode, stationId, active, approvalStatus',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, stationId, active, approvalStatus, isHeadOffice',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
      auditLog: 'id, action, actorId, actorRole, targetId, timestamp',
    })
    this.version(5).stores({
      companies: 'id, shortCode, name, adminCode, active',
      companyStations: 'id, companyId, code, name',
      attendants: 'id, employeeCode, stationId, companyId, active, approvalStatus',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, stationId, companyId, active, approvalStatus, isHeadOffice, isSuperAdmin',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
      auditLog: 'id, action, actorId, actorRole, targetId, timestamp',
    })
    this.version(6).stores({
      companies: 'id, shortCode, name, adminCode, active',
      companyStations: 'id, companyId, code, name',
      attendants: 'id, employeeCode, stationId, companyId, active, approvalStatus',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, stationId, companyId, active, approvalStatus, isHeadOffice, isSuperAdmin',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
      auditLog: 'id, action, actorId, actorRole, targetId, timestamp',
    })
    this.version(7).stores({
      companies: 'id, shortCode, name, adminCode, active',
      companyStations: 'id, companyId, code, name',
      products: 'id, companyId, code, category, active',
      attendants: 'id, employeeCode, stationId, companyId, active, approvalStatus',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, stationId, companyId, active, approvalStatus, isHeadOffice, isSuperAdmin',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
      auditLog: 'id, action, actorId, actorRole, targetId, timestamp',
    })
    this.version(8).stores({
      companies: 'id, shortCode, name, adminCode, active',
      companyStations: 'id, companyId, code, name',
      products: 'id, companyId, code, category, active',
      expenses: 'id, stationId, companyId, date, category, status, createdAt',
      attendants: 'id, employeeCode, stationId, companyId, active, approvalStatus',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, stationId, companyId, active, approvalStatus, isHeadOffice, isSuperAdmin',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
      auditLog: 'id, action, actorId, actorRole, targetId, timestamp',
    })
    this.version(9).stores({
      companies: 'id, shortCode, name, adminCode, active',
      companyStations: 'id, companyId, code, name',
      products: 'id, companyId, code, category, active',
      expenses: 'id, stationId, companyId, date, category, status, createdAt',
      attendants: 'id, employeeCode, stationId, companyId, active, approvalStatus',
      sessions: 'id, token, attendantId, expiresAt',
      supervisors: 'id, employeeCode, stationId, companyId, active, approvalStatus, isHeadOffice, isSuperAdmin',
      supervisorSessions: 'id, token, supervisorId, expiresAt',
      shifts: 'id, number, attendantId, stationId, status, syncStatus, openedAt, createdAt',
      transactions: 'id, shiftId, fuelCode, method, recordedAt',
      receipts: 'id, shiftId, capturedAt',
      tankReadings: 'id, stationId, companyId, recordedBy, recordedAt, createdAt',
      syncQueue: 'id, entityType, entityId, status, attempts, nextRetryAt, createdAt',
      auditLog: 'id, action, actorId, actorRole, targetId, timestamp',
    })
  }
}

export const prodDb = new ProductionDatabase()

export async function seedProductionData(): Promise<boolean> {
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
  await prodDb.companies.clear()
  await prodDb.companyStations.clear()
  await prodDb.products.clear()
  await seedProductionData()
}