/**
 * Production persistence layer built on Dexie (IndexedDB).
 * Uses a dedicated database name so the production core never collides
 * with the demo/sandbox database.
 */

import Dexie, { type Table } from 'dexie'
import { hashPin } from './password'
import type {
  AuditEntry,
  Attendant,
  AttendantSession,
  Company,
  CompanyStation,
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
  companies!: Table<Company, string>
  companyStations!: Table<CompanyStation, string>
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
    }).upgrade(async tx => {
      // One-time clean slate: wipe any previously demo-seeded data from browsers
      // that used the app before this release.
      for (const table of [
        'companies',
        'companyStations',
        'attendants',
        'sessions',
        'supervisors',
        'supervisorSessions',
        'shifts',
        'transactions',
        'receipts',
        'syncQueue',
        'auditLog',
      ] as const) {
        await tx.table(table).clear()
      }
    })
  }
}

export const prodDb = new ProductionDatabase()

/**
 * Ensures the platform always has its single super super admin account.
 * No demo/clone data is ever seeded into the production database — the app
 * starts completely empty and companies/staff are created by the SUPER-ADMIN.
 */
export async function seedProductionData(): Promise<boolean> {
  try {
    // Always guarantee SUPER-ADMIN is seeded and active with PIN 7256
    const { salt: saSalt, hash: saHash } = await hashPin('7256')
    const allSups = await prodDb.supervisors.toArray()
    const existingSuperAdmin = allSups.find(
      s => s.employeeCode?.trim().toUpperCase() === 'SUPER-ADMIN' || s.isSuperAdmin === true,
    )

    if (!existingSuperAdmin) {
      await prodDb.supervisors.add({
        id: 'sup-super-admin',
        employeeCode: 'SUPER-ADMIN',
        fullName: 'PetroView Platform Master Admin',
        pinSalt: saSalt,
        pinHash: saHash,
        stationId: 'STN-GV-042',
        phone: '030 000 0000',
        isHeadOffice: true,
        isSuperAdmin: true,
        approvalStatus: 'APPROVED',
        approvedAt: new Date().toISOString(),
        approvedBy: 'System Master',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: new Date().toISOString(),
      })
    } else {
      // Update hash and status to ensure 7256 is always active
      await prodDb.supervisors.update(existingSuperAdmin.id, {
        employeeCode: 'SUPER-ADMIN',
        pinSalt: saSalt,
        pinHash: saHash,
        isSuperAdmin: true,
        isHeadOffice: true,
        approvalStatus: 'APPROVED',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
      })
    }
  } catch (err) {
    console.error('Error in seedProductionData:', err)
  }

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
  await seedProductionData()
}