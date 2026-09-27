import { Router } from 'express'
import { db, deserializeShift, type ShiftRow, type ShiftStatus, type SyncEntityType } from '../db'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'
import { newToken } from '../auth'
import { ENV } from '../config'
import type { AuditAction, FuelCode, PaymentMethod } from '../db'

export const syncRouter = Router()

interface SyncEntity {
  type: SyncEntityType
  data: Record<string, unknown>
}

interface SyncPayload {
  deviceId?: string
  entities?: SyncEntity[]
}

interface StationScope {
  id: string
  companyId: string
  companyShortCode: string | null
  name: string
}

const PAYMENT_METHODS = new Set(['CASH', 'MOMO', 'VOUCHER', 'CREDIT'])
const EXPENSE_PAYMENT_SOURCES = new Set(['CASH', 'MOMO', 'VOUCHER', 'CREDIT', 'STATION_ACCOUNT', 'OTHER'])
const SHIFT_STATUSES = new Set(['OPEN', 'CLOSED'])
const MAX_ENTITIES = 500
const MAX_READINGS = 100
// ~1.5MB of base64 payload, roughly a 1MP receipt photo. Enough for a legible
// chit, small enough that the receipts table cannot be used as free storage.
const MAX_RECEIPT_IMAGE_CHARS = 2_000_000

const upsertShift = db.prepare(`
  INSERT INTO shifts (
    id, number, attendantId, attendantName, pumpId, pumpName, stationId, stationName,
    companyId, companyShortCode,
    status, openedAt, closedAt, openingReadings, closingReadings, sales,
    expectedTotal, payments, actualTotal, variance, notes, reviewerNotes, syncStatus, createdAt, updatedAt
  ) VALUES (
    @id, @number, @attendantId, @attendantName, @pumpId, @pumpName, @stationId, @stationName,
    @companyId, @companyShortCode,
    @status, @openedAt, @closedAt, @openingReadings, @closingReadings, @sales,
    @expectedTotal, @payments, @actualTotal, @variance, @notes, @reviewerNotes, 'SYNCED', @createdAt, @updatedAt
  )
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    closedAt = excluded.closedAt,
    closingReadings = excluded.closingReadings,
    sales = excluded.sales,
    expectedTotal = excluded.expectedTotal,
    payments = excluded.payments,
    actualTotal = excluded.actualTotal,
    variance = excluded.variance,
    notes = excluded.notes,
    syncStatus = 'SYNCED',
    updatedAt = excluded.updatedAt
`)

const insertShift = db.prepare(`
  INSERT INTO shifts (
    id, number, attendantId, attendantName, pumpId, pumpName, stationId, stationName,
    companyId, companyShortCode, status, openedAt, closedAt, openingReadings, closingReadings,
    sales, expectedTotal, payments, actualTotal, variance, notes, reviewerNotes, syncStatus, createdAt, updatedAt
  ) VALUES (
    @id, @number, @attendantId, @attendantName, @pumpId, @pumpName, @stationId, @stationName,
    @companyId, @companyShortCode, @status, @openedAt, @closedAt, @openingReadings, @closingReadings,
    @sales, @expectedTotal, @payments, @actualTotal, @variance, @notes, @reviewerNotes, 'SYNCED', @createdAt, @updatedAt
  )
`)

const upsertTransaction = db.prepare(`
  INSERT INTO transactions (id, shiftId, attendantId, fuelCode, litres, amount, unitPrice, method, customerRef, recordedAt, syncStatus)
  VALUES (@id, @shiftId, @attendantId, @fuelCode, @litres, @amount, @unitPrice, @method, @customerRef, @recordedAt, 'SYNCED')
  ON CONFLICT(id) DO UPDATE SET
    litres = excluded.litres,
    amount = excluded.amount,
    unitPrice = excluded.unitPrice,
    method = excluded.method,
    customerRef = excluded.customerRef,
    recordedAt = excluded.recordedAt,
    syncStatus = 'SYNCED'
`)

const upsertReceipt = db.prepare(`
  INSERT INTO receipts (id, shiftId, image, capturedAt, syncStatus)
  VALUES (@id, @shiftId, @image, @capturedAt, 'SYNCED')
  ON CONFLICT(id) DO UPDATE SET image = excluded.image, capturedAt = excluded.capturedAt, syncStatus = 'SYNCED'
`)

const upsertTankReading = db.prepare(`
  INSERT INTO tankReadings (id, stationId, companyId, recordedBy, recordedByName, readings, recordedAt, notes, createdAt)
  VALUES (@id, @stationId, @companyId, @recordedBy, @recordedByName, @readings, @recordedAt, @notes, @createdAt)
  ON CONFLICT(id) DO UPDATE SET readings = excluded.readings, notes = excluded.notes, recordedAt = excluded.recordedAt
`)

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function text(value: unknown, field: string, required = true): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (required && !result) throw new Error(`${field} is required.`)
  if (result.length > 200) throw new Error(`${field} is too long.`)
  return result
}

function numberValue(value: unknown, field: string, allowZero = true): number {
  const result = Number(value)
  if (!Number.isFinite(result) || Math.abs(result) > 1_000_000_000_000 || (allowZero ? result < 0 : result <= 0)) throw new Error(`${field} must be a valid number.`)
  return result
}

function dateValue(value: unknown, field: string, fallback = new Date().toISOString()): string {
  if (value === undefined || value === null || value === '') return fallback
  const result = String(value)
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a valid date.`)
  return result
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function dateOnly(value: unknown, field: string): string {
  const result = text(value, field)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00.000Z`))) throw new Error(`${field} must use YYYY-MM-DD.`)
  return result
}

