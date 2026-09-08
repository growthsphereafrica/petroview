import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { ENV, FUEL_PRICES, STATIONS } from './config'
import { hashPin } from './auth'

export type FuelCode = 'PMS' | 'AGO' | 'DPK' | 'KERO'
export type PaymentMethod = 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'
export type ShiftStatus = 'OPEN' | 'CLOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED'
export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'
export type SyncEntityType = 'SHIFT' | 'TRANSACTION' | 'RECEIPT'
export type AuditAction =
  | 'REVIEW_APPROVED'
  | 'REJECTED'
  | 'PIN_RESET'
  | 'ATTENDANT_REGISTERED'
  | 'ATTENDANT_DEACTIVATED'
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'

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

export function initSchema(): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS attendants (
  id TEXT PRIMARY KEY,
  employeeCode TEXT NOT NULL UNIQUE,
  fullName TEXT NOT NULL,
  pinSalt TEXT NOT NULL,
  pinHash TEXT NOT NULL,
  pumpId TEXT,
  stationId TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failedAttempts INTEGER NOT NULL DEFAULT 0,
  lockoutUntil TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supervisors (
  id TEXT PRIMARY KEY,
  employeeCode TEXT NOT NULL UNIQUE,
  fullName TEXT NOT NULL,
  pinSalt TEXT NOT NULL,
  pinHash TEXT NOT NULL,
  stationId TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failedAttempts INTEGER NOT NULL DEFAULT 0,
  lockoutUntil TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  userId TEXT NOT NULL,
  employeeCode TEXT NOT NULL,
  fullName TEXT NOT NULL,
  stationId TEXT,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  shiftId TEXT NOT NULL,
  image TEXT NOT NULL,
  capturedAt TEXT NOT NULL,
  syncStatus TEXT NOT NULL
);

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
`)

  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
  const ensureIndex = (name: string, sql: string): void => {
    if (!idx.get(name)) db.exec(sql)
  }
  ensureIndex('idx_shifts_station_status', 'CREATE INDEX idx_shifts_station_status ON shifts (stationId, status)')
  ensureIndex('idx_shifts_openedAt', 'CREATE INDEX idx_shifts_openedAt ON shifts (openedAt)')
  ensureIndex('idx_audit_timestamp', 'CREATE INDEX idx_audit_timestamp ON audit_log (timestamp)')
}

export function todayAt(daysAgo: number, hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
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
  opening: Partial<Record<FuelCode, number>>
  closing: Partial<Record<FuelCode, number>>
  payments: PaymentsBreakdown
  status: ShiftStatus
  notes: string | null
  reviewerNotes: string | null
  syncStatus: SyncStatus
}

const emptyPayments = (): PaymentsBreakdown => ({ CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 })

function buildSeedShift(spec: SeedShiftSpec): Shift {
  const fuels = ['PMS', 'AGO', 'DPK', 'KERO'] as const
  const readings = (map: Partial<Record<FuelCode, number>>): MeterReading[] =>
    fuels.filter(f => Number.isFinite(map[f])).map(f => ({ fuelCode: f, value: map[f] as number }))
  const sales: FuelSale[] = fuels.map(fuel => {
    const litres = Math.max(0, (spec.closing[fuel] ?? 0) - (spec.opening[fuel] ?? 0))
    const unitPrice = FUEL_PRICES[fuel]
    return { fuelCode: fuel, litres, unitPrice, amount: Math.round(litres * unitPrice * 100) / 100 }
  })
  const expectedTotal = Math.round(sales.reduce((a, s) => a + s.amount, 0) * 100) / 100
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
    openingReadings: readings(spec.opening),
    closingReadings: readings(spec.closing),
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

export const SEED_SHIFTS: SeedShiftSpec[] = [
  {
    id: 'hist-01', number: 'MVP-H0001', attendantId: 'att-att1001', attendantName: 'Aisha Boateng',
    stationId: 'STN-GV-042', stationName: 'Green Valley Main', pumpId: 'pump-1', pumpName: 'Pump 1',
    daysAgo: 0, startHour: 6, endHour: 14,
    opening: { PMS: 100000, AGO: 80000 }, closing: { PMS: 100150, AGO: 80110 },
    payments: { CASH: 2000, MOMO: 1892, VOUCHER: 0, CREDIT: 0 },
    status: 'APPROVED', notes: null, reviewerNotes: 'Approved by Kwame Mensah. Reconciled to the pesewa.', syncStatus: 'SYNCED',
  },
  {
    id: 'hist-02', number: 'MVP-H0002', attendantId: 'att-att1002', attendantName: 'Kofi Asante',
    stationId: 'STN-GV-042', stationName: 'Green Valley Main', pumpId: 'pump-2', pumpName: 'Pump 2',
    daysAgo: 0, startHour: 8, endHour: 16,
    opening: { PMS: 50000, AGO: 40000 }, closing: { PMS: 50200, AGO: 40120 },
    payments: { CASH: 2960, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'CLOSED', notes: 'Busy morning rush.', reviewerNotes: null, syncStatus: 'PENDING',
  },
  {
    id: 'hist-03', number: 'MVP-H0003', attendantId: 'att-att2001', attendantName: 'Kwabena Owusu',
    stationId: 'STN-AB-015', stationName: 'Airport Bypass Express', pumpId: 'pump-1', pumpName: 'Pump 1',
    daysAgo: 0, startHour: 7, endHour: 15,
    opening: { PMS: 30000, AGO: 25000 }, closing: { PMS: 30160, AGO: 25250 },
    payments: { CASH: 3700, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'REJECTED', notes: 'Cash count shortfall at handover.', reviewerNotes: 'Rejected by Ebenezer Osei — GHS 100 unexplained cash shortage.', syncStatus: 'SYNCED',
  },
  {
    id: 'hist-04', number: 'MVP-H0004', attendantId: 'att-att3001', attendantName: 'Adjoa Baidoo',
    stationId: 'STN-TH-021', stationName: 'Takoradi Harbour Hub', pumpId: 'pump-1', pumpName: 'Pump 1',
    daysAgo: 0, startHour: 9, endHour: 17,
    opening: { PMS: 75000, AGO: 60000, DPK: 20000 }, closing: { PMS: 75120, AGO: 60100, DPK: 20080 },
    payments: { CASH: 2908, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'CLOSED', notes: null, reviewerNotes: null, syncStatus: 'PENDING',
  },
  {
    id: 'hist-05', number: 'MVP-H0005', attendantId: 'att-att1001', attendantName: 'Aisha Boateng',
    stationId: 'STN-GV-042', stationName: 'Green Valley Main', pumpId: 'pump-1', pumpName: 'Pump 1',
    daysAgo: 1, startHour: 6, endHour: 14,
    opening: { PMS: 98500, AGO: 79000 }, closing: { PMS: 98710, AGO: 79140 },
    payments: { CASH: 3080, MOMO: 1030, VOUCHER: 0, CREDIT: 0 },
    status: 'APPROVED', notes: null, reviewerNotes: 'Approved. Minor coin variance justified.', syncStatus: 'SYNCED',
  },
  {
    id: 'hist-06', number: 'MVP-H0006', attendantId: 'att-att2001', attendantName: 'Kwabena Owusu',
    stationId: 'STN-AB-015', stationName: 'Airport Bypass Express', pumpId: 'pump-1', pumpName: 'Pump 1',
    daysAgo: 1, startHour: 7, endHour: 15,
    opening: { PMS: 28000, AGO: 23000 }, closing: { PMS: 28105, AGO: 23090 },
    payments: { CASH: 1554, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    status: 'APPROVED', notes: null, reviewerNotes: 'Approved without discrepancy.', syncStatus: 'SYNCED',
  },
]

export function seedData(): void {
  const attendants = [
    { id: 'att-att1001', employeeCode: 'ATT1001', fullName: 'Aisha Boateng', pin: '2024', pumpId: 'pump-1', stationId: 'STN-GV-042' },
    { id: 'att-att1002', employeeCode: 'ATT1002', fullName: 'Kofi Asante', pin: '3319', pumpId: 'pump-2', stationId: 'STN-GV-042' },
    { id: 'att-att1003', employeeCode: 'ATT1003', fullName: 'Nana Yaw Owusu', pin: '1187', pumpId: 'pump-3', stationId: 'STN-GV-042' },
    { id: 'att-att1004', employeeCode: 'ATT1004', fullName: 'Esi Mensah', pin: '5520', pumpId: 'pump-4', stationId: 'STN-GV-042' },
    { id: 'att-att2001', employeeCode: 'ATT2001', fullName: 'Kwabena Owusu', pin: '4726', pumpId: 'pump-1', stationId: 'STN-AB-015' },
    { id: 'att-att3001', employeeCode: 'ATT3001', fullName: 'Adjoa Baidoo', pin: '8391', pumpId: 'pump-1', stationId: 'STN-TH-021' },
  ]
  const supervisors = [
    { id: 'sup-sup1001', employeeCode: 'SUP1001', fullName: 'Kwame Mensah', pin: '5678', stationId: 'STN-GV-042' },
    { id: 'sup-sup1002', employeeCode: 'SUP1002', fullName: 'Ebenezer Osei', pin: '5678', stationId: 'STN-AB-015' },
    { id: 'sup-sup1003', employeeCode: 'SUP1003', fullName: 'Daniel Larbi', pin: '5678', stationId: 'STN-TH-021' },
  ]

  const insAtt = db.prepare(`INSERT OR IGNORE INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, active, failedAttempts, lockoutUntil, createdAt) VALUES (?,?,?,?,?,?,?,1,0,NULL,?)`)
  const insSup = db.prepare(`INSERT OR IGNORE INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, active, failedAttempts, lockoutUntil, createdAt) VALUES (?,?,?,?,?,?,1,0,NULL,?)`)
  const now = new Date().toISOString()
  for (const a of attendants) {
    const { salt, hash } = hashPin(a.pin)
    insAtt.run(a.id, a.employeeCode, a.fullName, salt, hash, a.pumpId, a.stationId, now)
  }
  for (const s of supervisors) {
    const { salt, hash } = hashPin(s.pin)
    insSup.run(s.id, s.employeeCode, s.fullName, salt, hash, s.stationId, now)
  }

  const insShift = db.prepare(`
    INSERT OR IGNORE INTO shifts (
      id, number, attendantId, attendantName, pumpId, pumpName, stationId, stationName,
      status, openedAt, closedAt, openingReadings, closingReadings, sales,
      expectedTotal, payments, actualTotal, variance, notes, reviewerNotes, syncStatus, createdAt, updatedAt
    ) VALUES (
      @id, @number, @attendantId, @attendantName, @pumpId, @pumpName, @stationId, @stationName,
      @status, @openedAt, @closedAt, @openingReadings, @closingReadings, @sales,
      @expectedTotal, @payments, @actualTotal, @variance, @notes, @reviewerNotes, @syncStatus, @createdAt, @updatedAt
    )
  `)
  const insertMany = db.transaction((list: Shift[]) => {
    for (const shift of list) {
      insShift.run({
        ...shift,
        openingReadings: JSON.stringify(shift.openingReadings),
        closingReadings: JSON.stringify(shift.closingReadings),
        sales: JSON.stringify(shift.sales),
        payments: JSON.stringify(shift.payments),
      })
    }
  })
  insertMany(SEED_SHIFTS.map(buildSeedShift))

  const insTx = db.prepare(`INSERT OR IGNORE INTO transactions (id, shiftId, attendantId, fuelCode, litres, amount, unitPrice, method, customerRef, recordedAt, syncStatus) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  const seedTxs = [
    ['seed-tx-1', 'hist-01', 'att-att1001', 'PMS', 100, 1480, 14.8, 'CASH', null, todayAt(0, 9, 15), 'SYNCED'],
    ['seed-tx-2', 'hist-01', 'att-att1001', 'AGO', 110, 1672, 15.2, 'MOMO', null, todayAt(0, 10, 40), 'SYNCED'],
    ['seed-tx-3', 'hist-02', 'att-att1002', 'PMS', 200, 2960, 14.8, 'CASH', null, todayAt(0, 12, 5), 'PENDING'],
    ['seed-tx-4', 'hist-04', 'att-att3001', 'DPK', 80, 1112, 13.9, 'CASH', null, todayAt(0, 14, 20), 'PENDING'],
  ]
  for (const tx of seedTxs) insTx.run(...(tx as (string | number | null)[]))

  const insQueue = db.prepare(`INSERT OR IGNORE INTO syncQueue (id, entityType, entityId, status, attempts, nextRetryAt, lastError, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`)
  for (const spec of SEED_SHIFTS.filter(s => s.syncStatus === 'PENDING')) {
    insQueue.run(`sync-shift-${spec.id}`, 'SHIFT', spec.id, 'PENDING', 0, null, null, todayAt(spec.daysAgo, spec.startHour, 0), todayAt(spec.daysAgo, spec.endHour, 0))
  }
}

export function seedStations(): void {
  const ins = db.prepare(`INSERT OR IGNORE INTO shifts (id, number, stationId, stationName) SELECT ? WHERE 0`)
  void ins
}

export function bootDb(): void {
  initSchema()
  seedData()
}

export const countAttendants = (): number => (db.prepare('SELECT COUNT(*) AS c FROM attendants').get() as { c: number }).c