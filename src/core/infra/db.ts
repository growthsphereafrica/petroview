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
  }
}

export const prodDb = new ProductionDatabase()

export interface SeedCompany {
  id: string
  name: string
  shortCode: string
  tagline: string
  logoText: string
  primaryColor: string
  primaryDark: string
  accentColor: string
  currency: string
  adminCode: string
  adminName: string
  adminPin: string
  phone: string
  stations: { id: string; name: string; code: string; location: string; region: string; pumpsCount: number }[]
}

export const SEED_COMPANIES: SeedCompany[] = [
  {
    id: 'COMP-PV',
    name: 'PetroView Petroleum',
    shortCode: 'PV',
    tagline: 'Local-First Forecourt Operating System',
    logoText: 'PETROVIEW',
    primaryColor: '#F97316',
    primaryDark: '#C2410C',
    accentColor: '#F59E0B',
    currency: 'GHS',
    adminCode: 'PV-HQ01',
    adminName: 'PetroView Operations HQ',
    adminPin: '9999',
    phone: '030 200 1100',
    stations: [
      { id: 'STN-GV-042', name: 'Green Valley Main', code: 'GV-042', location: 'Accra - Tema Motorway Corridor', region: 'Greater Accra', pumpsCount: 4 },
      { id: 'STN-AB-015', name: 'Airport Bypass Express', code: 'AB-015', location: 'Airport Residential, Accra', region: 'Greater Accra', pumpsCount: 2 },
      { id: 'STN-TH-021', name: 'Takoradi Harbour Hub', code: 'TH-021', location: 'Harbour Road, Takoradi', region: 'Western Region', pumpsCount: 2 },
    ],
  },
  {
    id: 'COMP-GOIL',
    name: 'GOIL Ghana PLC',
    shortCode: 'GOIL',
    tagline: 'Good Energy. Ghana’s Pride.',
    logoText: 'GOIL GHANA',
    primaryColor: '#FF8200',
    primaryDark: '#D46A00',
    accentColor: '#009639',
    currency: 'GHS',
    adminCode: 'GOIL-HQ01',
    adminName: 'GOIL Corporate HQ',
    adminPin: '9999',
    phone: '030 200 2200',
    stations: [
      { id: 'GOIL-001', name: 'Accra Ridge Flagship', code: 'GOIL-RDG', location: 'Ridge Roundabout, Accra', region: 'Greater Accra', pumpsCount: 4 },
      { id: 'GOIL-002', name: 'Tema Port Industrial Hub', code: 'GOIL-TP', location: 'Harbour Road, Tema', region: 'Greater Accra', pumpsCount: 3 },
      { id: 'GOIL-003', name: 'Kumasi Tech Junction', code: 'GOIL-KSI', location: 'KNUST Junction, Kumasi', region: 'Ashanti Region', pumpsCount: 4 },
    ],
  },
  {
    id: 'COMP-TOTAL',
    name: 'TotalEnergies Ghana',
    shortCode: 'TOTAL',
    tagline: 'Committed to Better Energy.',
    logoText: 'TOTALENERGIES',
    primaryColor: '#E20613',
    primaryDark: '#B8000B',
    accentColor: '#002B49',
    currency: 'GHS',
    adminCode: 'TOT-HQ01',
    adminName: 'TotalEnergies HQ Admin',
    adminPin: '9999',
    phone: '030 200 3300',
    stations: [
      { id: 'TOTAL-001', name: 'Ring Road Central Express', code: 'TOT-RRC', location: 'Ring Road Central, Accra', region: 'Greater Accra', pumpsCount: 4 },
      { id: 'TOTAL-002', name: 'Liberation Road Station', code: 'TOT-LIB', location: 'Airport City, Accra', region: 'Greater Accra', pumpsCount: 4 },
    ],
  },
  {
    id: 'COMP-STAR',
    name: 'Star Oil Company',
    shortCode: 'STAR',
    tagline: 'Fueled for the Journey.',
    logoText: 'STAR OIL',
    primaryColor: '#0B2545',
    primaryDark: '#07162C',
    accentColor: '#EE9B00',
    currency: 'GHS',
    adminCode: 'STAR-HQ01',
    adminName: 'Star Oil Central HQ',
    adminPin: '9999',
    phone: '030 200 4400',
    stations: [
      { id: 'STAR-001', name: 'Spintex Coastal Station', code: 'STAR-SPX', location: 'Spintex Road, Batsonaa', region: 'Greater Accra', pumpsCount: 2 },
      { id: 'STAR-002', name: 'Takoradi Harbour Branch', code: 'STAR-TKD', location: 'Commercial Street, Takoradi', region: 'Western Region', pumpsCount: 2 },
    ],
  },
]

