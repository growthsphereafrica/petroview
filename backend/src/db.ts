import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { ENV, SUPER_ADMIN } from './config'
import { hashPin } from './auth'

export type FuelCode = 'PMS' | 'AGO' | 'DPK' | 'KERO' | 'RON95' | 'AGO-PREM' | 'LPG' | 'PREMIX' | string
export type PaymentMethod = 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'
export type ShiftStatus = 'OPEN' | 'CLOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED'
export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'
export type SyncEntityType = 'SHIFT' | 'TRANSACTION' | 'RECEIPT' | 'EXPENSE' | 'TANK_READING'
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
  station_expenses: `
CREATE TABLE IF NOT EXISTS station_expenses (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL,
  companyShortCode TEXT,
  stationId TEXT NOT NULL,
  stationName TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  paymentSource TEXT NOT NULL,
  payee TEXT,
  referenceNumber TEXT,
  notes TEXT,
  date TEXT NOT NULL,
  recordedBy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPROVED',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`,
  products: `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  companyId TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'FUEL',
  unitPrice REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Litre',
  color TEXT NOT NULL DEFAULT '#F97316',
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`,
  pumps: `
CREATE TABLE IF NOT EXISTS pumps (
  id TEXT PRIMARY KEY,
  stationId TEXT NOT NULL,
  companyId TEXT,
  name TEXT NOT NULL,
  fuels TEXT NOT NULL DEFAULT '["PMS","AGO"]',
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
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

  // Non-destructive column additions on shifts
  try {
    const shiftCols = tableColumns('shifts')
    if (!shiftCols.includes('companyId')) {
      db.exec('ALTER TABLE shifts ADD COLUMN companyId TEXT')
      console.log('[db] Added companyId column to shifts')
    }
    if (!shiftCols.includes('companyShortCode')) {
      db.exec('ALTER TABLE shifts ADD COLUMN companyShortCode TEXT')
      console.log('[db] Added companyShortCode column to shifts')
    }
  } catch (err) {
    console.warn('[db] Shifts column addition warning:', err)
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
  ensureIndex('idx_shifts_companyId', 'CREATE INDEX idx_shifts_companyId ON shifts (companyId)')
  ensureIndex('idx_audit_timestamp', 'CREATE INDEX idx_audit_timestamp ON audit_log (timestamp)')
  ensureIndex('idx_tankReadings_station', 'CREATE INDEX idx_tankReadings_station ON tankReadings (stationId, recordedAt)')
  ensureIndex('idx_attendants_company', 'CREATE INDEX idx_attendants_company ON attendants (companyId)')
  ensureIndex('idx_supervisors_company', 'CREATE INDEX idx_supervisors_company ON supervisors (companyId)')
  ensureIndex('idx_products_company_code', 'CREATE INDEX idx_products_company_code ON products (companyId, code)')
  ensureIndex('idx_pumps_station', 'CREATE INDEX idx_pumps_station ON pumps (stationId)')
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

const DEFAULT_PLATFORM_PRODUCTS = [
  { id: 'prod-pms',       code: 'PMS',      name: 'Super Petrol (PMS)',              category: 'FUEL',      unitPrice: 14.8,  unit: 'Litre',       color: '#16a34a' },
  { id: 'prod-ago',       code: 'AGO',      name: 'Diesel (AGO)',                   category: 'FUEL',      unitPrice: 15.2,  unit: 'Litre',       color: '#2563eb' },
  { id: 'prod-dpk',       code: 'DPK',      name: 'Kerosene (DPK)',                 category: 'FUEL',      unitPrice: 13.9,  unit: 'Litre',       color: '#ea580c' },
  { id: 'prod-kero',      code: 'KERO',     name: 'Kerosene (KERO)',                category: 'FUEL',      unitPrice: 13.5,  unit: 'Litre',       color: '#9333ea' },
  { id: 'prod-ron95',     code: 'RON95',    name: 'Super XP / V-Power (RON 95)',    category: 'FUEL',      unitPrice: 15.9,  unit: 'Litre',       color: '#dc2626' },
  { id: 'prod-ago-prem',  code: 'AGO-PREM', name: 'Super Diesel (Low Sulphur)',     category: 'FUEL',      unitPrice: 15.8,  unit: 'Litre',       color: '#0284c7' },
  { id: 'prod-lpg',       code: 'LPG',      name: 'LPG / Autogas',                  category: 'LPG',       unitPrice: 16.5,  unit: 'kg',          color: '#ca8a04' },
  { id: 'prod-premix',    code: 'PREMIX',   name: 'Premix Fuel',                    category: 'FUEL',      unitPrice: 11.2,  unit: 'Litre',       color: '#0d9488' },
  { id: 'prod-lub-20w50', code: 'LUB-20W50','name': 'Engine Oil 20W-50 (4L)',       category: 'LUBRICANT', unitPrice: 160.0, unit: 'Bottle (4L)', color: '#7c3aed' },
  { id: 'prod-lub-15w40', code: 'LUB-15W40','name': 'Heavy Duty Diesel Oil 15W-40 (4L)', category: 'LUBRICANT', unitPrice: 185.0, unit: 'Bottle (4L)', color: '#4f46e5' },
  { id: 'prod-lub-atf',   code: 'LUB-ATF',  name: 'Automatic Transmission Fluid (1L)', category: 'LUBRICANT', unitPrice: 65.0,  unit: 'Bottle (1L)', color: '#db2777' },
  { id: 'prod-lub-brake', code: 'LUB-BRAKE',name: 'Brake Fluid DOT 4 (500ml)',     category: 'LUBRICANT', unitPrice: 45.0,  unit: 'Bottle (500ml)', color: '#e11d48' },
] as const

/**
 * Seeds the default product catalog on first boot only.
 * Uses INSERT OR IGNORE so existing rows (including admin-deleted ones) are NEVER restored.
 * Admins can safely delete products and they will stay deleted across restarts.
 */
export function seedDefaultProducts(): void {
  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT OR IGNORE INTO products (id, companyId, code, name, category, unitPrice, unit, color, active, createdAt, updatedAt)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  for (const p of DEFAULT_PLATFORM_PRODUCTS) {
    insert.run(p.id, p.code, p.name, p.category, p.unitPrice, p.unit, p.color, now, now)
  }
  console.log('[db] Default products seeded (INSERT OR IGNORE — existing rows preserved)')
}

export function seedDefaultCompanies(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM companies').get() as { c: number }).c
  if (count > 0) return

  const now = new Date().toISOString()
  const defaultCompanies = [
    {
      id: 'comp-pv',
      name: 'PetroView Petroleum',
      shortCode: 'PV',
      tagline: 'Local-First. Sync When Possible. Never Lose Data.',
      primaryColor: '#F97316',
      primaryDark: '#C2410C',
      accentColor: '#F59E0B',
      adminCode: 'PV-HQ01',
      adminName: 'PetroView HQ Admin',
      stations: [
        { id: 'stn-pv-01', name: 'Green Valley Station', code: 'GV-042', location: 'Accra - Tema Motorway Corridor', region: 'Greater Accra', pumpsCount: 4 }
      ]
    },
    {
      id: 'comp-goil',
      name: 'GOIL Ghana PLC',
      shortCode: 'GOIL',
      tagline: "Good Energy. Ghana's Pride.",
      primaryColor: '#FF8200',
      primaryDark: '#D46A00',
      accentColor: '#009639',
      adminCode: 'GOIL-HQ01',
      adminName: 'GOIL HQ Admin',
      stations: [
        { id: 'stn-goil-01', name: 'Accra Ridge Flagship', code: 'GOIL-RDG', location: 'Ridge Roundabout, Accra', region: 'Greater Accra', pumpsCount: 4 }
      ]
    },
    {
      id: 'comp-all',
      name: 'Allied Oil Ghana',
      shortCode: 'ALL',
      tagline: 'Delivering Quality and Reliability.',
      primaryColor: '#0284C7',
      primaryDark: '#0369A1',
      accentColor: '#38BDF8',
      adminCode: 'ALL-HQ01',
      adminName: 'Allied Oil HQ Admin',
      stations: [
        { id: 'stn-all-01', name: 'Airport City Branch', code: 'ALL-APT', location: 'Airport City, Accra', region: 'Greater Accra', pumpsCount: 4 }
      ]
    },
    {
      id: 'comp-star',
      name: 'Star Oil Company',
      shortCode: 'STAR',
      tagline: 'Fueled for the Journey.',
      primaryColor: '#0B2545',
      primaryDark: '#07162C',
      accentColor: '#EE9B00',
      adminCode: 'STAR-HQ01',
      adminName: 'Star Oil HQ Admin',
      stations: [
        { id: 'stn-star-01', name: 'Spintex Coastal Station', code: 'STAR-SPX', location: 'Spintex Road, Batsonaa', region: 'Greater Accra', pumpsCount: 4 }
      ]
    },
    {
      id: 'comp-total',
      name: 'TotalEnergies Ghana',
      shortCode: 'TOTAL',
      tagline: 'Committed to Better Energy.',
      primaryColor: '#E20613',
      primaryDark: '#B8000B',
      accentColor: '#002B49',
      adminCode: 'TOT-HQ01',
      adminName: 'TotalEnergies HQ Admin',
      stations: [
        { id: 'stn-tot-01', name: 'Ring Road Central Express', code: 'TOT-RRC', location: 'Ring Road Central, Accra', region: 'Greater Accra', pumpsCount: 4 }
      ]
    },
  ]

  const insertComp = db.prepare(
    `INSERT OR IGNORE INTO companies (id, name, shortCode, tagline, logoText, primaryColor, primaryDark, accentColor, currency, phone, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GHS', '030 000 0000', 1, ?)`
  )
  const insertStation = db.prepare(
    `INSERT OR IGNORE INTO companyStations (id, companyId, name, code, location, region, pumpsCount, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  )
  const insertSupervisor = db.prepare(
    `INSERT OR IGNORE INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode,
     phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '030 000 0000', 1, 0, 'APPROVED', ?, 'SYSTEM_SEED', 1, 0, NULL, ?)`
  )
  const insertAttendant = db.prepare(
    `INSERT OR IGNORE INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, companyId, companyShortCode,
     phone, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '024 000 0000', 'APPROVED', ?, 'SYSTEM_SEED', 1, 0, NULL, ?)`
  )

  const { salt: hqSalt, hash: hqHash } = hashPin('9999')
  const { salt: attSalt, hash: attHash } = hashPin('1234')

  for (const c of defaultCompanies) {
    insertComp.run(c.id, c.name, c.shortCode, c.tagline, c.shortCode, c.primaryColor, c.primaryDark, c.accentColor, now)
    for (const s of c.stations) {
      insertStation.run(s.id, c.id, s.name, s.code, s.location, s.region, s.pumpsCount, now)
    }
    // HQ Admin (PIN 9999)
    insertSupervisor.run(`sup-${c.adminCode.toLowerCase()}`, c.adminCode, c.adminName, hqSalt, hqHash, null, c.id, c.shortCode, now, now)

    // Initial Attendant 001A (e.g. ALL001A, PV001A, GOIL001A) with PIN 1234
    const attCode = `${c.shortCode}001A`
    insertAttendant.run(
      `att-${attCode.toLowerCase()}`,
      attCode,
      `${c.name} Attendant`,
      attSalt,
      attHash,
      'Pump 1',
      c.stations[0]?.id || null,
      c.id,
      c.shortCode,
      now,
      now
    )
  }
  console.log('[db] Seeded default OMCs, stations, HQ Admins (PIN 9999), and Attendants (PIN 1234)')
}

export function seedAllProductionData(): void {
  seedSuperAdmin()
  seedDefaultCompanies()
  seedDefaultProducts()
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

// Auto-bootstrap schema immediately so any router importing db has tables available
bootDb()

export const countAttendants = (): number => (db.prepare('SELECT COUNT(*) AS c FROM attendants').get() as { c: number }).c

