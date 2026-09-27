import { Router } from 'express'
import { db } from '../db'
import { hashPin, newToken, validateNewSecret } from '../auth'
import { attendantFinancialFootprint, destructiveOperationsEnabled, superAdminPinAccepted } from '../destructive'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const attendantsRouter = Router()

interface AttendantRow extends Record<string, unknown> {
  id: string
  employeeCode: string
  fullName: string
  stationId: string | null
  companyId: string | null
  companyShortCode: string | null
}

interface StationRow {
  id: string
  companyId: string
  companyShortCode: string | null
  name: string
}

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function publicAttendant(a: AttendantRow) {
  return {
    id: a.id,
    employeeCode: a.employeeCode,
    fullName: a.fullName,
    pumpId: a.pumpId,
    stationId: a.stationId,
    companyId: a.companyId,
    companyShortCode: a.companyShortCode,
    phone: a.phone,
    approvalStatus: a.approvalStatus,
    active: Number(a.active) === 1,
    failedAttempts: a.failedAttempts,
    lockoutUntil: a.lockoutUntil,
    createdAt: a.createdAt,
  }
}

function stationById(value: unknown): StationRow | undefined {
  const stationId = typeof value === 'string' ? value.trim() : ''
  if (!stationId) return undefined
  return db.prepare(`
    SELECT cs.id, cs.companyId, cs.name, c.shortCode AS companyShortCode
    FROM companyStations cs
    JOIN companies c ON c.id = cs.companyId
    WHERE cs.active = 1 AND c.active = 1
      AND (UPPER(cs.id) = UPPER(?) OR UPPER(cs.code) = UPPER(?))
    LIMIT 1
  `).get(stationId, stationId) as StationRow | undefined
}

function stationForSession(session: SessionClaims, requested: unknown, required = true): StationRow {
  const stationId = typeof requested === 'string' && requested.trim() ? requested.trim() : session.stationId
  if (!stationId) {
    if (!required) throw new Error('stationId is required.')
    throw new Error('Your account is not assigned to a station.')
  }
  const station = stationById(stationId)
  if (!station) throw new Error('Station is not active or does not exist.')
  if (session.role === 'headoffice' && session.companyId !== station.companyId) throw new Error('Station is outside your company.')
  if (session.role === 'supervisor' && session.stationId !== station.id) throw new Error('Supervisors can only manage their assigned station.')
  return station
}

function getAttendant(id: string): AttendantRow | undefined {
  return db.prepare('SELECT * FROM attendants WHERE id = ?').get(id) as AttendantRow | undefined
}

function canManage(session: SessionClaims, target: AttendantRow): boolean {
  if (session.role === 'superadmin') return true
  if (!target.companyId || !session.companyId || target.companyId !== session.companyId) return false
  if (session.role === 'headoffice') return true
  return session.role === 'supervisor' && !!session.stationId && target.stationId === session.stationId
}

function requireManage(session: SessionClaims, id: string): AttendantRow {
  const target = getAttendant(id)
  if (!target) throw new Error('NOT_FOUND')
  if (!canManage(session, target)) throw new Error('FORBIDDEN')
  return target
}

function validCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) throw new Error('Invalid employee code.')
  return code
}

function validName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 120) throw new Error('Invalid full name.')
  return name
}

function validPhone(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > 40) throw new Error('Invalid phone number.')
  return value.trim() || null
}

function audit(req: AuthRequest, action: string, targetId: string, description: string, notes: string | null, meta: Record<string, unknown> | null, now: string): void {
  const session = sessionOf(req)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), action, session.userId, session.fullName, session.role.toUpperCase(), targetId, description, notes, now, meta ? JSON.stringify(meta) : null,
  )
}

attendantsRouter.get('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const active = req.query.active !== 'all'
  const pendingApproval = req.query.pending === 'true'
  const requestedCompany = typeof req.query.company === 'string' ? req.query.company : null
  const requestedStation = typeof req.query.station === 'string' ? req.query.station : null
  const companyId = session.role === 'superadmin' ? requestedCompany : session.companyId
  const stationId = session.role === 'supervisor' ? session.stationId : requestedStation

  const conditions = ['1=1']
  const params: unknown[] = []
  if (active) conditions.push('active = 1')
  if (pendingApproval) conditions.push("approvalStatus = 'PENDING'")
  if (session.role !== 'superadmin') {
    conditions.push('companyId = ?')
    params.push(session.companyId)
  } else if (companyId && companyId !== 'ALL') {
    conditions.push('companyId = ?')
    params.push(companyId)
  }
  if (session.role === 'supervisor') {
    if (!stationId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Supervisor account has no assigned station.' })
      return
    }
    conditions.push('stationId = ?')
    params.push(stationId)
  } else if (requestedStation) {
    const station = stationById(requestedStation)
    if (!station || (session.role === 'headoffice' && station.companyId !== session.companyId)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Station is outside your account scope.' })
      return
    }
    conditions.push('stationId = ?')
    params.push(station.id)
  }
  const rows = db.prepare(`SELECT * FROM attendants WHERE ${conditions.join(' AND ')} ORDER BY employeeCode LIMIT 1000`).all(...params) as AttendantRow[]
  res.json({ count: rows.length, attendants: rows.map(publicAttendant) })
})

