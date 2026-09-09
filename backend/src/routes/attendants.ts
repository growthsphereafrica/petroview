import { Router } from 'express'
import { db } from '../db'
import { hashPin, newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest } from '../middleware'

export const attendantsRouter = Router()

const publicAttendant = (a: Record<string, unknown>) => ({
  id: a.id,
  employeeCode: a.employeeCode,
  fullName: a.fullName,
  pumpId: a.pumpId,
  stationId: a.stationId,
  companyId: a.companyId,
  companyShortCode: a.companyShortCode,
  phone: a.phone,
  approvalStatus: a.approvalStatus,
  active: (a.active as number) === 1,
  failedAttempts: a.failedAttempts,
  lockoutUntil: a.lockoutUntil,
  createdAt: a.createdAt,
})

attendantsRouter.get('/', authenticate, (req: AuthRequest, res) => {
  const active = req.query.active !== 'all'
  const companyId = req.query.company as string | undefined
  const stationId = req.query.station as string | undefined
  const pendingApproval = req.query.pending === 'true'

  let sql = 'SELECT * FROM attendants WHERE 1=1'
  const params: unknown[] = []

  if (active) {
    sql += ' AND active = 1'
  }
  if (companyId) {
    sql += ' AND companyId = ?'
    params.push(companyId)
  }
  if (stationId) {
    sql += ' AND stationId = ?'
    params.push(stationId)
  }
  if (pendingApproval) {
    sql += " AND approvalStatus = 'PENDING'"
  }

  sql += ' ORDER BY employeeCode'
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>
  res.json({ count: rows.length, attendants: rows.map(publicAttendant) })
})

attendantsRouter.post('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { employeeCode, fullName, pin, pumpId, stationId, companyId, companyShortCode } = (req.body ?? {}) as {
    employeeCode?: string
    fullName?: string
    pin?: string
    pumpId?: string
    stationId?: string
    companyId?: string
    companyShortCode?: string
  }
  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code || !fullName?.trim() || !pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'employeeCode, fullName and 4-digit pin are required.' })
    return
  }
  if (db.prepare('SELECT 1 FROM attendants WHERE employeeCode = ? COLLATE NOCASE').get(code)) {
    res.status(409).json({ error: 'CONFLICT', message: 'That employee code is already registered.' })
    return
  }
  const { salt, hash } = hashPin(pin)
  const id = `att-${code.toLowerCase()}`
  const now = new Date().toISOString()
  const station = stationId ?? req.session?.stationId ?? null
  const company = companyId ?? req.session?.companyId ?? null
  const shortCode = companyShortCode ?? req.session?.companyShortCode ?? null
  db.prepare(
    `INSERT INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, companyId, companyShortCode,
     phone, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, 1, 0, NULL, ?)`,
  ).run(id, code, fullName.trim(), salt, hash, pumpId ?? null, station, company, shortCode, (req.body as Record<string, unknown>).phone ?? null, now, req.session?.fullName ?? 'System', now)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'ATTENDANT_REGISTERED', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERVISOR',
    id, `Attendant ${code} (${fullName.trim()})`, null, now, null,
  )
  res.status(201).json({ id, employeeCode: code, fullName: fullName.trim(), pumpId: pumpId ?? null, stationId: station, companyId: company, active: true })
})

attendantsRouter.post('/:id/reset-pin', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { pin } = (req.body ?? {}) as { pin?: string }
  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'A 4-digit pin is required.' })
    return
  }
  const row = db.prepare('SELECT employeeCode, fullName FROM attendants WHERE id = ?').get(req.params.id) as { employeeCode: string; fullName: string } | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Attendant not found.' })
    return
  }
  const { salt, hash } = hashPin(pin)
  const now = new Date().toISOString()
  db.prepare('UPDATE attendants SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE id = ?').run(salt, hash, req.params.id)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'PIN_RESET', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERVISOR',
    req.params.id, `PIN reset for ${row.employeeCode}`, null, now, null,
  )
  res.json({ id: req.params.id, message: `PIN reset for ${row.employeeCode}.` })
})

attendantsRouter.post('/:id/deactivate', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT employeeCode, fullName, active FROM attendants WHERE id = ?').get(req.params.id) as
    | { employeeCode: string; fullName: string; active: number }
    | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Attendant not found.' })
    return
  }
  db.prepare('UPDATE attendants SET active = 0, failedAttempts = 0 WHERE id = ?').run(req.params.id)
  db.prepare('DELETE FROM sessions WHERE userId = ? AND role = ?').run(req.params.id, 'attendant')
  const now = new Date().toISOString()
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'ATTENDANT_DEACTIVATED', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERVISOR',
    req.params.id, `Deactivated ${row.employeeCode} (${row.fullName})`, null, now, null,
  )
  res.json({ id: req.params.id, active: false })
})
