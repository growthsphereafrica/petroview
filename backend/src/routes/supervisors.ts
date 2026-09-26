import { Router } from 'express'
import { db } from '../db'
import { newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'
export const supervisorsRouter = Router()

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

interface SupervisorTarget {
  id: string
  employeeCode: string
  fullName: string
  companyId: string | null
  stationId: string | null
  isSuperAdmin: number
}

function canManageSupervisor(session: SessionClaims, target: SupervisorTarget): boolean {
  if (session.role === 'superadmin') return true
  if (target.isSuperAdmin || target.employeeCode.toUpperCase() === 'SUPER-ADMIN') return false
  if (session.role === 'headoffice') return Boolean(session.companyId && target.companyId === session.companyId)
  return Boolean(session.stationId && target.stationId === session.stationId)
}


// --- Update supervisor profile (name, phone, station, active) ---
supervisorsRouter.put('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  // Validate shape and length before touching .trim(). The previous code called
  // .trim() on whatever arrived, so `{"fullName": 123}` threw a TypeError that
  // surfaced as a 500 and leaked "fullName.trim is not a function" to the caller.
  const nameInput = body.fullName
  const phoneInput = body.phone
  if (nameInput !== undefined && typeof nameInput !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'fullName must be a string.' })
    return
  }
  if (phoneInput !== undefined && phoneInput !== null && typeof phoneInput !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'phone must be a string.' })
    return
  }
  if (body.stationId !== undefined && body.stationId !== null && typeof body.stationId !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'stationId must be a string.' })
    return
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'active must be a boolean.' })
    return
  }
  const fullName = nameInput as string | undefined
  const phone = phoneInput as string | undefined
  const stationId = body.stationId as string | null | undefined
  const active = body.active as boolean | undefined
  if (fullName !== undefined && fullName.trim().length > 120) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Full name is too long.' })
    return
  }
  if (phone !== undefined && phone.trim().length > 40) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Phone number is too long.' })
    return
  }
  const row = db.prepare('SELECT id, employeeCode, fullName, companyId, stationId, isSuperAdmin FROM supervisors WHERE id = ?').get(req.params.id) as SupervisorTarget | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Supervisor not found.' })
    return
  }
  if (!canManageSupervisor(sessionOf(req), row)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot modify this supervisor.' })
    return
  }
  if (active !== undefined && sessionOf(req).role === 'supervisor') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Only Head Office can activate or deactivate supervisors.' })
    return
  }
  if (fullName !== undefined && !fullName.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Full name cannot be empty.' })
    return
  }
  if (stationId !== undefined && stationId) {
    const stationCompany = db.prepare('SELECT companyId FROM companyStations WHERE id = ? AND active = 1').get(stationId) as { companyId: string } | undefined
    const allowedStation = sessionOf(req).role === 'superadmin'
      ? Boolean(stationCompany)
      : sessionOf(req).role === 'headoffice'
        ? Boolean(stationCompany && stationCompany.companyId === sessionOf(req).companyId)
        : stationId === sessionOf(req).stationId
    if (!allowedStation) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'The selected station is outside your scope.' })
      return
    }
  }

  const updates: string[] = []
  const params: unknown[] = []
  if (fullName !== undefined) { updates.push('fullName = ?'); params.push(fullName.trim()) }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone.trim() || null) }
  if (stationId !== undefined) {
    updates.push('stationId = ?')
    params.push(stationId || null)
    if (stationId) {
      // Moving a supervisor to another station must move their company too.
      // Leaving companyId pointing at the old tenant left the row internally
      // inconsistent, and getUsableAccountScope then silently locked the
      // account out entirely.
      const targetStation = db.prepare('SELECT companyId FROM companyStations WHERE id = ? AND active = 1').get(stationId) as { companyId: string }
      const targetCompany = db.prepare('SELECT id, shortCode FROM companies WHERE id = ? AND active = 1').get(targetStation.companyId) as { id: string; shortCode: string } | undefined
      if (!targetCompany) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'The selected station has no active company.' })
        return
      }
      updates.push('companyId = ?', 'companyShortCode = ?')
      params.push(targetCompany.id, targetCompany.shortCode)
      // The old session carries the previous company scope, so it must not
      // survive a tenant change.
      db.prepare('DELETE FROM sessions WHERE userId = ?').run(req.params.id)
    } else {
      updates.push('companyId = NULL', 'companyShortCode = NULL')
    }
  }
  if (active !== undefined) {
    updates.push('active = ?')
    params.push(active ? 1 : 0)
    if (!active) db.prepare('DELETE FROM sessions WHERE userId = ?').run(req.params.id)
  }
  if (updates.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update.' })
    return
  }
  params.push(req.params.id)
  db.prepare(`UPDATE supervisors SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    newToken(), 'SUPERVISOR_UPDATED',
    sessionOf(req).userId, sessionOf(req).fullName, sessionOf(req).role.toUpperCase(),
    req.params.id, `Updated profile for ${row.employeeCode}`, null, now, null,
  )
  const updated = db.prepare('SELECT * FROM supervisors WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({
    id: updated.id,
    employeeCode: updated.employeeCode,
    fullName: updated.fullName,
    phone: updated.phone,
    stationId: updated.stationId,
    companyId: updated.companyId,
    active: (updated.active as number) === 1,
  })
})

// --- Delete supervisor permanently ---
supervisorsRouter.delete('/:id', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT id, employeeCode, fullName, companyId, stationId, isSuperAdmin FROM supervisors WHERE id = ?').get(req.params.id) as SupervisorTarget | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Supervisor not found.' })
    return
  }
  if (!canManageSupervisor(sessionOf(req), row)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot delete this supervisor.' })
    return
  }
  db.prepare('DELETE FROM sessions WHERE userId = ?').run(req.params.id)
  db.prepare('DELETE FROM supervisors WHERE id = ?').run(req.params.id)
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    newToken(), 'SUPERVISOR_DELETED',
    sessionOf(req).userId, sessionOf(req).fullName, sessionOf(req).role.toUpperCase(),
    req.params.id, `Deleted supervisor ${row.employeeCode} (${row.fullName})`, null, now, null,
  )
  res.json({ success: true, id: req.params.id, employeeCode: row.employeeCode })
})

// --- Deactivate supervisor ---
supervisorsRouter.post('/:id/deactivate', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT id, employeeCode, fullName, companyId, stationId, isSuperAdmin FROM supervisors WHERE id = ?').get(req.params.id) as SupervisorTarget | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Supervisor not found.' })
    return
  }
  if (!canManageSupervisor(sessionOf(req), row)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot deactivate this supervisor.' })
    return
  }
  db.prepare('UPDATE supervisors SET active = 0 WHERE id = ?').run(req.params.id)
  db.prepare('DELETE FROM sessions WHERE userId = ?').run(req.params.id)
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    newToken(), 'SUPERVISOR_DEACTIVATED',
    sessionOf(req).userId, sessionOf(req).fullName, sessionOf(req).role.toUpperCase(),
    req.params.id, `Deactivated supervisor ${row.employeeCode} (${row.fullName})`, null, now, null,
  )
  res.json({ id: req.params.id, active: false })
})