attendantsRouter.post('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  let code: string
  let name: string
  let phone: string | null
  let station: StationRow
  try {
    code = validCode(body.employeeCode)
    name = validName(body.fullName)
    phone = validPhone(body.phone)
    station = stationForSession(session, body.stationId ?? session.stationId)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid attendant data.' })
    return
  }
  const pin = typeof body.pin === 'string' ? body.pin : ''
  try {
    validateNewSecret(pin)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid PIN.' })
    return
  }
  if (db.prepare('SELECT 1 FROM attendants WHERE employeeCode = ? COLLATE NOCASE').get(code) || db.prepare('SELECT 1 FROM supervisors WHERE employeeCode = ? COLLATE NOCASE').get(code)) {
    res.status(409).json({ error: 'CONFLICT', message: 'That employee code is already registered.' })
    return
  }
  const pumpId = typeof body.pumpId === 'string' && body.pumpId.trim() ? body.pumpId.trim() : null
  if (pumpId && !db.prepare('SELECT 1 FROM pumps WHERE id = ? AND stationId = ? AND active = 1').get(pumpId, station.id)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'pumpId is not active at the selected station.' })
    return
  }
  const { salt, hash } = hashPin(pin)
  const id = `att-${newToken()}`
  const now = new Date().toISOString()
  const approvalStatus = session.role === 'supervisor' ? 'PENDING' : 'APPROVED'
  try {
    db.prepare(`INSERT INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, companyId, companyShortCode, phone, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?)`)
      .run(id, code, name, salt, hash, pumpId, station.id, station.companyId, station.companyShortCode, phone, approvalStatus, approvalStatus === 'APPROVED' ? now : null, approvalStatus === 'APPROVED' ? session.userId : null, now)
  } catch {
    res.status(409).json({ error: 'CONFLICT', message: 'That employee code is already registered.' })
    return
  }
  audit(req, 'ATTENDANT_REGISTERED', id, `Attendant ${code} (${name})`, null, { companyId: station.companyId, stationId: station.id }, now)
  res.status(201).json({ id, employeeCode: code, fullName: name, pumpId, stationId: station.id, companyId: station.companyId, approvalStatus, active: true })
})

attendantsRouter.post('/:id/reset-pin', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const pin = typeof (req.body as { pin?: unknown } | undefined)?.pin === 'string' ? (req.body as { pin: string }).pin : ''
  try {
    validateNewSecret(pin)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid PIN.' })
    return
  }
  let target: AttendantRow
  try {
    target = requireManage(session, req.params.id)
  } catch (error) {
    const status = error instanceof Error && error.message === 'NOT_FOUND' ? 404 : 403
    res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: status === 404 ? 'Attendant not found.' : 'You cannot manage this attendant.' })
    return
  }
  const { salt, hash } = hashPin(pin)
  const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare('UPDATE attendants SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE id = ?').run(salt, hash, target.id)
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(target.id)
    audit(req, 'PIN_RESET', target.id, `PIN reset for ${target.employeeCode}`, null, { companyId: target.companyId, stationId: target.stationId }, now)
  })()
  res.json({ id: target.id, message: `PIN reset for ${target.employeeCode}.` })
})

attendantsRouter.post('/:id/deactivate', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  let target: AttendantRow
  try {
    target = requireManage(session, req.params.id)
  } catch (error) {
    const status = error instanceof Error && error.message === 'NOT_FOUND' ? 404 : 403
    res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: status === 404 ? 'Attendant not found.' : 'You cannot manage this attendant.' })
    return
  }
  const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare('UPDATE attendants SET active = 0, failedAttempts = 0 WHERE id = ?').run(target.id)
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(target.id)
    audit(req, 'ATTENDANT_DEACTIVATED', target.id, `Deactivated ${target.employeeCode} (${target.fullName})`, null, { companyId: target.companyId, stationId: target.stationId }, now)
  })()
  res.json({ id: target.id, active: false })
})

