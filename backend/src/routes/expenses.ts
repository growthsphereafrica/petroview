import { Router } from 'express'
import { db } from '../db'
import { newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const expensesRouter = Router()

interface ExpenseRow {
  id: string
  companyId: string
  companyShortCode: string | null
  stationId: string
  stationName: string
  category: string
  amount: number
  paymentSource: string
  payee: string | null
  referenceNumber: string | null
  notes: string | null
  date: string
  recordedBy: string
  status: string
  createdAt: string
  updatedAt: string
}

interface StationScope {
  id: string
  companyId: string
  name: string
}

const PAYMENT_SOURCES = new Set(['CASH', 'MOMO', 'VOUCHER', 'CREDIT', 'STATION_ACCOUNT', 'OTHER'])

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function getStation(value: unknown): StationScope | undefined {
  const stationId = typeof value === 'string' ? value.trim() : ''
  if (!stationId) return undefined
  return db.prepare(`SELECT cs.id, cs.companyId, cs.name FROM companyStations cs JOIN companies c ON c.id = cs.companyId WHERE cs.active = 1 AND c.active = 1 AND (UPPER(cs.id) = UPPER(?) OR UPPER(cs.code) = UPPER(?)) LIMIT 1`).get(stationId, stationId) as StationScope | undefined
}

function companyShortCode(companyId: string): string | null {
  const row = db.prepare('SELECT shortCode FROM companies WHERE id = ? AND active = 1').get(companyId) as { shortCode: string } | undefined
  return row?.shortCode ?? null
}

function scopeFor(session: SessionClaims, requestedCompany: string | undefined, requestedStation: string | undefined): { companyId?: string; stationId?: string } | null {
  let station: StationScope | undefined
  if (requestedStation && requestedStation !== 'ALL') {
    station = getStation(requestedStation)
    if (!station) return null
  }
  if (session.role === 'superadmin') {
    if (requestedCompany && requestedCompany !== 'ALL') {
      const row = db.prepare('SELECT id FROM companies WHERE id = ? OR UPPER(shortCode) = UPPER(?)').get(requestedCompany, requestedCompany) as { id: string } | undefined
      if (!row) return null
      if (station && station.companyId !== row.id) return null
      return { companyId: row.id, ...(station ? { stationId: station.id } : {}) }
    }
    return station ? { stationId: station.id } : {}
  }
  if (session.role === 'headoffice') {
    if (!session.companyId || (station && station.companyId !== session.companyId)) return null
    if (requestedCompany && requestedCompany !== 'ALL' && requestedCompany !== session.companyId && requestedCompany.toUpperCase() !== (session.companyShortCode ?? '').toUpperCase()) return null
    return { companyId: session.companyId, ...(station ? { stationId: station.id } : {}) }
  }
  if (!session.stationId || (station && station.id !== session.stationId)) return null
  if (requestedCompany && requestedCompany !== 'ALL' && requestedCompany !== session.companyId && requestedCompany.toUpperCase() !== (session.companyShortCode ?? '').toUpperCase()) return null
  return { stationId: session.stationId, companyId: session.companyId ?? undefined }
}

function validDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  const date = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))) throw new Error(`${field} must use YYYY-MM-DD.`)
  return date
}

function audit(req: AuthRequest, action: string, id: string, description: string, meta: Record<string, unknown>, now: string): void {
  const session = sessionOf(req)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(newToken(), action, session.userId, session.fullName, session.role.toUpperCase(), id, description, null, now, JSON.stringify(meta))
}

expensesRouter.get('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  try {
    const requestedCompany = typeof req.query.companyId === 'string' ? req.query.companyId.trim() : undefined
    const requestedStation = typeof req.query.stationId === 'string' ? req.query.stationId.trim() : undefined
    const scope = scopeFor(session, requestedCompany, requestedStation)
    if (!scope) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'The requested expense scope is outside your account.' })
      return
    }
    const startDate = validDate(req.query.startDate, 'startDate')
    const endDate = validDate(req.query.endDate, 'endDate')
    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'startDate must not be after endDate.' })
      return
    }
    const conditions: string[] = []
    const params: Array<string | number> = []
    if (scope.companyId) { conditions.push('companyId = ?'); params.push(scope.companyId) }
    if (scope.stationId) { conditions.push('stationId = ?'); params.push(scope.stationId) }
    if (startDate) { conditions.push('date >= ?'); params.push(startDate) }
    if (endDate) { conditions.push('date <= ?'); params.push(endDate) }
    if (typeof req.query.category === 'string' && req.query.category && req.query.category !== 'ALL') { conditions.push('category = ?'); params.push(req.query.category.trim().toUpperCase().slice(0, 40)) }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    const rows = db.prepare(`SELECT * FROM station_expenses${where} ORDER BY date DESC, createdAt DESC LIMIT 1000`).all(...params) as ExpenseRow[]
    const expenses = rows.map(row => {
      let recordedBy: unknown = { id: 'UNKNOWN', name: row.recordedBy, employeeCode: '' }
      try { recordedBy = JSON.parse(row.recordedBy) } catch { }
      return { id: row.id, companyId: row.companyId, companyShortCode: row.companyShortCode, stationId: row.stationId, stationName: row.stationName, category: row.category, amount: row.amount, paymentSource: row.paymentSource, payee: row.payee, referenceNumber: row.referenceNumber, notes: row.notes, date: row.date, recordedBy, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt }
    })
    res.json({ count: expenses.length, totalAmount: Math.round(expenses.reduce((total, row) => total + Number(row.amount || 0), 0) * 100) / 100, expenses })
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid expense query.' })
  }
})

