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
  Product,
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
  products!: Table<Product, string>
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
  }
}

export const prodDb = new ProductionDatabase()

function cleanCode(code: string): string {
  return (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Seeds platform Super Super Admin, default enterprise OMCs, stations,
 * HQ Admins, Station Managers, Fuel Attendants, and Products.
 */
export async function seedProductionData(): Promise<boolean> {
  const now = new Date().toISOString()

  // 1. Always guarantee SUPER-ADMIN is seeded and active with PIN 7256
  try {
    const { salt: saSalt, hash: saHash } = await hashPin('7256')
    const allSups = await prodDb.supervisors.toArray()
    const existingSuperAdmin = allSups.find(
      s => cleanCode(s.employeeCode) === 'SUPERADMIN' || s.isSuperAdmin === true || s.id === 'sup-super-admin',
    )

    await prodDb.supervisors.put({
      id: existingSuperAdmin ? existingSuperAdmin.id : 'sup-super-admin',
      employeeCode: 'SUPER-ADMIN',
      fullName: 'PetroView Platform Master Admin',
      pinSalt: saSalt,
      pinHash: saHash,
      stationId: 'STN-PV-01',
      phone: '030 000 0000',
      isHeadOffice: true,
      isSuperAdmin: true,
      approvalStatus: 'APPROVED',
      approvedAt: now,
      approvedBy: 'System Master',
      active: true,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: existingSuperAdmin?.createdAt || now,
    })
  } catch (err) {
    console.error('Error seeding SUPER-ADMIN:', err)
  }

  // 2. Default Fuel Products only (PMS, AGO, DPK, KERO)
  // All companies, stations, supervisors, and attendants are provisioned by the Super Admin / OMC admin.

  // 6. Seed Default Products
  try {
    const defaultProducts: Product[] = [
      {
        id: 'prod-pms',
        code: 'PMS',
        name: 'Super Petrol (PMS)',
        category: 'FUEL',
        unitPrice: 14.8,
        unit: 'Litre',
        color: '#22c55e',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-ago',
        code: 'AGO',
        name: 'Diesel (AGO)',
        category: 'FUEL',
        unitPrice: 15.2,
        unit: 'Litre',
        color: '#3b82f6',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-dpk',
        code: 'DPK',
        name: 'Dual Purpose Kerosene (DPK)',
        category: 'FUEL',
        unitPrice: 13.9,
        unit: 'Litre',
        color: '#f97316',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-kero',
        code: 'KERO',
        name: 'Kerosene (KERO)',
        category: 'FUEL',
        unitPrice: 13.5,
        unit: 'Litre',
        color: '#a855f7',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ]
    for (const p of defaultProducts) {
      await prodDb.products.put(p)
    }
  } catch (err) {
    console.error('Error seeding products:', err)
  }

  // 7. Auto-activate & approve any self-registered accounts previously pending
  try {
    const allAtts = await prodDb.attendants.toArray()
    for (const a of allAtts) {
      if (a.approvalStatus === 'PENDING' || !a.active) {
        await prodDb.attendants.update(a.id, {
          approvalStatus: 'APPROVED',
          active: true,
          approvedAt: now,
          approvedBy: 'System Auto-Approval',
        })
      }
    }

    const allSupsList = await prodDb.supervisors.toArray()
    for (const s of allSupsList) {
      if (s.approvalStatus === 'PENDING' || !s.active) {
        await prodDb.supervisors.update(s.id, {
          approvalStatus: 'APPROVED',
          active: true,
          approvedAt: now,
          approvedBy: 'System Auto-Approval',
        })
      }
    }
  } catch (err) {
    console.error('Error auto-approving staff:', err)
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
  await prodDb.products.clear()
  await seedProductionData()
}