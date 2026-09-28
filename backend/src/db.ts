import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ENV, SUPER_ADMIN } from './config'
import { CURRENT_KDF_VERSION, hashPin, verifyPinDetailed } from './auth'

/**
 * PINs that have been published in this project's own documentation, example
 * config, or source history. The server refuses to start if the platform admin
 * is configured with one of them.
 */
const WEAK_SUPER_ADMIN_PINS = new Set(['7256', '1234', '9999', '0000', '1111', '0001'])

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
  | 'SALE_RECORDED'
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

// Durability. WAL alone only promises durability up to the OS page cache, so a
// host power loss could truncate the ledger. FULL fsyncs the WAL on every
// commit. This costs a few ms per write, which is the right trade for money.
// NORMAL was the previous effective behaviour and is not sufficient here.
db.pragma('synchronous = FULL')

// The write-ahead log had reached 4MB against a 237KB main database, meaning
// most of the ledger lived in the WAL and any crash risked losing it. Checkpoint
// every 1000 pages (~4MB) to keep the main database current, and let SQLite
// truncate the WAL afterwards so it cannot grow without bound.
db.pragma('wal_autocheckpoint = 1000')
db.pragma('journal_size_limit = 67108864')

// Without this a concurrent writer gets an immediate SQLITE_BUSY instead of
// waiting, and the forecourt sync endpoint pushes bulk writes from several
// stations at once.
db.pragma('busy_timeout = 5000')

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