export interface SeedAttendant {
  employeeCode: string
  fullName: string
  pin: string
  pumpId: string
  stationId: string
  companyId?: string
  companyShortCode?: string
  phone?: string
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
}

/** Registered production attendants. */
export const SEED_ATTENDANTS: SeedAttendant[] = [
  { employeeCode: 'PV001A', fullName: 'Aisha Boateng', pin: '2024', pumpId: 'pump-1', stationId: 'STN-GV-042', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '024 111 2233', approvalStatus: 'APPROVED' },
  { employeeCode: 'PV002A', fullName: 'Kofi Asante', pin: '3319', pumpId: 'pump-2', stationId: 'STN-GV-042', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '020 334 5566', approvalStatus: 'APPROVED' },
  { employeeCode: 'GOIL001A', fullName: 'Nana Yaw Owusu', pin: '1187', pumpId: 'pump-1', stationId: 'GOIL-001', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', phone: '027 889 9001', approvalStatus: 'APPROVED' },
  { employeeCode: 'TOT001A', fullName: 'Esi Mensah', pin: '5520', pumpId: 'pump-1', stationId: 'TOTAL-001', companyId: 'COMP-TOTAL', companyShortCode: 'TOTAL', phone: '055 443 2211', approvalStatus: 'APPROVED' },
  { employeeCode: 'STAR001A', fullName: 'Kwabena Owusu', pin: '4726', pumpId: 'pump-1', stationId: 'STAR-001', companyId: 'COMP-STAR', companyShortCode: 'STAR', phone: '024 990 1122', approvalStatus: 'APPROVED' },
  // Demo Pending Attendant under GOIL
  { employeeCode: 'GOIL002A', fullName: 'Emmanuel Darko', pin: '1234', pumpId: 'pump-2', stationId: 'GOIL-001', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', phone: '024 776 5544', approvalStatus: 'PENDING' },
]

export interface SeedSupervisor {
  employeeCode: string
  fullName: string
  pin: string
  stationId: string
  companyId?: string
  companyShortCode?: string
  phone?: string
  isHeadOffice?: boolean
  isSuperAdmin?: boolean
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
}

export const SEED_SUPERVISORS: SeedSupervisor[] = [
  // 1. SUPER SUPER ADMIN (Platform Owner / PetroView Master)
  { employeeCode: 'SUPER-ADMIN', fullName: 'PetroView Platform Master Admin', pin: '7256', stationId: 'STN-GV-042', isSuperAdmin: true, isHeadOffice: true, phone: '030 000 0000', approvalStatus: 'APPROVED' },

  // 2. COMPANY HQ ADMINS (Provisioned by Super Super Admin)
  { employeeCode: 'PV-HQ01', fullName: 'PetroView Operations HQ', pin: '9999', stationId: 'STN-GV-042', companyId: 'COMP-PV', companyShortCode: 'PV', isHeadOffice: true, phone: '030 200 1100', approvalStatus: 'APPROVED' },
  { employeeCode: 'GOIL-HQ01', fullName: 'GOIL Corporate HQ Admin', pin: '9999', stationId: 'GOIL-001', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', isHeadOffice: true, phone: '030 200 2200', approvalStatus: 'APPROVED' },
  { employeeCode: 'TOT-HQ01', fullName: 'TotalEnergies HQ Admin', pin: '9999', stationId: 'TOTAL-001', companyId: 'COMP-TOTAL', companyShortCode: 'TOTAL', isHeadOffice: true, phone: '030 200 3300', approvalStatus: 'APPROVED' },
  { employeeCode: 'STAR-HQ01', fullName: 'Star Oil Central HQ Admin', pin: '9999', stationId: 'STAR-001', companyId: 'COMP-STAR', companyShortCode: 'STAR', isHeadOffice: true, phone: '030 200 4400', approvalStatus: 'APPROVED' },
  { employeeCode: 'HQ-ADMIN', fullName: 'Enterprise Super Admin', pin: '9999', stationId: 'STN-GV-042', companyId: 'COMP-PV', companyShortCode: 'PV', isHeadOffice: true, phone: '030 200 9900', approvalStatus: 'APPROVED' },

  // 3. STATION MANAGERS
  { employeeCode: 'PV001M', fullName: 'Kwame Mensah', pin: '5678', stationId: 'STN-GV-042', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '024 887 6655', approvalStatus: 'APPROVED' },
  { employeeCode: 'GOIL001M', fullName: 'Daniel Larbi', pin: '5678', stationId: 'GOIL-001', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', phone: '027 112 2334', approvalStatus: 'APPROVED' },
  { employeeCode: 'TOT001M', fullName: 'Patrick Addo', pin: '5678', stationId: 'TOTAL-001', companyId: 'COMP-TOTAL', companyShortCode: 'TOTAL', phone: '020 998 8776', approvalStatus: 'APPROVED' },
  // Demo Pending Manager under GOIL
  { employeeCode: 'GOIL002M', fullName: 'Grace Mensah', pin: '1234', stationId: 'GOIL-002', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', phone: '054 332 1100', approvalStatus: 'PENDING' },
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
  // Always guarantee SUPER-ADMIN is seeded and active with PIN 7256
  const { salt: saSalt, hash: saHash } = await hashPin('7256')
  const existingSuperAdmin = await prodDb.supervisors.where('employeeCode').equalsIgnoreCase('SUPER-ADMIN').first()
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
    // Update hash and status
    await prodDb.supervisors.update(existingSuperAdmin.id, {
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

  const count = await prodDb.attendants.count()
  if (count > 0) return false

  const now = new Date().toISOString()
  const attendants: Attendant[] = []

  for (const seed of SEED_ATTENDANTS) {
    const { salt, hash } = await hashPin(seed.pin)
    const isApproved = (seed.approvalStatus ?? 'APPROVED') === 'APPROVED'
    attendants.push({
      id: `att-${seed.employeeCode.toLowerCase()}`,
      employeeCode: seed.employeeCode,
      fullName: seed.fullName,
      pinSalt: salt,
      pinHash: hash,
      pumpId: PRODUCTION_PUMPS.some(p => p.id === seed.pumpId) ? seed.pumpId : null,
      stationId: seed.stationId,
      phone: seed.phone ?? '024 000 0000',
      approvalStatus: seed.approvalStatus ?? 'APPROVED',
      approvedAt: isApproved ? now : null,
      approvedBy: isApproved ? 'HQ Super Admin' : null,
      active: isApproved,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: now,
    })
  }
  await prodDb.attendants.bulkAdd(attendants)

  const supervisors: Supervisor[] = []
  for (const seed of SEED_SUPERVISORS) {
    const { salt, hash } = await hashPin(seed.pin)
    const isApproved = (seed.approvalStatus ?? 'APPROVED') === 'APPROVED'
    supervisors.push({
      id: `sup-${seed.employeeCode.toLowerCase()}`,
      employeeCode: seed.employeeCode,
      fullName: seed.fullName,
      pinSalt: salt,
      pinHash: hash,
      stationId: seed.stationId,
      phone: seed.phone ?? '024 000 0000',
      isHeadOffice: seed.isHeadOffice ?? false,
      approvalStatus: seed.approvalStatus ?? 'APPROVED',
      approvedAt: isApproved ? now : null,
      approvedBy: isApproved ? 'HQ Super Admin' : null,
      active: isApproved,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: now,
    })
  }
  await prodDb.supervisors.bulkAdd(supervisors)

  const companies: Company[] = []
  const stations: CompanyStation[] = []

  for (const c of SEED_COMPANIES) {
    companies.push({
      id: c.id,
      name: c.name,
      shortCode: c.shortCode,
      tagline: c.tagline,
      logoText: c.logoText,
      primaryColor: c.primaryColor,
      primaryDark: c.primaryDark,
      accentColor: c.accentColor,
      currency: c.currency,
      adminCode: c.adminCode,
      adminName: c.adminName,
      phone: c.phone,
      active: true,
      createdAt: now,
    })

    for (const st of c.stations) {
      stations.push({
        id: st.id,
        companyId: c.id,
        name: st.name,
        code: st.code,
        location: st.location,
        region: st.region,
        pumpsCount: st.pumpsCount,
        createdAt: now,
      })
    }
  }

  await prodDb.companies.bulkAdd(companies)
  await prodDb.companyStations.bulkAdd(stations)

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
  await prodDb.companies.clear()
  await prodDb.companyStations.clear()
  await seedProductionData()
}