import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { ENV, SUPER_ADMIN } from './config'
import { hashPin } from './auth'

export type FuelCode = 'PMS' | 'AGO' | 'DPK' | 'KERO'
export type PaymentMethod = 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'
export type ShiftStatus = 'OPEN' | 'CLOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED'
export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'
export type SyncEntityType = 'SHIFT' | 'TRANSACTION' | 'RECEIPT'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type UserRole = 'attendant' | 'supervisor' | 'headoffice' | 'superadmin'
export type AuditAction =
  | 'REVIEW_APPROVED'
  | 'REJECTED'
  | 'PIN_RESET'
  | 'ATTENDANT_REGISTERED'
  | 'ATTENDANT_DEACTIVATED'
  | 'SUPERVISOR_REGISTERED'
  | 'SUPERVISOR_APPROVED'
  | 'SUPERVISOR_REJECTED'
  | 'ATTENDANT_APPROVED'
  | 'ATTENDANT_REJECTED'
  | 'COMPANY_CREATED'
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'TANK_READING_RECORDED'

export interface MeterReading {
  fuelCode: FuelCode
  value: number
}

export interface FuelSale {
  fuelCode: FuelCode
  litres: number
  unitPrice: number
  amount: number
}

export interface PaymentsBreakdown {
  CASH: number
  MOMO: number
  VOUCHER: number
  CREDIT: number
}

export interface ShiftRow {
  id: string
  number: string
  attendantId: string
  attendantName: string
  pumpId: string
  pumpName: string
  stationId: string
  stationName: string
  status: ShiftStatus
  openedAt: string
  closedAt: string | null
  openingReadings: string
  closingReadings: string
  sales: string
  expectedTotal: number
  payments: string
  actualTotal: number
  variance: number
  notes: string | null
  reviewerNotes: string | null
  syncStatus: SyncStatus
  createdAt: string
  updatedAt: string
}

export interface Shift {
  id: string
  number: string
  attendantId: string
  attendantName: string
  pumpId: string
  pumpName: string
  stationId: string
  stationName: string
  status: ShiftStatus
  openedAt: string
  closedAt: string | null
  openingReadings: MeterReading[]
  closingReadings: MeterReading[]
  sales: FuelSale[]
  expectedTotal: number
  payments: PaymentsBreakdown
  actualTotal: number
  variance: number
  notes: string | null
  reviewerNotes: string | null
  syncStatus: SyncStatus
  createdAt: string
  updatedAt: string
}

function ensureDir(file: string): void {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
}