function migrateLegacyTables(): void {
  const columnDefinitions: Record<string, Record<string, string>> = {
    supervisors: {
      companyId: 'TEXT',
      companyShortCode: 'TEXT',
      phone: 'TEXT',
      isHeadOffice: 'INTEGER NOT NULL DEFAULT 0',
      isSuperAdmin: 'INTEGER NOT NULL DEFAULT 0',
      approvalStatus: "TEXT NOT NULL DEFAULT 'APPROVED'",
      approvedAt: 'TEXT',
      approvedBy: 'TEXT',
      active: 'INTEGER NOT NULL DEFAULT 1',
      failedAttempts: 'INTEGER NOT NULL DEFAULT 0',
      lockoutUntil: 'TEXT',
    },
    attendants: {
      pumpId: 'TEXT',
      stationId: 'TEXT',
      companyId: 'TEXT',
      companyShortCode: 'TEXT',
      phone: 'TEXT',
      approvalStatus: "TEXT NOT NULL DEFAULT 'APPROVED'",
      approvedAt: 'TEXT',
      approvedBy: 'TEXT',
      active: 'INTEGER NOT NULL DEFAULT 1',
      failedAttempts: 'INTEGER NOT NULL DEFAULT 0',
      lockoutUntil: 'TEXT',
    },
    sessions: {
      companyId: 'TEXT',
      companyShortCode: 'TEXT',
    },
    companyStations: {
      supervisorName: 'TEXT',
      active: 'INTEGER NOT NULL DEFAULT 1',
    },
    shifts: {
      companyId: 'TEXT',
      companyShortCode: 'TEXT',
    },
  }

  for (const [table, definitions] of Object.entries(columnDefinitions)) {
    const existing = new Set(tableColumns(table))
    for (const [column, definition] of Object.entries(definitions)) {
      if (!existing.has(column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
        console.log(`[db] Added ${table}.${column}`)
      }
    }
  }

  // Backfill shifts.companyId from the station the shift belongs to.
  //
  // The column was added by the migration above as a plain nullable TEXT with no
  // data migration, so every pre-existing shift kept companyId = NULL — and
  // assertShiftLedger() returns early on a NULL companyId. The transaction
  // reconciliation therefore switched itself off for the entire legacy
  // population, silently, based on a data field rather than a policy.
  const backfilled = db.prepare(`
    UPDATE shifts
    SET companyId = (SELECT cs.companyId FROM companyStations cs WHERE cs.id = shifts.stationId)
    WHERE (companyId IS NULL OR companyId = '')
      AND stationId IS NOT NULL
      AND EXISTS (SELECT 1 FROM companyStations cs WHERE cs.id = shifts.stationId)
  `).run()
  if (backfilled.changes > 0) {
    console.log(`[db] Backfilled shifts.companyId for ${backfilled.changes} legacy shift(s)`)
  }

  // Second pass: shifts whose stationId does not exist in companyStations.
  // These carry the pre-tenancy hardcoded default 'STN-01', so the join above
  // cannot resolve them and they kept skipping verification forever. The
  // attendant is the authoritative link: an attendant is bound to exactly one
  // station and company, so attribute the shift to the station that attendant
  // actually works, rather than leaving the row unattributable.
  //
  // Requires the attendant's station to itself resolve, otherwise there is
  // nothing trustworthy to fall back to and the row is reported instead.
  const viaAttendant = db.prepare(`
    UPDATE shifts
    SET stationId = (SELECT a.stationId FROM attendants a WHERE a.id = shifts.attendantId),
        companyId = (SELECT a.companyId FROM attendants a WHERE a.id = shifts.attendantId),
        companyShortCode = (SELECT a.companyShortCode FROM attendants a WHERE a.id = shifts.attendantId)
    WHERE (companyId IS NULL OR companyId = '')
      AND stationId IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM companyStations cs WHERE cs.id = shifts.stationId)
      AND EXISTS (
        SELECT 1 FROM attendants a
        WHERE a.id = shifts.attendantId
          AND a.stationId IS NOT NULL
          AND a.companyId IS NOT NULL
          AND EXISTS (SELECT 1 FROM companyStations cs WHERE cs.id = a.stationId)
      )
  `).run()
  if (viaAttendant.changes > 0) {
    console.log(`[db] Re-attributed ${viaAttendant.changes} shift(s) with unresolvable station via their attendant's station`)
  }

  const unresolvable = db.prepare('SELECT COUNT(*) AS c FROM shifts WHERE companyId IS NULL OR companyId = ?').get('') as { c: number }
  if (unresolvable.c > 0) {
    console.warn(`[db] WARNING: ${unresolvable.c} shift(s) have no resolvable company and will skip ledger verification`)
  }
}

/**
 * Rewrites an open shift's sales breakdown from its own synced transactions.
 *
 * A client cannot know what was sold until the closing meter reading exists,
 * so it deliberately sends litres and amount as zero for the whole time the
 * shift is open. Every litres and sales figure in Head Office and on the
 * supervisor dashboard reads that column, so a shift with real synced sales
 * reported 0 litres and GHS 0 until somebody closed it.
 *
 * Only correct while the shift is open. Closing supplies a meter reading that
 * is validated against these figures, and the variance is computed from the
 * client's own close-time totals, so the financial result never depends on
 * this estimate.
 */
export function salesFromTransactions(shiftId: string, salesJson: string): string {
  let skeleton: Array<Record<string, unknown>>
  try {
    const parsed: unknown = JSON.parse(salesJson)
    if (!Array.isArray(parsed)) return salesJson
    skeleton = parsed as Array<Record<string, unknown>>
  } catch {
    return salesJson
  }
  const rows = db.prepare('SELECT fuelCode, SUM(COALESCE(litres,0)) AS litres, SUM(COALESCE(amount,0)) AS amount, MAX(unitPrice) AS unitPrice FROM transactions WHERE shiftId = ? GROUP BY fuelCode').all(shiftId) as Array<{ fuelCode: string; litres: number; amount: number; unitPrice: number }>
  if (rows.length === 0) return salesJson
  const byFuel = new Map(rows.map(row => [String(row.fuelCode), row]))
  const merged: Array<Record<string, unknown>> = skeleton.map(item => {
    const totals = byFuel.get(String(item.fuelCode))
    if (!totals) return { ...item, litres: 0, amount: 0 }
    byFuel.delete(String(item.fuelCode))
    return { ...item, litres: Math.round(Number(totals.litres) * 100) / 100, amount: Math.round(Number(totals.amount) * 100) / 100 }
  })
  // A fuel the shift's price list never mentioned still has to be counted, or
  // the station understates what it sold.
  for (const [fuelCode, totals] of byFuel) {
    merged.push({ fuelCode, litres: Math.round(Number(totals.litres) * 100) / 100, amount: Math.round(Number(totals.amount) * 100) / 100, unitPrice: Number(totals.unitPrice) || 0 })
  }
  return JSON.stringify(merged)
}

function backfillOpenShiftSales(): void {
  const open = db.prepare("SELECT id, sales, expectedTotal FROM shifts WHERE status = 'OPEN'").all() as Array<{ id: string; sales: string; expectedTotal: number }>
  const update = db.prepare("UPDATE shifts SET sales = ?, expectedTotal = ? WHERE id = ? AND status = 'OPEN'")
  const salesTotal = (sales: string): number => {
    try {
      const parsed = JSON.parse(sales) as Array<{ amount?: number }>
      return Math.round(parsed.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0) * 100) / 100
    } catch {
      return 0
    }
  }
  let changed = 0
  for (const row of open) {
    const next = salesFromTransactions(row.id, row.sales)
    // expectedTotal has to move with sales. Filling in the sales array while
    // leaving the total at zero produced shifts that reported real fuel and real
    // money in one column and nothing in the other, which is worse than the
    // inconsistency it was meant to repair: anything reading expectedTotal saw
    // an open shift worth zero. A restore drill caught this.
    const total = salesTotal(next)
    if (Math.abs(total - Number(row.expectedTotal)) > 0.02) {
      if (update.run(next, total, row.id).changes > 0) {
        changed++
        console.log(`[db] Set open-shift ${row.id} expectedTotal to GHS ${total.toFixed(2)} to match its derived sales`)
      }
    } else if (next !== row.sales && update.run(next, total, row.id).changes > 0) {
      changed++
    }
  }
  if (changed > 0) {
    console.log(`[db] Derived open-shift sales from transactions for ${changed} shift(s)`)
  }
}