attendantsRouter.put('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  let target: AttendantRow
  try {
    target = requireManage(session, req.params.id)
  } catch (error) {
    const status = error instanceof Error && error.message === 'NOT_FOUND' ? 404 : 403
    res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: status === 404 ? 'Attendant not found.' : 'You cannot manage this attendant.' })
    return
  }
  const updates: string[] = []
  const params: unknown[] = []
  try {
    if (body.fullName !== undefined) { updates.push('fullName = ?'); params.push(validName(body.fullName)) }
    if (body.phone !== undefined) { updates.push('phone = ?'); params.push(validPhone(body.phone)) }
    if (body.stationId !== undefined) {
      if (session.role === 'supervisor') throw new Error('Supervisors cannot move attendants between stations.')
      const station = stationForSession(session, body.stationId)
      updates.push('stationId = ?', 'companyId = ?', 'companyShortCode = ?')
      params.push(station.id, station.companyId, station.companyShortCode)
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') throw new Error('active must be a boolean.')
      updates.push('active = ?')
      params.push(body.active ? 1 : 0)
    }
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid attendant update.' })
    return
  }
  if (updates.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update.' })
    return
  }
  params.push(target.id)
  const now = new Date().toISOString()
  try {
    db.transaction(() => {
      db.prepare(`UPDATE attendants SET ${updates.join(', ')} WHERE id = ?`).run(...params)
      if (body.active === false) db.prepare('DELETE FROM sessions WHERE userId = ?').run(target.id)
      audit(req, 'ATTENDANT_UPDATED', target.id, `Updated profile for ${target.employeeCode}`, null, { companyId: target.companyId, stationId: target.stationId }, now)
    })()
  } catch {
    res.status(409).json({ error: 'CONFLICT', message: 'Attendant could not be updated.' })
    return
  }
  res.json(publicAttendant(db.prepare('SELECT * FROM attendants WHERE id = ?').get(target.id) as AttendantRow))
})

attendantsRouter.delete('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  let target: AttendantRow
  try {
    target = requireManage(session, req.params.id)
  } catch (error) {
    const status = error instanceof Error && error.message === 'NOT_FOUND' ? 404 : 403
    res.status(status).json({ error: status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: status === 404 ? 'Attendant not found.' : 'You cannot manage this attendant.' })
    return
  }
  const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare('UPDATE attendants SET active = 0, approvalStatus = ?, failedAttempts = 0 WHERE id = ?').run('REJECTED', target.id)
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(target.id)
    audit(req, 'ATTENDANT_DELETED', target.id, `Deactivated attendant ${target.employeeCode}`, null, { companyId: target.companyId, stationId: target.stationId }, now)
  })()
  res.json({ success: true, id: target.id, employeeCode: target.employeeCode, active: false })
})

interface PurgeTarget {
  id: string
  employeeCode: string
  fullName: string
  companyId: string | null
  stationId: string | null
}

/**
 * Permanently removes an account row.
 *
 * Deliberately a separate route from the soft delete above. `DELETE /:id` is
 * wired to a "remove staff member" button in the app, and quietly upgrading
 * that into a hard delete would make an ordinary click irreversible. This
 * endpoint is opt-in, super admin only, and demands the Super Admin PIN be
 * re-entered, matching /api/auth/wipe-database.
 */
attendantsRouter.delete('/:id/permanent', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  if (!destructiveOperationsEnabled()) {
    res.status(403).json({ error: 'DISABLED', message: 'Destructive operations are disabled on this server.' })
    return
  }
  const session = sessionOf(req)
  const target = db.prepare('SELECT id, employeeCode, fullName, companyId, stationId FROM attendants WHERE id = ?').get(req.params.id) as PurgeTarget | undefined
  if (!target) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Attendant not found.' })
    return
  }
  if (target.id === session.userId) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'You cannot delete the account you are signed in with.' })
    return
  }
  if (!superAdminPinAccepted((req.body ?? {}).pin)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'The supplied Super Admin PIN is invalid.' })
    return
  }
  const footprint = attendantFinancialFootprint(target.id)
  if (footprint.shifts > 0 || footprint.transactions > 0) {
    res.status(409).json({
      error: 'CONFLICT',
      message: `This account owns ${footprint.shifts} shift(s) and ${footprint.transactions} transaction(s). Deactivate it instead so that history stays attributable to a real person.`,
      ...footprint,
    })
    return
  }
  const now = new Date().toISOString()
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM sessions WHERE userId = ?').run(target.id)
      db.prepare('DELETE FROM attendants WHERE id = ?').run(target.id)
      audit(req, 'ATTENDANT_PURGED', target.id, `Permanently removed attendant ${target.employeeCode} (${target.fullName})`, null, { companyId: target.companyId, stationId: target.stationId, ...footprint }, now)
    })()
  } catch {
    res.status(409).json({ error: 'CONFLICT', message: 'Attendant could not be removed. Deactivate the account instead.' })
    return
  }
  res.json({ success: true, id: target.id, employeeCode: target.employeeCode, removed: true })
})
