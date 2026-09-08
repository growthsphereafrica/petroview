import { Router } from 'express'
import { db } from '../db'
import { hashPin, newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest } from '../middleware'

export const attendantsRouter = Router()

const publicAttendant = (a: {
  id: string
  employeeCode: string
  fullName: string
  pumpId: string | null
  stationId: string
  active: number
  failedAttempts: number
  lockoutUntil: string | null
  createdAt: string
}): object => ({
  id: a.id,
  employeeCode: a.employeeCode,
  fullName: a.fullName,
  pumpId: a.pumpId,
  stationId: a.stationId,
  active: a.active === 1,
  failedAttempts: a.failedAttempts,
  lockoutUntil: a.lockoutUntil,
  createdAt: a.createdAt,
})

attendantsRouter.get('/', authenticate, (req, res) => {
  const active = req.query.active !== 'all'
  const rows = db.prepare('SELECT * FROM attendants ORDER BY employeeCode').all() as Array<{
    id: string
    employeeCode: string
    fullName: string
    pumpId: string | null
    stationId: string
    active: number
    failedAttempts: number
    lockoutUntil: string | null
    createdAt: string
  }>
  res.json({ count: rows.length, attendants: rows.filter(a => (active ? a.active === 1 : true)).map(publicAttendant) })
})

const codePattern = /^ATT\d{4}$/

attendantsRouter.post('/', authenticate, requireRole('supervisor'), (req: AuthRequest, res) => {
  const { employeeCode, fullName, pin, pumpId, stationId } = (req.body ?? {}) as {
    employeeCode?: string
    fullName?: string
    pin?: string
    pumpId?: string
    stationId?: string
  }
  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!codePattern.test(code) || !fullName?.trim() || !pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'employeeCode (ATT####), fullName and 4-digit pin are required.' })
    return
  }
  if (db.prepare('SELECT 1 FROM attendants WHERE employeeCode = ? COLLATE NOCASE').get(code)) {
    res.status(409).json({ error: 'CONFLICT', message: 'That employee code is already registered.' })
    return
  }
  const { salt, hash } = hashPin(pin)
  const id = `att-${code.toLowerCase()}`
  const now = new Date().toISOString()
  const station = stationId ?? req.session?.stationId ?? 'STN-GV-042'
  db.prepare('INSERT INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, active, failedAttempts, lockoutUntil, createdAt) VALUES (?,?,?,?,?,?,?,1,0,NULL,?)').run(
    id, code, fullName.trim(), salt, hash, pumpId ?? null, station, now,
  )
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'ATTENDANT_REGISTERED', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERVISOR',
    id, `Attendant ${code} (${fullName.trim()})`, null, now, null,
  )
  res.status(201).json({ id, employeeCode: code, fullName: fullName.trim(), pumpId: pumpId ?? null, stationId: station, active: true })
})

attendantsRouter.post('/:id/reset-pin', authenticate, requireRole('supervisor'), (req: AuthRequest, res) => {
  const { pin } = (req.body ?? {}) as { pin?: string }
  if (!pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'A 4-digit pin is required.' })
    return
  }
  const row = db.prepare('SELECT employeeCode, fullName FROM attendants WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Attendant not found.' })
    return
  }
  const { salt, hash } = hashPin(pin)
  const now = new Date().toISOString()
  db.prepare('UPDATE attendants SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE id = ?').run(salt, hash, req.params.id)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'PIN_RESET', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERVISOR',
    req.params.id, `PIN reset for ${(row as { employeeCode: string }).employeeCode}`, null, now, null,
  )
  res.json({ id: req.params.id, message: `PIN reset for ${(row as { employeeCode: string }).employeeCode}.` })
})

attendantsRouter.post('/:id/deactivate', authenticate, requireRole('supervisor'), (req: AuthRequest, res) => {
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