/**
 * Reconciles each entity's syncStatus against the sync queue.
 *
 * The queue is the record of what actually reached the server: queue() writes
 * SYNCED inside the same transaction that persists the entity. The redundant
 * syncStatus column on the row drifted, because rows written before the queue
 * was introduced kept PENDING forever and were only rewritten when re-synced.
 * Production carried seven shifts and twenty-two transactions all marked
 * PENDING while the queue recorded every one of them SYNCED, so Head Office
 * reported 0% sync compliance on a network that had in fact synced completely.
 *
 * The queue wins, and only for entities it has a SYNCED row for. Nothing here
 * can mark an unsynced entity as synced.
 */
export function reconcileSyncStatus(): void {
  for (const [table, idColumn] of [['shifts', 'id'], ['transactions', 'id'], ['receipts', 'id']] as const) {
    const result = db.prepare(`
      UPDATE ${table} SET syncStatus = 'SYNCED'
      WHERE syncStatus = 'PENDING'
        AND EXISTS (
          SELECT 1 FROM syncQueue q
          WHERE q.entityId = ${table}.${idColumn}
            AND q.entityType = '${table === 'shifts' ? 'SHIFT' : table === 'transactions' ? 'TRANSACTION' : 'RECEIPT'}'
            AND q.status = 'SYNCED'
        )
    `).run()
    if (result.changes > 0) console.log(`[db] Reconciled ${result.changes} ${table} row(s) from the sync queue`)
  }
}

/**
 * Stops tenant head office accounts from displaying as "SUPER-ADMIN".
 *
 * Every company's HQ admin was seeded with the display name SUPER-ADMIN, so the
 * staff roster showed three different people all labelled identically to the one
 * account that actually is the platform admin. It is confusing enough to be
 * mistaken for an access-control problem. The login route already rewrites the
 * name on the way in; this fixes the stored value so every read agrees.
 */
export function normaliseHqAdminNames(): void {
  const result = db.prepare(`
    UPDATE supervisors
    SET fullName = trim(coalesce(companyShortCode, '') || ' HQ Admin')
    WHERE isSuperAdmin = 0
      AND isHeadOffice = 1
      AND (fullName IS NULL OR upper(fullName) = 'SUPER-ADMIN' OR upper(fullName) LIKE '%SUPER%')
  `).run()
  if (result.changes > 0) console.log(`[db] Renamed ${result.changes} head office account(s) away from "SUPER-ADMIN"`)
}

export function initSchema(): void {
  for (const ddl of Object.values(SCHEMA_DDL)) db.exec(ddl)

  migrateLegacyTables()
  backfillOpenShiftSales()
  reconcileSyncStatus()
  normaliseHqAdminNames()

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
  ensureIndex('idx_transactions_shiftId', 'CREATE INDEX idx_transactions_shiftId ON transactions (shiftId)')
  ensureIndex('idx_receipts_shiftId', 'CREATE INDEX idx_receipts_shiftId ON receipts (shiftId)')
  ensureIndex('idx_expenses_station', 'CREATE INDEX idx_expenses_station ON station_expenses (stationId)')
  ensureIndex('idx_expenses_company', 'CREATE INDEX idx_expenses_company ON station_expenses (companyId)')
}