expensesRouter.post('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  const amount = Number(body.amount)
  const category = typeof body.category === 'string' ? body.category.trim().toUpperCase() : ''
  const paymentSource = typeof body.paymentSource === 'string' ? body.paymentSource.trim().toUpperCase() : 'CASH'
  let date: string
  try { date = validDate(body.date, 'date') ?? new Date().toISOString().slice(0, 10) } catch (error) { res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid date.' }); return }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) { res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Amount must be a positive finite value.' }); return }
  if (!category || category.length > 40) { res.status(400).json({ error: 'BAD_REQUEST', message: 'category is required.' }); return }
  if (!PAYMENT_SOURCES.has(paymentSource)) { res.status(400).json({ error: 'INVALID_PAYMENT_SOURCE', message: 'Unsupported payment source.' }); return }
  const requestedStation = session.role === 'supervisor' ? session.stationId : typeof body.stationId === 'string' ? body.stationId : ''
  if (!requestedStation) { res.status(400).json({ error: 'BAD_REQUEST', message: 'stationId is required.' }); return }
  const station = getStation(requestedStation)
  if (!station) { res.status(404).json({ error: 'STATION_NOT_FOUND', message: 'Station not found or inactive.' }); return }
  if (session.role === 'supervisor' && station.id !== session.stationId) { res.status(403).json({ error: 'FORBIDDEN', message: 'You can only record expenses for your assigned station.' }); return }
  if (session.role === 'headoffice' && station.companyId !== session.companyId) { res.status(403).json({ error: 'FORBIDDEN', message: 'The station is outside your company.' }); return }
  const shortCode = companyShortCode(station.companyId)
  const requestedCompany = typeof body.companyId === 'string' ? body.companyId.trim() : ''
  if (requestedCompany && requestedCompany !== 'ALL' && requestedCompany !== station.companyId && requestedCompany.toUpperCase() !== (shortCode ?? '').toUpperCase()) { res.status(400).json({ error: 'COMPANY_MISMATCH', message: 'companyId does not match the selected station.' }); return }
  const id = `exp-${newToken()}`
  const now = new Date().toISOString()
  const recordedBy = JSON.stringify({ id: session.userId, name: session.fullName, employeeCode: session.employeeCode })
  const payee = typeof body.payee === 'string' ? body.payee.trim().slice(0, 120) : null
  const referenceNumber = typeof body.referenceNumber === 'string' ? body.referenceNumber.trim().slice(0, 120) : null
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : null
  try {
    db.transaction(() => {
      db.prepare(`INSERT INTO station_expenses (id, companyId, companyShortCode, stationId, stationName, category, amount, paymentSource, payee, referenceNumber, notes, date, recordedBy, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?)`).run(id, station.companyId, shortCode, station.id, station.name, category, Math.round(amount * 100) / 100, paymentSource, payee || null, referenceNumber || null, notes, date, recordedBy, now, now)
      audit(req, 'EXPENSE_RECORDED', id, `Expense recorded at ${station.name}`, { companyId: station.companyId, stationId: station.id }, now)
    })()
  } catch {
    res.status(500).json({ error: 'DB_ERROR', message: 'Expense could not be recorded.' })
    return
  }
  res.status(201).json({ success: true, id, message: 'Expense recorded successfully.' })
})

expensesRouter.delete('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const row = db.prepare('SELECT id, companyId, stationId FROM station_expenses WHERE id = ?').get(req.params.id) as Pick<ExpenseRow, 'id' | 'companyId' | 'stationId'> | undefined
  if (!row) { res.status(404).json({ error: 'NOT_FOUND', message: 'Expense not found.' }); return }
  const allowed = session.role === 'superadmin' || (session.role === 'headoffice' && row.companyId === session.companyId) || (session.role === 'supervisor' && row.stationId === session.stationId)
  if (!allowed) { res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot delete this expense.' }); return }
  const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare('DELETE FROM station_expenses WHERE id = ?').run(row.id)
    audit(req, 'EXPENSE_DELETED', row.id, 'Expense deleted', { companyId: row.companyId, stationId: row.stationId }, now)
  })()
  res.json({ success: true, message: 'Expense deleted.' })
})