function validateMeterReadings(value: unknown, field: string): Array<Record<string, unknown>> {
  const readings = Array.isArray(value) ? value : []
  if (readings.length > MAX_READINGS) throw new Error(`${field} contains too many readings.`)
  const seen = new Set<string>()
  return readings.map(item => {
    if (!item || typeof item !== 'object') throw new Error(`${field} contains an invalid reading.`)
    const reading = item as Record<string, unknown>
    const fuelCode = typeof reading.fuelCode === 'string' ? reading.fuelCode.trim().toUpperCase() : ''
    if (!/^[A-Z0-9_-]{1,20}$/.test(fuelCode) || seen.has(fuelCode)) throw new Error(`${field} contains an invalid or duplicate fuel code.`)
    seen.add(fuelCode)
    const readingValue = Number(reading.value)
    if (!Number.isFinite(readingValue) || readingValue < 0 || readingValue > 1_000_000_000) throw new Error(`${field} contains an invalid meter value.`)
    return { fuelCode, value: readingValue }
  })
}

function availableFuelCodes(companyId: string): Set<string> {
  const rows = db.prepare('SELECT code FROM products WHERE active = 1 AND (companyId = ? OR companyId IS NULL)').all(companyId) as Array<{ code: string }>
  return new Set(rows.map(row => row.code.toUpperCase()))
}

const authoritativePriceStmt = db.prepare(`
  SELECT unitPrice FROM products
  WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?)
  ORDER BY companyId IS NULL ASC
  LIMIT 1
`)

/**
 * Resolves the price the company actually authorises for a fuel code. A
 * company-specific product overrides the shared catalogue entry. Returns
 * undefined when the fuel code has no priced product, in which case the
 * caller falls back to the device-supplied price.
 */
function authoritativePrice(companyId: string, fuelCode: string): number | undefined {
  if (!companyId) return undefined
  const row = authoritativePriceStmt.get(fuelCode, companyId) as { unitPrice: number } | undefined
  if (!row) return undefined
  const price = Number(row.unitPrice)
  return Number.isFinite(price) && price > 0 ? price : undefined
}

/**
 * A device may not invent its own price. The synced unit price must match the
 * company price list within PRICE_TOLERANCE_GHS, so an attendant cannot sell at
 * 0.01/litre and still produce a shift that reconciles to zero variance.
 *
 * The tolerance exists for one operational reason: a device that was offline
 * across a price change holds a stale price list. Widen PRICE_TOLERANCE_GHS for
 * a rollout window rather than disabling this check, and never above the size of
 * the price change.
 */
function enforceAuthoritativePrice(companyId: string, fuelCode: string, clientPrice: number, field: string): void {
  const expected = authoritativePrice(companyId, fuelCode)
  if (expected === undefined) return
  const drift = Math.abs(clientPrice - expected)
  if (drift > ENV.PRICE_TOLERANCE_GHS) {
    throw new Error(`${field} for ${fuelCode} is ${clientPrice.toFixed(2)} but the company price is ${expected.toFixed(2)}. Reload the price list on this device or escalate to a supervisor.`)
  }
}

function normalizeSales(value: unknown, companyId: string): { value: Array<Record<string, unknown>>; total: number } {
  const sales = Array.isArray(value) ? value : []
  if (sales.length > 10_000) throw new Error('Shift contains too many sales.')
  const allowed = availableFuelCodes(companyId)
  const seen = new Set<string>()
  let total = 0
  const normalized = sales.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Shift contains an invalid sale.')
    const sale = item as Record<string, unknown>
    const fuelCode = typeof sale.fuelCode === 'string' ? sale.fuelCode.trim().toUpperCase() : ''
    if (!/^[A-Z0-9_-]{1,20}$/.test(fuelCode) || seen.has(fuelCode) || (allowed.size > 0 && !allowed.has(fuelCode))) throw new Error('Shift contains an invalid or unavailable fuel code.')
    seen.add(fuelCode)
    const litres = numberValue(sale.litres, 'litres')
    const unitPrice = numberValue(sale.unitPrice, 'unitPrice')
    if (litres > 0 && unitPrice <= 0) throw new Error('A sale with litres must have a positive unit price.')
    if (litres > 0) enforceAuthoritativePrice(companyId, fuelCode, unitPrice, 'Sale unit price')
    const amount = numberValue(sale.amount, 'amount')
    if (Math.abs(amount - money(litres * unitPrice)) > 0.02) throw new Error('Sale amount does not match litres and unit price.')
    total = money(total + amount)
    return { fuelCode, litres, unitPrice, amount }
  })
  return { value: normalized, total }
}

function normalizePayments(value: unknown): { value: Record<string, number>; total: number } {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const result: Record<string, number> = { CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 }
  for (const method of Object.keys(result)) {
    result[method] = numberValue(source[method] ?? 0, method)
  }
  return { value: result, total: money(Object.values(result).reduce((sum, item) => sum + item, 0)) }
}

function resolveStation(stationId: string): StationScope | undefined {
  return db.prepare(`
    SELECT cs.id, cs.companyId, cs.name, c.shortCode AS companyShortCode
    FROM companyStations cs
    JOIN companies c ON c.id = cs.companyId
    WHERE cs.active = 1 AND c.active = 1
      AND (UPPER(cs.id) = UPPER(?) OR UPPER(cs.code) = UPPER(?) OR UPPER(REPLACE(cs.id, 'STN-', '')) = UPPER(REPLACE(?, 'STN-', '')))
    LIMIT 1
  `).get(stationId, stationId, stationId) as StationScope | undefined
}

function canAccessStation(session: SessionClaims, station: StationScope): boolean {
  if (session.role === 'superadmin') return true
  if (session.role === 'headoffice') return session.companyId === station.companyId
  return session.stationId !== null && session.stationId === station.id
}