export function seedSuperAdmin(): void {
  if (SUPER_ADMIN.pin && WEAK_SUPER_ADMIN_PINS.has(SUPER_ADMIN.pin)) {
    throw new Error('SUPER_ADMIN_PIN is a well-known default. Choose a unique PIN before starting the server.')
  }
  if (SUPER_ADMIN.pin && !/^\d{4,32}$/.test(SUPER_ADMIN.pin)) {
    throw new Error('SUPER_ADMIN_PIN must be 4-32 digits.')
  }

  const existing = db.prepare('SELECT id, pinSalt, pinHash FROM supervisors WHERE employeeCode = ?').get(SUPER_ADMIN.employeeCode) as
    | { id: string; pinSalt: string | null; pinHash: string | null }
    | undefined

  if (existing) {
    // Distinguish three cases against the *stored* credential, using a
    // version-tolerant verify:
    //   - the configured PIN does not match  -> genuine rotation, revoke sessions
    //   - it matches but on a superseded KDF  -> re-hash only, keep sessions
    //   - it matches on the current KDF       -> leave the row alone
    //
    // The previous code re-hashed unconditionally on every boot, which reset the
    // lockout counter on each restart. The variant before that compared only the
    // current scheme, so after the KDF was strengthened it would have judged
    // every existing account as "changed" and revoked its sessions on boot.
    let rotate = false
    let rehashOnly = false
    if (SUPER_ADMIN.pin && existing.pinSalt && existing.pinHash) {
      const verification = verifyPinDetailed(SUPER_ADMIN.pin, existing.pinSalt, existing.pinHash)
      rotate = !verification.valid
      rehashOnly = verification.valid && verification.version !== CURRENT_KDF_VERSION
    }
    const replacement = rotate || rehashOnly ? hashPin(SUPER_ADMIN.pin) : null

    db.prepare(
      `UPDATE supervisors
       SET fullName = ?, stationId = NULL, companyId = ?, isHeadOffice = 0, isSuperAdmin = 1,
           pinSalt = COALESCE(?, pinSalt), pinHash = COALESCE(?, pinHash),
           approvalStatus = 'APPROVED', approvedAt = COALESCE(approvedAt, ?), approvedBy = COALESCE(approvedBy, 'SYSTEM_SEED'),
           active = 1
       WHERE id = ?`,
    ).run(
      SUPER_ADMIN.fullName,
      SUPER_ADMIN.companyId,
      replacement?.salt ?? null,
      replacement?.hash ?? null,
      new Date().toISOString(),
      existing.id,
    )
    if (rotate) {
      // Every other credential-change path revokes sessions; this one did not,
      // so rotating the platform admin PIN left old tokens working.
      db.prepare('DELETE FROM sessions WHERE userId = ?').run(existing.id)
      console.log('[db] SUPER-ADMIN PIN rotated — existing sessions revoked')
    } else if (rehashOnly) {
      console.log(`[db] SUPER-ADMIN credential upgraded to KDF v${CURRENT_KDF_VERSION} (PIN unchanged, sessions preserved)`)
    }
    console.log(`[db] Ensured SUPER-ADMIN (${SUPER_ADMIN.employeeCode})`)
    return
  }

  // First boot for this database: create the platform admin.
  //
  // With no SUPER_ADMIN_PIN configured, a strong random PIN is generated once
  // and printed to the log. The previous behaviour was to refuse to start,
  // which is safe but means a deployment with no environment configuration
  // crash-loops with no way to recover except editing the orchestrator. A
  // generated credential is strictly better than a shipped default: nobody
  // knows it beforehand, it is not in any file or commit, and it is only ever
  // disclosed once in the boot log.
  const generated = !SUPER_ADMIN.pin
  const effectivePin = SUPER_ADMIN.pin ?? generateSuperAdminPin()
  const pin = hashPin(effectivePin)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode,
     phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?)`,
  ).run(
    SUPER_ADMIN.id,
    SUPER_ADMIN.employeeCode,
    SUPER_ADMIN.fullName,
    pin.salt,
    pin.hash,
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
  if (generated) {
    console.log('')
    console.log('='.repeat(72))
    console.log('  SUPER-ADMIN ACCOUNT CREATED — RECORD THIS PIN NOW')
    console.log('='.repeat(72))
    console.log(`  Employee code : ${SUPER_ADMIN.employeeCode}`)
    console.log(`  PIN           : ${effectivePin}`)
    console.log('')
    console.log('  This PIN was generated randomly on first boot and is shown ONLY')
    console.log('  here. It is not stored in plaintext and cannot be recovered.')
    console.log('  Sign in, then set SUPER_ADMIN_PIN in the deployment environment')
    console.log('  so it is reproducible across rebuilds.')
    console.log('='.repeat(72))
    console.log('')
  }
  console.log(`[db] Seeded SUPER-ADMIN (${SUPER_ADMIN.employeeCode})`)
}

/** 8-digit credential from a CSPRNG, well outside the 4-digit space. */
function generateSuperAdminPin(): string {
  const range = 9_000_000_000 + (crypto.randomInt(0, 1_000_000_000) as number)
  return String(range)
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
  if (ENV.IS_PRODUCTION) return
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

  const hqPin = process.env.DEMO_HQ_PIN?.trim() || '999988'
  const attendantPin = process.env.DEMO_ATTENDANT_PIN?.trim() || '123477'
  if (!/^\d{4,32}$/.test(hqPin) || !/^\d{4,32}$/.test(attendantPin)) {
    throw new Error('DEMO_HQ_PIN and DEMO_ATTENDANT_PIN must be 4-32 digit values.')
  }
  const { salt: hqSalt, hash: hqHash } = hashPin(hqPin)
  const { salt: attSalt, hash: attHash } = hashPin(attendantPin)

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
  console.log('[db] Seeded development OMCs, stations, HQ admins, and attendants')
}

export function seedAllProductionData(): void {
  seedSuperAdmin()
  seedDefaultProducts()
  if (ENV.SEED_DEMO_DATA) seedDefaultCompanies()
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