ensureDir(ENV.DB_PATH)
export const db = new Database(ENV.DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const SCHEMA_DDL: Record<string, string> = {
  companies: `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shortCode TEXT NOT NULL UNIQUE,
  tagline TEXT DEFAULT '',
  logoText TEXT DEFAULT '',
  primaryColor TEXT DEFAULT '#F97316',
  primaryDark TEXT DEFAULT '#EA580C',
  accentColor TEXT DEFAULT '#FBBF24',
  currency TEXT DEFAULT 'GHS',
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);
`,
  companyStations: `
CREATE TABLE IF NOT EXISTS companyStations (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  location TEXT NOT NULL,
  region TEXT NOT NULL,
  pumpsCount INTEGER NOT NULL DEFAULT 4,
  supervisorName TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (companyId) REFERENCES companies(id)
);
`,
  attendants: `
CREATE TABLE IF NOT EXISTS attendants (
  id TEXT PRIMARY KEY,
  employeeCode TEXT NOT NULL UNIQUE,
  fullName TEXT NOT NULL,
  pinSalt TEXT NOT NULL,
  pinHash TEXT NOT NULL,
  pumpId TEXT,
  stationId TEXT,
  companyId TEXT,
  companyShortCode TEXT,
  phone TEXT,
  approvalStatus TEXT NOT NULL DEFAULT 'APPROVED',
  approvedAt TEXT,
  approvedBy TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  failedAttempts INTEGER NOT NULL DEFAULT 0,
  lockoutUntil TEXT,
  createdAt TEXT NOT NULL
);
`,
  supervisors: `
CREATE TABLE IF NOT EXISTS supervisors (
  id TEXT PRIMARY KEY,
  employeeCode TEXT NOT NULL UNIQUE,
  fullName TEXT NOT NULL,
  pinSalt TEXT NOT NULL,
  pinHash TEXT NOT NULL,
  stationId TEXT,
  companyId TEXT,
  companyShortCode TEXT,
  phone TEXT,
  isHeadOffice INTEGER NOT NULL DEFAULT 0,
  isSuperAdmin INTEGER NOT NULL DEFAULT 0,
  approvalStatus TEXT NOT NULL DEFAULT 'APPROVED',
  approvedAt TEXT,
  approvedBy TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  failedAttempts INTEGER NOT NULL DEFAULT 0,
  lockoutUntil TEXT,
  createdAt TEXT NOT NULL
);
`,
  sessions: `
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  userId TEXT NOT NULL,
  employeeCode TEXT NOT NULL,
  fullName TEXT NOT NULL,
  stationId TEXT,
  companyId TEXT,
  companyShortCode TEXT,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
`,
  shifts: `
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  attendantId TEXT NOT NULL,
  attendantName TEXT NOT NULL,
  pumpId TEXT NOT NULL,
  pumpName TEXT NOT NULL,
  stationId TEXT NOT NULL,
  stationName TEXT NOT NULL,
  status TEXT NOT NULL,
  openedAt TEXT NOT NULL,
  closedAt TEXT,
  openingReadings TEXT NOT NULL,
  closingReadings TEXT NOT NULL,
  sales TEXT NOT NULL,
  expectedTotal REAL NOT NULL,
  payments TEXT NOT NULL,
  actualTotal REAL NOT NULL,
  variance REAL NOT NULL,
  notes TEXT,
  reviewerNotes TEXT,
  syncStatus TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`,
  transactions: `
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  shiftId TEXT NOT NULL,
  attendantId TEXT NOT NULL,
  fuelCode TEXT NOT NULL,
  litres REAL NOT NULL,
  amount REAL NOT NULL,
  unitPrice REAL NOT NULL,
  method TEXT NOT NULL,
  customerRef TEXT,
  recordedAt TEXT NOT NULL,
  syncStatus TEXT NOT NULL
);
`,
  receipts: `
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  shiftId TEXT NOT NULL,
  image TEXT NOT NULL,
  capturedAt TEXT NOT NULL,
  syncStatus TEXT NOT NULL
);
`,
  tankReadings: `
CREATE TABLE IF NOT EXISTS tankReadings (
  id TEXT PRIMARY KEY,
  stationId TEXT NOT NULL,
  companyId TEXT,
  recordedBy TEXT NOT NULL,
  recordedByName TEXT NOT NULL,
  readings TEXT NOT NULL,
  recordedAt TEXT NOT NULL,
  notes TEXT,
  createdAt TEXT NOT NULL
);
`,
  syncQueue: `
CREATE TABLE IF NOT EXISTS syncQueue (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  nextRetryAt TEXT,
  lastError TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`,
  audit_log: `
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actorId TEXT NOT NULL,
  actorName TEXT NOT NULL,
  actorRole TEXT NOT NULL,
  targetId TEXT NOT NULL,
  targetDescription TEXT NOT NULL,
  notes TEXT,
  timestamp TEXT NOT NULL,
  meta TEXT
);
`,
}

function tableColumns(table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.map((r) => r.name)
}

// Legacy volumes created by earlier deploys have tables without the multi-tenant
// columns (companyId, approvalStatus, isSuperAdmin, ...). CREATE TABLE IF NOT EXISTS
// won't alter those tables, so rebuild them in place while preserving any existing rows.
function migrateLegacyTables(): void {
  const migrations: Array<{ table: keyof typeof SCHEMA_DDL; required: string[] }> = [
    { table: 'supervisors', required: ['companyId', 'isSuperAdmin', 'approvalStatus'] },
    { table: 'attendants', required: ['companyId', 'approvalStatus', 'companyShortCode'] },
    { table: 'sessions', required: ['companyId', 'companyShortCode'] },
    { table: 'companyStations', required: ['active'] },
  ]
  for (const m of migrations) {
    const cols = tableColumns(m.table)
    const isLegacy = m.required.some((c) => !cols.includes(c))
    if (!isLegacy) continue

    const legacy = `${m.table}_legacy`
    db.exec(`ALTER TABLE ${m.table} RENAME TO ${legacy}`)
    db.exec(SCHEMA_DDL[m.table])
    const common = cols.filter((c) => tableColumns(m.table).includes(c))
    if (common.length > 0) {
      const list = common.join(', ')
      db.prepare(`INSERT OR IGNORE INTO ${m.table} (${list}) SELECT ${list} FROM ${legacy}`).run()
    }
    db.exec(`DROP TABLE ${legacy}`)
    console.log(`[db] Migrated legacy schema for ${m.table}`)
  }
}

export function initSchema(): void {
  for (const ddl of Object.values(SCHEMA_DDL)) db.exec(ddl)

  migrateLegacyTables()

  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
  const ensureIndex = (name: string, sql: string): void => {
    if (!idx.get(name)) db.exec(sql)
  }
  ensureIndex('idx_shifts_station_status', 'CREATE INDEX idx_shifts_station_status ON shifts (stationId, status)')
  ensureIndex('idx_shifts_openedAt', 'CREATE INDEX idx_shifts_openedAt ON shifts (openedAt)')
  ensureIndex('idx_audit_timestamp', 'CREATE INDEX idx_audit_timestamp ON audit_log (timestamp)')
  ensureIndex('idx_tankReadings_station', 'CREATE INDEX idx_tankReadings_station ON tankReadings (stationId, recordedAt)')
  ensureIndex('idx_attendants_company', 'CREATE INDEX idx_attendants_company ON attendants (companyId)')
  ensureIndex('idx_supervisors_company', 'CREATE INDEX idx_supervisors_company ON supervisors (companyId)')
}

export function seedSuperAdmin(): void {
  const existing = db.prepare('SELECT id FROM supervisors WHERE employeeCode = ?').get(SUPER_ADMIN.employeeCode) as
    | { id: string }
    | undefined

  if (existing) {
    db.prepare(
      `UPDATE supervisors
       SET fullName = ?, stationId = NULL, companyId = ?, isHeadOffice = 0, isSuperAdmin = 1,
           approvalStatus = 'APPROVED', approvedAt = COALESCE(approvedAt, ?), approvedBy = COALESCE(approvedBy, 'SYSTEM_SEED'),
           active = 1, lockoutUntil = NULL
       WHERE id = ?`,
    ).run(SUPER_ADMIN.fullName, SUPER_ADMIN.companyId, new Date().toISOString(), existing.id)
    console.log(`[db] Ensured SUPER-ADMIN (${SUPER_ADMIN.employeeCode})`)
    return
  }

  const { salt, hash } = hashPin(SUPER_ADMIN.pin)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode,
     phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?)`,
  ).run(
    SUPER_ADMIN.id,
    SUPER_ADMIN.employeeCode,
    SUPER_ADMIN.fullName,
    salt,
    hash,
    SUPER_ADMIN.stationId,
    SUPER_ADMIN.companyId,
    null,
    null,
    0,
    1,
    'APPROVED',
    now,
    'SYSTEM_SEED',
    now,
  )
  console.log(`[db] Seeded SUPER-ADMIN (${SUPER_ADMIN.employeeCode})`)
}

export function seedAllProductionData(): void {
  seedSuperAdmin()

  const now = new Date().toISOString()
  const { salt: hqSalt, hash: hqHash } = hashPin('9999')
  const { salt: mgrSalt, hash: mgrHash } = hashPin('1234')

  // 1. Seed Companies
  const companies = [
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
      phone: '030 200 1100',
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
      phone: '030 200 2200',
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
      phone: '030 200 3300',
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
      phone: '030 200 4400',
    },
  ]

  const insertCompany = db.prepare(`
    INSERT INTO companies (id, name, shortCode, tagline, logoText, primaryColor, primaryDark, accentColor, currency, phone, active, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, shortCode=excluded.shortCode
  `)
  for (const c of companies) {
    insertCompany.run(c.id, c.name, c.shortCode, c.tagline, c.logoText, c.primaryColor, c.primaryDark, c.accentColor, c.currency, c.phone, now)
  }

  // 2. Seed Stations
  const stations = [
    { id: 'STN-PV-01', companyId: 'COMP-PV', name: 'Green Valley Main Flagship (PetroView)', code: 'PV-01', location: 'Accra - Tema Motorway Corridor', region: 'Greater Accra', pumpsCount: 4, supervisorName: 'Samuel Kofi Mensah' },
    { id: 'STN-PV-02', companyId: 'COMP-PV', name: 'Airport City Express (PetroView)', code: 'PV-02', location: 'Liberation Road, Airport City', region: 'Greater Accra', pumpsCount: 4, supervisorName: 'Kwame Asante' },
    { id: 'STN-GOIL-01', companyId: 'COMP-GOIL', name: 'GOIL Kwame Nkrumah Circle Flagship', code: 'GOIL-01', location: 'Ring Road Central, Circle', region: 'Greater Accra', pumpsCount: 6, supervisorName: 'Yaw Osei Tutu' },
    { id: 'STN-GOIL-02', companyId: 'COMP-GOIL', name: 'GOIL Spintex Road Service Station', code: 'GOIL-02', location: 'Spintex Road, Accra', region: 'Greater Accra', pumpsCount: 4, supervisorName: 'Kofi Owusu' },
    { id: 'STN-TOTAL-01', companyId: 'COMP-TOTAL', name: 'TotalEnergies 37 Flagship Station', code: 'TOTAL-01', location: 'Liberation Road, 37 Roundabout', region: 'Greater Accra', pumpsCount: 4, supervisorName: 'Kwesi Arthur' },
    { id: 'STN-SHELL-01', companyId: 'COMP-SHELL', name: 'Shell Airport Bypass Express', code: 'SHELL-01', location: 'Airport Bypass Road, Accra', region: 'Greater Accra', pumpsCount: 4, supervisorName: 'Richard Appiah' },
  ]

  const insertStation = db.prepare(`
    INSERT INTO companyStations (id, companyId, name, code, location, region, pumpsCount, supervisorName, active, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, code=excluded.code
  `)
  for (const s of stations) {
    insertStation.run(s.id, s.companyId, s.name, s.code, s.location, s.region, s.pumpsCount, s.supervisorName, now)
  }

  // 3. Seed HQ Admins (PIN 9999) & Station Managers (PIN 1234)
  const supervisors = [
    // HQ Admins
    { id: 'sup-pv-hq01', employeeCode: 'PV-HQ01', fullName: 'PetroView HQ Administrator', pinSalt: hqSalt, pinHash: hqHash, stationId: 'STN-PV-01', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '030 200 1100', isHeadOffice: 1, isSuperAdmin: 0 },
    { id: 'sup-goil-hq01', employeeCode: 'GOIL-HQ01', fullName: 'GOIL Operations HQ Admin', pinSalt: hqSalt, pinHash: hqHash, stationId: 'STN-GOIL-01', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', phone: '030 200 2200', isHeadOffice: 1, isSuperAdmin: 0 },
    { id: 'sup-total-hq01', employeeCode: 'TOTAL-HQ01', fullName: 'TotalEnergies HQ Admin', pinSalt: hqSalt, pinHash: hqHash, stationId: 'STN-TOTAL-01', companyId: 'COMP-TOTAL', companyShortCode: 'TOTAL', phone: '030 200 3300', isHeadOffice: 1, isSuperAdmin: 0 },
    { id: 'sup-shell-hq01', employeeCode: 'SHELL-HQ01', fullName: 'Shell Ghana HQ Admin', pinSalt: hqSalt, pinHash: hqHash, stationId: 'STN-SHELL-01', companyId: 'COMP-SHELL', companyShortCode: 'SHELL', phone: '030 200 4400', isHeadOffice: 1, isSuperAdmin: 0 },

    // Station Managers
    { id: 'sup-pv-001-m', employeeCode: 'PV-001-M', fullName: 'Samuel Kofi Mensah (Manager)', pinSalt: mgrSalt, pinHash: mgrHash, stationId: 'STN-PV-01', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '024 111 2233', isHeadOffice: 0, isSuperAdmin: 0 },
    { id: 'sup-pv-002-m', employeeCode: 'PV-002-M', fullName: 'Kwame Asante (Manager)', pinSalt: mgrSalt, pinHash: mgrHash, stationId: 'STN-PV-02', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '024 111 2244', isHeadOffice: 0, isSuperAdmin: 0 },
    { id: 'sup-goil-001-m', employeeCode: 'GOIL-001-M', fullName: 'Yaw Osei Tutu (Manager)', pinSalt: mgrSalt, pinHash: mgrHash, stationId: 'STN-GOIL-01', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', phone: '024 222 3344', isHeadOffice: 0, isSuperAdmin: 0 },
    { id: 'sup-total-001-m', employeeCode: 'TOTAL-001-M', fullName: 'Kwesi Arthur (Manager)', pinSalt: mgrSalt, pinHash: mgrHash, stationId: 'STN-TOTAL-01', companyId: 'COMP-TOTAL', companyShortCode: 'TOTAL', phone: '024 333 4455', isHeadOffice: 0, isSuperAdmin: 0 },
    { id: 'sup-shell-001-m', employeeCode: 'SHELL-001-M', fullName: 'Richard Appiah (Manager)', pinSalt: mgrSalt, pinHash: mgrHash, stationId: 'STN-SHELL-01', companyId: 'COMP-SHELL', companyShortCode: 'SHELL', phone: '024 444 5566', isHeadOffice: 0, isSuperAdmin: 0 },
  ]

  const insertSupervisor = db.prepare(`
    INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode, phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, 'SYSTEM_SEED', 1, 0, NULL, ?)
    ON CONFLICT(employeeCode) DO UPDATE SET fullName=excluded.fullName, pinSalt=excluded.pinSalt, pinHash=excluded.pinHash, isHeadOffice=excluded.isHeadOffice, isSuperAdmin=excluded.isSuperAdmin, active=1, approvalStatus='APPROVED'
  `)
  for (const sup of supervisors) {
    insertSupervisor.run(sup.id, sup.employeeCode, sup.fullName, sup.pinSalt, sup.pinHash, sup.stationId, sup.companyId, sup.companyShortCode, sup.phone, sup.isHeadOffice, sup.isSuperAdmin, now, now)
  }

  // 4. Seed Attendants (PIN 1234)
  const attendants = [
    { id: 'att-pv-acc-001-a', employeeCode: 'PV-ACC-001-A', fullName: 'Kofi Mensah (Attendant)', pinSalt: mgrSalt, pinHash: mgrHash, pumpId: 'pump-1', stationId: 'STN-PV-01', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '024 555 6677' },
    { id: 'att-pv-acc-002-b', employeeCode: 'PV-ACC-002-B', fullName: 'Ama Serwaa (Attendant)', pinSalt: mgrSalt, pinHash: mgrHash, pumpId: 'pump-2', stationId: 'STN-PV-01', companyId: 'COMP-PV', companyShortCode: 'PV', phone: '024 555 6688' },
    { id: 'att-goil-acc-001-a', employeeCode: 'GOIL-ACC-001-A', fullName: 'Kwame Appiah (Attendant)', pinSalt: mgrSalt, pinHash: mgrHash, pumpId: 'pump-1', stationId: 'STN-GOIL-01', companyId: 'COMP-GOIL', companyShortCode: 'GOIL', phone: '024 666 7788' },
    { id: 'att-total-acc-001-a', employeeCode: 'TOTAL-ACC-001-A', fullName: 'Abena Osei (Attendant)', pinSalt: mgrSalt, pinHash: mgrHash, pumpId: 'pump-1', stationId: 'STN-TOTAL-01', companyId: 'COMP-TOTAL', companyShortCode: 'TOTAL', phone: '024 777 8899' },
    { id: 'att-shell-acc-001-a', employeeCode: 'SHELL-ACC-001-A', fullName: 'Kojo Darko (Attendant)', pinSalt: mgrSalt, pinHash: mgrHash, pumpId: 'pump-1', stationId: 'STN-SHELL-01', companyId: 'COMP-SHELL', companyShortCode: 'SHELL', phone: '024 888 9900' },
  ]

  const insertAttendant = db.prepare(`
    INSERT INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, companyId, companyShortCode, phone, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, 'SYSTEM_SEED', 1, 0, NULL, ?)
    ON CONFLICT(employeeCode) DO UPDATE SET fullName=excluded.fullName, pinSalt=excluded.pinSalt, pinHash=excluded.pinHash, active=1, approvalStatus='APPROVED'
  `)
  for (const att of attendants) {
    insertAttendant.run(att.id, att.employeeCode, att.fullName, att.pinSalt, att.pinHash, att.pumpId, att.stationId, att.companyId, att.companyShortCode, att.phone, now, now)
  }
}

export function deserializeShift(row: ShiftRow): Shift {
  return {
    ...row,
    status: row.status as ShiftStatus,
    syncStatus: row.syncStatus as SyncStatus,
    payments: JSON.parse(row.payments) as PaymentsBreakdown,
    openingReadings: JSON.parse(row.openingReadings) as MeterReading[],
    closingReadings: JSON.parse(row.closingReadings) as MeterReading[],
    sales: JSON.parse(row.sales) as FuelSale[],
  }
}

export function bootDb(): void {
  initSchema()
  seedAllProductionData()
}

export const countAttendants = (): number => (db.prepare('SELECT COUNT(*) AS c FROM attendants').get() as { c: number }).c

