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
  seedSuperAdmin()
}

export const countAttendants = (): number => (db.prepare('SELECT COUNT(*) AS c FROM attendants').get() as { c: number }).c