function stationForSession(session: SessionClaims, value: unknown, field = 'stationId'): StationScope {
  const stationId = text(value, field)
  const station = resolveStation(stationId)
  if (!station || !canAccessStation(session, station)) throw new Error(`${field} is outside your account scope.`)
  return station
}

function resolveAttendant(value: unknown, station: StationScope): string {
  const attendant = text(value, 'attendantId')
  const row = db.prepare(`
    SELECT id, stationId, companyId
    FROM attendants
    WHERE id = ? COLLATE NOCASE OR employeeCode = ? COLLATE NOCASE
    LIMIT 1
  `).get(attendant, attendant) as { id: string; stationId: string | null; companyId: string | null } | undefined
  if (!row || (row.stationId && row.stationId !== station.id) || (row.companyId && row.companyId !== station.companyId)) {
    throw new Error('attendantId is outside the selected station.')
  }
  return row.id
}

function canAccessShift(session: SessionClaims, shift: { stationId: string; attendantId: string; companyId?: string | null }): boolean {
  const station = resolveStation(shift.stationId)
  if (!station || !canAccessStation(session, station)) return false
  if (session.role === 'attendant') return shift.attendantId === session.userId
  return true
}

function meterReadingsFromLegacy(obj: unknown): Array<{ fuelCode: string; value: number }> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).map(([fuelCode, val]) => ({
    fuelCode: fuelCode.toUpperCase(),
    value: Number(val),
  })).filter(r => !isNaN(r.value) && r.value >= 0)
}

function salesFromLegacy(obj: unknown): Array<{ fuelCode: string; litres: number; unitPrice: number; amount: number }> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).map(([fuelCode, val]) => {
    const s = (val ?? {}) as Record<string, unknown>
    return {
      fuelCode: fuelCode.toUpperCase(),
      litres: Number(s.litres ?? 0),
      unitPrice: Number(s.price ?? s.unitPrice ?? 0),
      amount: Number(s.amount ?? 0),
    }
  }).filter(s => s.litres > 0 || s.amount > 0)
}

function paymentsFromLegacy(obj: unknown): Record<string, number> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const source = obj as Record<string, unknown>
  return {
    CASH: Number(source.cash ?? source.CASH ?? 0),
    MOMO: Number(source.momo ?? source.MOMO ?? 0),
    VOUCHER: Number(source.voucher ?? source.VOUCHER ?? 0),
    CREDIT: Number(source.credit ?? source.CREDIT ?? 0),
  }
}

function validateShiftData(session: SessionClaims, data: Record<string, unknown>, review = false): Record<string, unknown> {
  const id = text(data.id, 'id')
  const number = text(data.number ?? data.shiftNumber, 'number')
  const station = stationForSession(session, data.stationId)
  const attendantId = resolveAttendant(data.attendantId, station)
  if (session.role === 'attendant' && attendantId !== session.userId) throw new Error('An attendant can only sync their own shift.')
  let rawStatus = String(data.status ?? 'OPEN').toUpperCase()
  if (rawStatus === 'ACTIVE') rawStatus = 'OPEN'
  if (rawStatus === 'COMPLETED' || rawStatus === 'APPROVED' || rawStatus === 'REVIEWED') rawStatus = 'CLOSED'
  const status = review ? 'CLOSED' : rawStatus
  if (!SHIFT_STATUSES.has(status)) throw new Error('Invalid shift status.')
  const openedAt = dateValue(data.openedAt ?? data.startTime, 'openedAt')
  const rawClosedAt = data.closedAt ?? data.endTime
  const closedAt = rawClosedAt ? dateValue(rawClosedAt, 'closedAt') : null
  if (new Date(openedAt).getTime() > Date.now() + 5 * 60_000) throw new Error('openedAt cannot be in the future.')
  if (closedAt && new Date(closedAt).getTime() < new Date(openedAt).getTime()) throw new Error('closedAt cannot be before openedAt.')
  if (status === 'CLOSED' && !closedAt) throw new Error('closedAt is required for a closed shift.')
  if (status === 'OPEN' && closedAt) throw new Error('closedAt is not allowed for an open shift.')
  const rawOpening = Array.isArray(data.openingReadings) ? data.openingReadings : meterReadingsFromLegacy(data.openingMeters)
  const rawClosing = Array.isArray(data.closingReadings) ? data.closingReadings : meterReadingsFromLegacy(data.closingMeters)
  const openingReadings = validateMeterReadings(rawOpening, 'openingReadings')
  const closingReadings = validateMeterReadings(rawClosing, 'closingReadings')
  if (openingReadings.length === 0) throw new Error('openingReadings are required.')
  if (status === 'CLOSED') {
    if (closingReadings.length === 0) throw new Error('closingReadings are required for a closed shift.')
    const openingCodes = new Set(openingReadings.map(reading => reading.fuelCode))
    const closingCodes = new Set(closingReadings.map(reading => reading.fuelCode))
    if (openingCodes.size !== closingCodes.size || [...openingCodes].some(code => !closingCodes.has(code))) throw new Error('closingReadings must contain the same fuel codes as openingReadings.')
  }
  const rawSales = Array.isArray(data.sales) ? data.sales : salesFromLegacy(data.fuelSales)
  const sales = normalizeSales(rawSales, station.companyId)
  if (status === 'CLOSED') {
    const openingByFuel = new Map(openingReadings.map(reading => [String(reading.fuelCode), Number(reading.value)]))
    const salesByFuel = new Map(sales.value.map(sale => [String(sale.fuelCode), Number(sale.litres)]))
    const closingCodes = new Set(closingReadings.map(reading => String(reading.fuelCode)))
    if (sales.value.some(sale => Number(sale.litres) > 0 && !closingCodes.has(String(sale.fuelCode)))) throw new Error('Shift sales contain a fuel without a closing meter reading.')
    for (const closing of closingReadings) {
      const openingValue = openingByFuel.get(String(closing.fuelCode)) ?? 0
      if (Number(closing.value) < openingValue) throw new Error('A closing meter reading cannot be below its opening reading.')
      const meteredLitres = money(Number(closing.value) - openingValue)
      const saleLitres = salesByFuel.get(String(closing.fuelCode)) ?? 0
      if (Math.abs(meteredLitres - saleLitres) > 0.05) throw new Error('Shift sales do not match the opening and closing meter readings.')
    }
  }
  const rawPayments = data.payments ?? paymentsFromLegacy(data.breakdown)
  const payments = normalizePayments(rawPayments)
  const expectedInput = numberValue(data.expectedTotal ?? sales.total, 'expectedTotal')
  const actualInput = numberValue(data.actualTotal ?? payments.total, 'actualTotal')
  const varianceInput = Number(data.variance ?? money(payments.total - sales.total))
  if (Math.abs(expectedInput - sales.total) > 0.02) throw new Error('expectedTotal does not match the synced sales.')
  if (Math.abs(actualInput - payments.total) > 0.02) throw new Error('actualTotal does not match the synced payments.')
  if (!Number.isFinite(varianceInput) || Math.abs(varianceInput - money(payments.total - sales.total)) > 0.02) throw new Error('variance does not match the synced totals.')
  const pumpId = text(data.pumpId, 'pumpId', false)
  let pumpName = ''
  if (pumpId) {
    const pump = db.prepare('SELECT name FROM pumps WHERE id = ? AND stationId = ? AND active = 1').get(pumpId, station.id) as { name: string } | undefined
    if (!pump) throw new Error('pumpId is not active at the selected station.')
    pumpName = pump.name
  }
  const attendant = db.prepare('SELECT fullName FROM attendants WHERE id = ?').get(attendantId) as { fullName: string } | undefined
  return {
    id,
    number,
    attendantId,
    attendantName: attendant?.fullName || 'Attendant',
    pumpId,
    pumpName,
    stationId: station.id,
    stationName: station.name,
    companyId: station.companyId,
    companyShortCode: station.companyShortCode,
    status,
    openedAt,
    closedAt,
    openingReadings: JSON.stringify(openingReadings),
    closingReadings: JSON.stringify(closingReadings),
    sales: JSON.stringify(sales.value),
    expectedTotal: sales.total,
    payments: JSON.stringify(payments.value),
    actualTotal: payments.total,
    variance: money(payments.total - sales.total),
    notes: typeof data.notes === 'string' ? data.notes.trim().slice(0, 2000) : null,
    reviewerNotes: typeof data.reviewerNotes === 'string' ? data.reviewerNotes.trim().slice(0, 2000) : null,
    createdAt: dateValue(data.createdAt, 'createdAt', openedAt),
    updatedAt: dateValue(data.updatedAt, 'updatedAt'),
  }
}

