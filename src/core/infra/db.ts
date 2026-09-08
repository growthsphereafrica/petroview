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

  // 2. Seed Default OMCs
  try {
    const defaultCompanies: Company[] = [
      {
        id: 'COMP-PV',
        name: 'PetroView Oil & Gas Ltd',
        shortCode: 'PV',
        tagline: 'PetroView Downstream Smart Forecourt Operations',
        logoText: 'PV',
        primaryColor: '#F97316',
        primaryDark: '#0B2545',
        accentColor: '#F59E0B',
        currency: 'GHS',
        adminCode: 'PV-HQ01',
        adminName: 'PetroView HQ Administrator',
        phone: '030 200 1100',
        active: true,
        createdAt: now,
      },
      {
        id: 'COMP-GOIL',
        name: 'Ghana Oil Company (GOIL)',
        shortCode: 'GOIL',
        tagline: 'Good Energy · Ghana Oil Company',
        logoText: 'GOIL',
        primaryColor: '#EAB308',
        primaryDark: '#1E293B',
        accentColor: '#F59E0B',
        currency: 'GHS',
        adminCode: 'GOIL-HQ01',
        adminName: 'GOIL Operations HQ Admin',
        phone: '030 200 2200',
        active: true,
        createdAt: now,
      },
      {
        id: 'COMP-TOTAL',
        name: 'TotalEnergies Marketing Ghana',
        shortCode: 'TOTAL',
        tagline: 'Committed to Better Energy',
        logoText: 'TOTAL',
        primaryColor: '#EF4444',
        primaryDark: '#1E293B',
        accentColor: '#3B82F6',
        currency: 'GHS',
        adminCode: 'TOTAL-HQ01',
        adminName: 'TotalEnergies HQ Admin',
        phone: '030 200 3300',
        active: true,
        createdAt: now,
      },
      {
        id: 'COMP-SHELL',
        name: 'Shell (Vivo Energy Ghana)',
        shortCode: 'SHELL',
        tagline: 'Go Well with Shell',
        logoText: 'SHELL',
        primaryColor: '#FACC15',
        primaryDark: '#1E293B',
        accentColor: '#DC2626',
        currency: 'GHS',
        adminCode: 'SHELL-HQ01',
        adminName: 'Shell Ghana HQ Admin',
        phone: '030 200 4400',
        active: true,
        createdAt: now,
      },
    ]

    const allCompanies = await prodDb.companies.toArray()
    for (const comp of defaultCompanies) {
      const existingComp = allCompanies.find(
        c => c.id === comp.id || c.shortCode?.toUpperCase() === comp.shortCode.toUpperCase(),
      )
      await prodDb.companies.put({
        ...comp,
        id: existingComp ? existingComp.id : comp.id,
      })
    }
  } catch (err) {
    console.error('Error seeding companies:', err)
  }

  // 3. Seed Default Company Stations
  try {
    const defaultStations: CompanyStation[] = [
      {
        id: 'STN-PV-01',
        companyId: 'COMP-PV',
        name: 'Green Valley Main Flagship (PetroView)',
        code: 'PV-01',
        location: 'Accra - Tema Motorway Corridor',
        region: 'Greater Accra',
        pumpsCount: 4,
        supervisorName: 'Samuel Kofi Mensah',
        createdAt: now,
      },
      {
        id: 'STN-PV-02',
        companyId: 'COMP-PV',
        name: 'Airport City Express (PetroView)',
        code: 'PV-02',
        location: 'Liberation Road, Airport City',
        region: 'Greater Accra',
        pumpsCount: 4,
        supervisorName: 'Kwame Asante',
        createdAt: now,
      },
      {
        id: 'STN-GOIL-01',
        companyId: 'COMP-GOIL',
        name: 'GOIL Kwame Nkrumah Circle Flagship',
        code: 'GOIL-01',
        location: 'Ring Road Central, Circle',
        region: 'Greater Accra',
        pumpsCount: 6,
        supervisorName: 'Yaw Osei Tutu',
        createdAt: now,
      },
      {
        id: 'STN-GOIL-02',
        companyId: 'COMP-GOIL',
        name: 'GOIL Spintex Road Service Station',
        code: 'GOIL-02',
        location: 'Spintex Road, Accra',
        region: 'Greater Accra',
        pumpsCount: 4,
        supervisorName: 'Kofi Owusu',
        createdAt: now,
      },
      {
        id: 'STN-TOTAL-01',
        companyId: 'COMP-TOTAL',
        name: 'TotalEnergies 37 Flagship Station',
        code: 'TOTAL-01',
        location: 'Liberation Road, 37 Roundabout',
        region: 'Greater Accra',
        pumpsCount: 4,
        supervisorName: 'Kwesi Arthur',
        createdAt: now,
      },
      {
        id: 'STN-SHELL-01',
        companyId: 'COMP-SHELL',
        name: 'Shell Airport Bypass Express',
        code: 'SHELL-01',
        location: 'Airport Bypass Road, Accra',
        region: 'Greater Accra',
        pumpsCount: 4,
        supervisorName: 'Richard Appiah',
        createdAt: now,
      },
    ]

    for (const stn of defaultStations) {
      await prodDb.companyStations.put(stn)
    }
  } catch (err) {
    console.error('Error seeding stations:', err)
  }

  // 4. Seed Default HQ Admins & Station Managers (Supervisors)
  try {
    const { salt: hqSalt, hash: hqHash } = await hashPin('9999')
    const { salt: mgrSalt, hash: mgrHash } = await hashPin('1234')

    const defaultSupervisors: Supervisor[] = [
      // HQ Admins (PIN: 9999)
      {
        id: 'sup-pv-hq01',
        employeeCode: 'PV-HQ01',
        fullName: 'PetroView HQ Administrator',
        pinSalt: hqSalt,
        pinHash: hqHash,
        stationId: 'STN-PV-01',
        companyId: 'COMP-PV',
        companyShortCode: 'PV',
        phone: '030 200 1100',
        isHeadOffice: true,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Platform Master',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'sup-goil-hq01',
        employeeCode: 'GOIL-HQ01',
        fullName: 'GOIL Operations HQ Admin',
        pinSalt: hqSalt,
        pinHash: hqHash,
        stationId: 'STN-GOIL-01',
        companyId: 'COMP-GOIL',
        companyShortCode: 'GOIL',
        phone: '030 200 2200',
        isHeadOffice: true,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Platform Master',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'sup-total-hq01',
        employeeCode: 'TOTAL-HQ01',
        fullName: 'TotalEnergies HQ Admin',
        pinSalt: hqSalt,
        pinHash: hqHash,
        stationId: 'STN-TOTAL-01',
        companyId: 'COMP-TOTAL',
        companyShortCode: 'TOTAL',
        phone: '030 200 3300',
        isHeadOffice: true,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Platform Master',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'sup-shell-hq01',
        employeeCode: 'SHELL-HQ01',
        fullName: 'Shell Ghana HQ Admin',
        pinSalt: hqSalt,
        pinHash: hqHash,
        stationId: 'STN-SHELL-01',
        companyId: 'COMP-SHELL',
        companyShortCode: 'SHELL',
        phone: '030 200 4400',
        isHeadOffice: true,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Platform Master',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      // Station Managers (PIN: 1234)
      {
        id: 'sup-pv-acc-001-m',
        employeeCode: 'PV-ACC-001-M',
        fullName: 'Samuel Kofi Mensah (Manager)',
        pinSalt: mgrSalt,
        pinHash: mgrHash,
        stationId: 'STN-PV-01',
        companyId: 'COMP-PV',
        companyShortCode: 'PV',
        phone: '024 111 2233',
        isHeadOffice: false,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'PetroView HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'sup-goil001m',
        employeeCode: 'GOIL001M',
        fullName: 'Yaw Osei Tutu (Manager)',
        pinSalt: mgrSalt,
        pinHash: mgrHash,
        stationId: 'STN-GOIL-01',
        companyId: 'COMP-GOIL',
        companyShortCode: 'GOIL',
        phone: '024 222 3344',
        isHeadOffice: false,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'GOIL HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'sup-tot001m',
        employeeCode: 'TOT001M',
        fullName: 'Kwesi Arthur (Manager)',
        pinSalt: mgrSalt,
        pinHash: mgrHash,
        stationId: 'STN-TOTAL-01',
        companyId: 'COMP-TOTAL',
        companyShortCode: 'TOTAL',
        phone: '024 333 4455',
        isHeadOffice: false,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'TotalEnergies HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'sup-shell001m',
        employeeCode: 'SHELL001M',
        fullName: 'Richard Appiah (Manager)',
        pinSalt: mgrSalt,
        pinHash: mgrHash,
        stationId: 'STN-SHELL-01',
        companyId: 'COMP-SHELL',
        companyShortCode: 'SHELL',
        phone: '024 444 5566',
        isHeadOffice: false,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Shell HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
    ]

    const allSups = await prodDb.supervisors.toArray()
    for (const sup of defaultSupervisors) {
      const existingSup = allSups.find(
        s =>
          s.id === sup.id ||
          cleanCode(s.employeeCode) === cleanCode(sup.employeeCode) ||
          s.employeeCode?.trim().toUpperCase() === sup.employeeCode.toUpperCase(),
      )
      await prodDb.supervisors.put({
        ...sup,
        id: existingSup ? existingSup.id : sup.id,
        pinSalt: sup.pinSalt,
        pinHash: sup.pinHash,
        approvalStatus: 'APPROVED',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
      })
    }
  } catch (err) {
    console.error('Error seeding supervisors:', err)
  }

  // 5. Seed Default Fuel Attendants (PIN: 1234)
  try {
    const { salt: attSalt, hash: attHash } = await hashPin('1234')

    const defaultAttendants: Attendant[] = [
      {
        id: 'att-pv-acc-001-a',
        employeeCode: 'PV-ACC-001-A',
        fullName: 'Emmanuel Mensah (Attendant)',
        pinSalt: attSalt,
        pinHash: attHash,
        pumpId: 'pump-1',
        stationId: 'STN-PV-01',
        companyId: 'COMP-PV',
        companyShortCode: 'PV',
        phone: '024 555 6677',
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'PetroView HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'att-pv002a',
        employeeCode: 'PV002A',
        fullName: 'Grace Addo (Attendant)',
        pinSalt: attSalt,
        pinHash: attHash,
        pumpId: 'pump-2',
        stationId: 'STN-PV-01',
        companyId: 'COMP-PV',
        companyShortCode: 'PV',
        phone: '024 666 7788',
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'PetroView HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'att-goil001a',
        employeeCode: 'GOIL001A',
        fullName: 'Kojo Antwi (Attendant)',
        pinSalt: attSalt,
        pinHash: attHash,
        pumpId: 'pump-1',
        stationId: 'STN-GOIL-01',
        companyId: 'COMP-GOIL',
        companyShortCode: 'GOIL',
        phone: '024 777 8899',
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'GOIL HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'att-tot001a',
        employeeCode: 'TOT001A',
        fullName: 'Abena Boateng (Attendant)',
        pinSalt: attSalt,
        pinHash: attHash,
        pumpId: 'pump-1',
        stationId: 'STN-TOTAL-01',
        companyId: 'COMP-TOTAL',
        companyShortCode: 'TOTAL',
        phone: '024 888 9900',
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'TotalEnergies HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
      {
        id: 'att-shell001a',
        employeeCode: 'SHELL001A',
        fullName: 'Derrick Mensah (Attendant)',
        pinSalt: attSalt,
        pinHash: attHash,
        pumpId: 'pump-1',
        stationId: 'STN-SHELL-01',
        companyId: 'COMP-SHELL',
        companyShortCode: 'SHELL',
        phone: '024 999 0011',
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Shell HQ',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      },
    ]

    const allAtts = await prodDb.attendants.toArray()
    for (const att of defaultAttendants) {
      const existingAtt = allAtts.find(
        a =>
          a.id === att.id ||
          cleanCode(a.employeeCode) === cleanCode(att.employeeCode) ||
          a.employeeCode?.trim().toUpperCase() === att.employeeCode.toUpperCase(),
      )
      await prodDb.attendants.put({
        ...att,
        id: existingAtt ? existingAtt.id : att.id,
        pinSalt: att.pinSalt,
        pinHash: att.pinHash,
        approvalStatus: 'APPROVED',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
      })
    }
  } catch (err) {
    console.error('Error seeding attendants:', err)
  }

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