function getShiftForEntity(id: unknown): { id: string; stationId: string; attendantId: string; companyId?: string | null; status: string; number: string; openedAt: string; closedAt: string | null } {
  const shiftId = text(id, 'shiftId')
  const shift = db.prepare('SELECT id, stationId, attendantId, companyId, status, number, openedAt, closedAt FROM shifts WHERE id = ?').get(shiftId) as { id: string; stationId: string; attendantId: string; companyId?: string | null; status: string; number: string; openedAt: string; closedAt: string | null } | undefined
  if (!shift) throw new Error('Referenced shift was not found.')
  return shift
}

function queue(entityType: SyncEntityType, entityId: string, createdAt: string): void {
  db.prepare('DELETE FROM syncQueue WHERE entityType = ? AND entityId = ?').run(entityType, entityId)
  db.prepare('INSERT INTO syncQueue (id, entityType, entityId, status, attempts, nextRetryAt, lastError, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(newToken(), entityType, entityId, 'SYNCED', 1, null, null, createdAt, new Date().toISOString())
}

const insertAudit = db.prepare(`
  INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, meta, timestamp)
  VALUES (@id, @action, @actorId, @actorName, @actorRole, @targetId, @targetDescription, NULL, @meta, @timestamp)
`)

/**
 * Writes an audit row from inside a sync transaction.
 *
 * The product is sold on the premise that an NPA or tax auditor can verify
 * every cedi taken. That is only true if a sale, a shift opening and a shift
 * closing each leave a server-side record; previously the action types were
 * declared in the AuditAction union but nothing ever wrote them.
 */
function recordAudit(action: AuditAction, targetId: string, description: string, meta: Record<string, unknown>, session: SessionClaims): void {
  insertAudit.run({
    id: newToken(),
    action,
    actorId: session.userId,
    actorName: session.fullName,
    actorRole: session.role.toUpperCase(),
    targetId,
    targetDescription: description.slice(0, 500),
    meta: JSON.stringify(meta),
    timestamp: new Date().toISOString(),
  })
}

export function assertShiftLedger(shift: ShiftRow & { companyId?: string | null }): void {
  if (!shift.companyId) {
    // Fail closed. Returning silently meant a shift with an unresolvable company
    // skipped every reconciliation check and was accepted as verified.
    throw new Error('Shift has no company scope, so its transaction ledger cannot be verified.')
  }
  const transactions = db.prepare('SELECT fuelCode, litres, amount, method FROM transactions WHERE shiftId = ?').all(shift.id) as Array<{ fuelCode: string; litres: number; amount: number; method: string }>
  const expectedSales = JSON.parse(shift.sales) as Array<{ fuelCode: string; litres: number; amount: number }>
  const expectedPayments = JSON.parse(shift.payments) as Record<string, number>
  if (expectedSales.some(sale => sale.litres > 0) && transactions.length === 0) throw new Error('Shift transactions are incomplete.')

  const transactionSales = new Map<string, { litres: number; amount: number }>()
  const transactionPayments: Record<string, number> = { CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 }
  for (const transaction of transactions) {
    const fuelCode = transaction.fuelCode.toUpperCase()
    const current = transactionSales.get(fuelCode) ?? { litres: 0, amount: 0 }
    current.litres = money(current.litres + transaction.litres)
    current.amount = money(current.amount + transaction.amount)
    transactionSales.set(fuelCode, current)
    if (transaction.method in transactionPayments) transactionPayments[transaction.method] = money(transactionPayments[transaction.method] + transaction.amount)
  }
  for (const sale of expectedSales) {
    const totals = transactionSales.get(sale.fuelCode.toUpperCase()) ?? { litres: 0, amount: 0 }
    if (Math.abs(totals.litres - sale.litres) > 0.05 || Math.abs(totals.amount - sale.amount) > 0.02) throw new Error('Shift sales do not match the synced transaction ledger.')
  }
  for (const [method, amount] of Object.entries(expectedPayments)) {
    if (Math.abs((transactionPayments[method] ?? 0) - amount) > 0.02) throw new Error('Shift payments do not match the synced transaction ledger.')
  }
  const ledgerTotal = money(Array.from(transactionSales.values()).reduce((sum, sale) => sum + sale.amount, 0))
  const paymentTotal = money(Object.values(transactionPayments).reduce((sum, amount) => sum + amount, 0))
  if (Math.abs(ledgerTotal - shift.expectedTotal) > 0.02 || Math.abs(paymentTotal - shift.actualTotal) > 0.02) throw new Error('Shift totals do not match the synced transaction ledger.')
}

const idempotencyCache = new Map<string, { timestamp: number; response: { success: boolean; cloudTxId: string; timestamp: string; accepted: string[]; rejected: Array<{ id: string; reason: string }>; serverTime: string } }>()
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const IDEMPOTENCY_MAX_ENTRIES = 10_000

function cleanIdempotencyCache(): void {
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS
  for (const [key, value] of idempotencyCache.entries()) {
    if (value.timestamp < cutoff) idempotencyCache.delete(key)
  }
  // Map preserves insertion order, so the oldest key is the first one. Without
  // this ceiling a long-lived process grows without bound and the cache is
  // also keyed per-user, so volume scales with the tenant count.
  while (idempotencyCache.size > IDEMPOTENCY_MAX_ENTRIES) {
    const oldest = idempotencyCache.keys().next()
    if (oldest.done) break
    idempotencyCache.delete(oldest.value)
  }
}

function rememberIdempotentResponse(key: string, response: { success: boolean; cloudTxId: string; timestamp: string; accepted: string[]; rejected: Array<{ id: string; reason: string }>; serverTime: string }): void {
  idempotencyCache.set(key, { timestamp: Date.now(), response })
  cleanIdempotencyCache()
}

syncRouter.post('/entities', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  // Scope the cache to the caller. A shared, unscoped key would let one user
  // read another's cached response and would silently discard their own write.
  const idempotencyKey = req.header('x-idempotency-key')?.trim()
  const cacheKey = idempotencyKey ? `${session.userId}:${idempotencyKey}` : null
  if (cacheKey) {
    const cached = idempotencyCache.get(cacheKey)
    if (cached) {
      res.json(cached.response)
      return
    }
  }

  const body = (req.body ?? {}) as SyncPayload
  const entities = Array.isArray(body.entities) ? body.entities : []
  if (entities.length === 0 || entities.length > MAX_ENTITIES) {
    res.status(400).json({ error: 'BAD_REQUEST', message: `entities must contain between 1 and ${MAX_ENTITIES} items.` })
    return
  }

  const accepted: string[] = []
  const rejected: Array<{ id: string; reason: string }> = []
  const seenInBatch = new Set<string>()

  for (const entity of entities) {
    const data = entity?.data ?? {}
    const entityId = typeof data.id === 'string' ? data.id : '?'
    const entityKey = `${entity?.type}:${entityId}`
    if (seenInBatch.has(entityKey)) {
      rejected.push({ id: entityId, reason: `Duplicate entity ${entityKey} in same batch.` })
      continue
    }
    seenInBatch.add(entityKey)
    try {
      if (entity.type === 'SHIFT') {
        const shift = validateShiftData(session, data)
        const existing = db.prepare('SELECT number, stationId, attendantId, pumpId, pumpName, companyId, companyShortCode, status, openedAt, closedAt, openingReadings, closingReadings, sales, expectedTotal, payments, actualTotal, variance, notes, createdAt FROM shifts WHERE id = ?').get(shift.id) as Record<string, unknown> | undefined
        if (existing) {
          if (!canAccessShift(session, existing as { stationId: string; attendantId: string; companyId?: string | null })) throw new Error('Shift is outside your account scope.')
          if (existing.stationId !== shift.stationId || existing.attendantId !== shift.attendantId || existing.number !== shift.number || existing.pumpId !== shift.pumpId || existing.pumpName !== shift.pumpName || existing.openedAt !== shift.openedAt || existing.openingReadings !== shift.openingReadings || existing.createdAt !== shift.createdAt) throw new Error('Shift identity cannot be changed by device sync.')
          if (existing.companyId && existing.companyId !== shift.companyId) throw new Error('Shift company identity cannot be changed by device sync.')
          if (!SHIFT_STATUSES.has(String(existing.status))) throw new Error('Reviewed shifts cannot be overwritten by device sync.')
          if (existing.status === 'CLOSED') {
            const sameSnapshot = existing.status === shift.status && existing.closedAt === shift.closedAt && existing.closingReadings === shift.closingReadings && existing.sales === shift.sales && Math.abs(Number(existing.expectedTotal) - Number(shift.expectedTotal)) <= 0.02 && existing.payments === shift.payments && Math.abs(Number(existing.actualTotal) - Number(shift.actualTotal)) <= 0.02 && Math.abs(Number(existing.variance) - Number(shift.variance)) <= 0.02 && existing.notes === shift.notes
            if (!sameSnapshot) throw new Error('Closed shifts are frozen and must be reviewed before amendment.')
            accepted.push(String(shift.id))
            continue
          }
        }
        // An attendant works one shift at a time. That invariant was enforced
        // only in the web and mobile clients, which is a soft guard: the sync
        // endpoint is the one place that can actually hold it. Without it, a
        // second device or an offline queue replaying in a different order
        // leaves an attendant holding several open shifts, which is how three
        // stale pre-cutover shifts accumulated on a single attendant. Enforced
        // on insert only, so duplicates already in the ledger stay updatable
        // and can still be closed and reconciled by hand.
        if (!existing && shift.status === 'OPEN') {
          const open = db.prepare("SELECT number FROM shifts WHERE attendantId = ? AND status = 'OPEN' AND id <> ? LIMIT 1").get(shift.attendantId, shift.id) as { number: string } | undefined
          if (open) throw new Error(`Attendant already has an open shift (${open.number}). It must be closed before another is opened.`)
        }
        db.transaction(() => {
          upsertShift.run(shift)
          queue('SHIFT', String(shift.id), String(shift.createdAt))
          const previouslyClosed = existing && String(existing.status) === 'CLOSED'
          if (!previouslyClosed && shift.status === 'CLOSED') {
            recordAudit('SHIFT_CLOSED', String(shift.id), `Shift ${String(shift.number)} closed for ${String(shift.stationName)}. Variance GHS ${Number(shift.variance).toFixed(2)}`, { companyId: shift.companyId, stationId: shift.stationId, expectedTotal: shift.expectedTotal, actualTotal: shift.actualTotal, variance: shift.variance }, session)
          } else if (!existing) {
            recordAudit('SHIFT_OPENED', String(shift.id), `Shift ${String(shift.number)} opened at ${String(shift.stationName)}`, { companyId: shift.companyId, stationId: shift.stationId, pumpId: shift.pumpId }, session)
          }
        })()
        accepted.push(String(shift.id))
      } else if (entity.type === 'TRANSACTION') {
        const transaction = data
        const shift = getShiftForEntity(transaction.shiftId)
        if (!canAccessShift(session, shift)) throw new Error('Transaction is outside your account scope.')
        if (!SHIFT_STATUSES.has(shift.status)) throw new Error('Reviewed shifts cannot receive transaction updates.')
        if (session.role === 'attendant' && shift.attendantId !== session.userId) throw new Error('An attendant can only sync their own transactions.')
        const id = text(transaction.id, 'id')
        const fuelCode = text(transaction.fuelCode, 'fuelCode').toUpperCase()
        if (!/^[A-Z0-9_-]{1,20}$/.test(fuelCode)) throw new Error('Invalid fuel code.')
        const allowed = availableFuelCodes(String(shift.companyId ?? ''))
        if (allowed.size > 0 && !allowed.has(fuelCode)) throw new Error('Fuel code is not configured for this company.')
        const litres = numberValue(transaction.litres, 'litres')
        const amount = numberValue(transaction.amount, 'amount')
        const unitPrice = numberValue(transaction.unitPrice, 'unitPrice')
        if (litres > 0 && unitPrice <= 0) throw new Error('A transaction with litres must have a positive unit price.')
        if (litres > 0) enforceAuthoritativePrice(String(shift.companyId ?? ''), fuelCode, unitPrice, 'Transaction unit price')
        if (Math.abs(amount - money(litres * unitPrice)) > 0.02) throw new Error('Transaction amount does not match litres and unit price.')
        const method = String(transaction.method ?? 'CASH').toUpperCase()
        if (!PAYMENT_METHODS.has(method)) throw new Error('Unsupported payment method.')
        const recordedAt = dateValue(transaction.recordedAt, 'recordedAt')
        if (new Date(recordedAt).getTime() < new Date(shift.openedAt).getTime() || (shift.closedAt && new Date(recordedAt).getTime() > new Date(shift.closedAt).getTime() + 60_000)) throw new Error('recordedAt is outside the shift period.')
        const customerRef = typeof transaction.customerRef === 'string' ? transaction.customerRef.trim().slice(0, 200) : null
        const existing = db.prepare('SELECT shiftId, attendantId, fuelCode, litres, amount, unitPrice, method, customerRef, recordedAt FROM transactions WHERE id = ?').get(id) as { shiftId: string; attendantId: string; fuelCode: string; litres: number; amount: number; unitPrice: number; method: string; customerRef: string | null; recordedAt: string } | undefined
        if (existing) {
          if (existing.shiftId !== shift.id || existing.attendantId !== shift.attendantId) throw new Error('Transaction identity does not match its existing record.')
          const changed = existing.fuelCode !== fuelCode || Math.abs(existing.litres - litres) > 0.001 || Math.abs(existing.amount - amount) > 0.02 || Math.abs(existing.unitPrice - unitPrice) > 0.001 || existing.method !== method || existing.customerRef !== customerRef || existing.recordedAt !== recordedAt
          if (changed && shift.status !== 'OPEN') throw new Error('Transactions on closed shifts are frozen.')
        } else if (shift.status !== 'OPEN') {
          // Previously only *changes* to an existing row were blocked, so a brand
          // new sale could still be inserted into a closed, cash-counted shift
          // with a backdated recordedAt inside the shift window — after the
          // money was counted and the variance agreed.
          throw new Error('A closed shift cannot accept new transactions. It must be reviewed before amendment.')
        }
        db.transaction(() => {
          upsertTransaction.run({ id, shiftId: shift.id, attendantId: shift.attendantId, fuelCode: fuelCode as FuelCode, litres, amount, unitPrice, method: method as PaymentMethod, customerRef, recordedAt })
          queue('TRANSACTION', id, recordedAt)
          if (!existing) {
            recordAudit('SALE_RECORDED', shift.id, `${litres}L ${fuelCode} for GHS ${amount.toFixed(2)} on ${shift.number}`, { companyId: shift.companyId, stationId: shift.stationId, litres, amount, unitPrice, method, transactionId: id }, session)
          }
        })()
        accepted.push(id)
      } else if (entity.type === 'RECEIPT') {
        const receipt = data
        const shift = getShiftForEntity(receipt.shiftId)
        if (!canAccessShift(session, shift)) throw new Error('Receipt is outside your account scope.')
        if (!SHIFT_STATUSES.has(shift.status)) throw new Error('Reviewed shifts cannot receive receipt updates.')
        const id = text(receipt.id, 'id')
        const image = text(receipt.imageUrl ?? receipt.image, 'image')
        // Receipt images are stored as base64 in the same SQLite file as the
        // ledger and are never read back by any endpoint. At 500 entities per
        // request this allowed ~15MB per call into the financial ledger's own
        // volume with no quota, so the bound is deliberately tight.
        if (image.length > MAX_RECEIPT_IMAGE_CHARS) throw new Error(`Receipt image exceeds the ${MAX_RECEIPT_IMAGE_CHARS} character limit.`)
        const capturedAt = dateValue(receipt.capturedAt, 'capturedAt')
        if (new Date(capturedAt).getTime() < new Date(shift.openedAt).getTime() || (shift.closedAt && new Date(capturedAt).getTime() > new Date(shift.closedAt).getTime() + 60_000)) throw new Error('capturedAt is outside the shift period.')
        const existing = db.prepare('SELECT shiftId, image, capturedAt FROM receipts WHERE id = ?').get(id) as { shiftId: string; image: string; capturedAt: string } | undefined
        if (existing) {
          if (existing.shiftId !== shift.id || existing.image !== image || existing.capturedAt !== capturedAt) throw new Error('Receipt identity does not match its existing record.')
        } else if (shift.status !== 'OPEN') {
          throw new Error('A closed shift cannot accept new receipts.')
        }
        db.transaction(() => {
          upsertReceipt.run({ id, shiftId: shift.id, image, capturedAt })
          queue('RECEIPT', id, capturedAt)
        })()
        accepted.push(id)
      } else if (entity.type === 'EXPENSE') {
        if (session.role === 'attendant') throw new Error('An attendant cannot sync station expenses.')
        const expense = data
        const station = stationForSession(session, expense.stationId)
        const id = text(expense.id, 'id')
        const category = text(expense.category, 'category').toUpperCase()
        if (category.length > 40) throw new Error('category is too long.')
        const amount = money(numberValue(expense.amount, 'amount', false))
        if (amount > 1_000_000_000) throw new Error('Expense amount is too large.')
        const paymentSource = String(expense.paymentSource ?? '').toUpperCase()
        if (!EXPENSE_PAYMENT_SOURCES.has(paymentSource)) throw new Error('Unsupported expense payment source.')
        const date = dateOnly(expense.date, 'date')
        const payee = typeof expense.payee === 'string' && expense.payee.trim() ? expense.payee.trim().slice(0, 120) : null
        const referenceNumber = typeof expense.referenceNumber === 'string' && expense.referenceNumber.trim() ? expense.referenceNumber.trim().slice(0, 120) : null
        const notes = typeof expense.notes === 'string' && expense.notes.trim() ? expense.notes.trim().slice(0, 2000) : null
        const createdAt = dateValue(expense.createdAt, 'createdAt', `${date}T00:00:00.000Z`)
        const existing = db.prepare('SELECT companyId, stationId, category, amount, paymentSource, payee, referenceNumber, notes, date, createdAt FROM station_expenses WHERE id = ?').get(id) as { companyId: string; stationId: string; category: string; amount: number; paymentSource: string; payee: string | null; referenceNumber: string | null; notes: string | null; date: string; createdAt: string } | undefined
        if (existing) {
          const same = existing.companyId === station.companyId && existing.stationId === station.id && existing.category === category && Math.abs(existing.amount - amount) <= 0.02 && existing.paymentSource === paymentSource && existing.payee === payee && existing.referenceNumber === referenceNumber && existing.notes === notes && existing.date === date && existing.createdAt === createdAt
          if (!same) throw new Error('Expense identity does not match its existing record.')
          accepted.push(id)
          continue
        }
        const recordedBy = JSON.stringify({ id: session.userId, name: session.fullName, employeeCode: session.employeeCode })
        db.transaction(() => {
          db.prepare(`INSERT INTO station_expenses (id, companyId, companyShortCode, stationId, stationName, category, amount, paymentSource, payee, referenceNumber, notes, date, recordedBy, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?)`).run(id, station.companyId, station.companyShortCode, station.id, station.name, category, amount, paymentSource, payee, referenceNumber, notes, date, recordedBy, createdAt, createdAt)
          db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(newToken(), 'EXPENSE_RECORDED', session.userId, session.fullName, session.role.toUpperCase(), id, `Expense synced at ${station.name}`, notes, createdAt, JSON.stringify({ companyId: station.companyId, stationId: station.id, category, amount, paymentSource }))
          queue('EXPENSE', id, createdAt)
        })()
        accepted.push(id)
      } else if (entity.type === 'TANK_READING') {
        if (session.role === 'attendant') throw new Error('An attendant cannot sync tank readings.')
        const reading = data
        const station = stationForSession(session, reading.stationId)
        const id = text(reading.id, 'id')
        const rawReadings = Array.isArray(reading.readings) ? reading.readings : []
        if (rawReadings.length === 0 || rawReadings.length > MAX_READINGS) throw new Error('readings must contain between 1 and 100 items.')
        const allowedFuels = availableFuelCodes(station.companyId)
        const seenTanks = new Set<string>()
        const normalizedReadings = rawReadings.map(item => {
          if (!item || typeof item !== 'object') throw new Error('Invalid tank reading.')
          const entry = item as Record<string, unknown>
          const tankId = text(entry.tankId, 'tankId')
          if (!/^[A-Z0-9_-]{1,40}$/i.test(tankId) || seenTanks.has(tankId.toUpperCase())) throw new Error('Tank readings contain an invalid or duplicate tankId.')
          seenTanks.add(tankId.toUpperCase())
          const fuelCode = text(entry.fuelCode, 'fuelCode').toUpperCase()
          if (!/^[A-Z0-9_-]{1,20}$/.test(fuelCode) || (allowedFuels.size > 0 && !allowedFuels.has(fuelCode))) throw new Error('Tank reading contains an unavailable fuel code.')
          return {
            tankId,
            fuelCode,
            openingLevel: numberValue(entry.openingLevel, 'openingLevel'),
            closingLevel: numberValue(entry.closingLevel, 'closingLevel'),
            dipStock: numberValue(entry.dipStock, 'dipStock'),
            received: numberValue(entry.received, 'received'),
            ...(typeof entry.notes === 'string' && entry.notes.trim() ? { notes: entry.notes.trim().slice(0, 500) } : {}),
          }
        })
        const readingsJson = JSON.stringify(normalizedReadings)
        const recordedAt = dateValue(reading.recordedAt, 'recordedAt')
        const existing = db.prepare('SELECT stationId, companyId, recordedBy, readings, recordedAt FROM tankReadings WHERE id = ?').get(id) as { stationId: string; companyId: string; recordedBy: string; readings: string; recordedAt: string } | undefined
        if (existing && (existing.stationId !== station.id || existing.companyId !== station.companyId || existing.recordedBy !== session.userId || existing.readings !== readingsJson || existing.recordedAt !== recordedAt)) throw new Error('Tank reading identity does not match its existing record.')
        db.transaction(() => {
          upsertTankReading.run({
            id,
            stationId: station.id,
            companyId: station.companyId,
            recordedBy: session.userId,
            recordedByName: session.fullName,
            readings: readingsJson,
            recordedAt,
            notes: typeof reading.notes === 'string' ? reading.notes.trim().slice(0, 2000) : null,
            createdAt: dateValue(reading.createdAt, 'createdAt', recordedAt),
          })
          queue('TANK_READING', id, recordedAt)
        })()
        accepted.push(id)
      } else {
        throw new Error(`Unsupported entity type: ${String(entity.type)}`)
      }
    } catch (error) {
      rejected.push({ id: entityId, reason: error instanceof Error ? error.message : 'Validation failed.' })
    }
  }

  const responseData = {
    success: rejected.length === 0,
    cloudTxId: `CLD-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    accepted,
    rejected,
    serverTime: new Date().toISOString(),
  }
  // A response carrying rejections is deliberately not cached: the client
  // retries rejected entities on a backoff, and a 24h cached rejection would
  // make a transient failure permanent.
  if (cacheKey && rejected.length === 0) {
    rememberIdempotentResponse(cacheKey, responseData)
  }
  res.json(responseData)
})

syncRouter.post('/shifts/:id/review', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as { verdict?: string; notes?: string; shift?: Record<string, unknown> }
  const verdict = String(body.verdict ?? '').toUpperCase()
  if (verdict !== 'APPROVED' && verdict !== 'REJECTED') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'verdict must be APPROVED or REJECTED.' })
    return
  }
  const session = sessionOf(req)
  const now = new Date().toISOString()
  let shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as (ShiftRow & { companyId?: string | null }) | undefined

  if (!shift && body.shift && typeof body.shift === 'object') {
    const validated = validateShiftData(session, { ...body.shift, status: 'CLOSED', closedAt: body.shift.closedAt ?? now }, true)
    if (validated.id !== req.params.id) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Shift payload id does not match the URL.' })
      return
    }
    try {
      insertShift.run(validated)
    } catch {
      res.status(409).json({ error: 'CONFLICT', message: 'Shift was created by another request.' })
      return
    }
    shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as ShiftRow & { companyId?: string | null }
  }
  if (!shift) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  if (!canAccessShift(session, shift)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot review this shift.' })
    return
  }
  if (shift.status !== 'CLOSED') {
    res.status(409).json({ error: 'INVALID_STATE', message: 'Only closed shifts can be reviewed.' })
    return
  }
  try {
    assertShiftLedger(shift)
  } catch (error) {
    res.status(409).json({ error: 'LEDGER_MISMATCH', message: error instanceof Error ? error.message : 'Shift ledger is incomplete.' })
    return
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : null
  const reviewResult = db.transaction(() => {
    const result = db.prepare("UPDATE shifts SET status = ?, reviewerNotes = ?, syncStatus = 'SYNCED', updatedAt = ? WHERE id = ? AND status = 'CLOSED'").run(verdict, notes, now, shift.id)
    if (result.changes !== 1) return false
    db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      newToken(), verdict === 'APPROVED' ? 'REVIEW_APPROVED' : 'REJECTED', session.userId, session.fullName, session.role.toUpperCase(), shift.id, `Shift ${shift.number}`, notes, now, JSON.stringify({ companyId: shift.companyId ?? null, stationId: shift.stationId }),
    )
    return true
  })()
  if (!reviewResult) {
    res.status(409).json({ error: 'CONFLICT', message: 'Shift was reviewed by another user.' })
    return
  }
  res.json({ id: shift.id, status: verdict, reviewerNotes: notes, reviewedAt: now, shift: deserializeShift(db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift.id) as ShiftRow) })
})
