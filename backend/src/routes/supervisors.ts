import { Router } from 'express'
import { db } from '../db'
import { newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest } from '../middleware'

export const supervisorsRouter = Router()

// --- Update supervisor profile (name, phone, station, active) ---
supervisorsRouter.put('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { fullName, phone, stationId, active } = (req.body ?? {}) as {
    fullName?: string
    phone?: string
    stationId?: string
    active?: boolean
  }
  const row = db.prepare('SELECT * FROM supervisors WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Supervisor not found.' })
    return
  }

  // Prevent editing the Super Admin via this route
  if (row.isSuperAdmin || String(row.employeeCode).toUpperCase() === 'SUPER-ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot modify Super Admin via this route.' })
    return
  }

  const updates: string[] = []
  const params: unknown[] = []
  if (fullName !== undefined) { updates.push('fullName = ?'); params.push(fullName.trim()) }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone.trim() || null) }
  if (stationId !== undefined) { updates.push('stationId = ?'); params.push(stationId || null) }
  if (active !== undefined) {
    updates.push('active = ?')
    params.push(active ? 1 : 0)
    if (!active) {
      db.prepare('DELETE FROM supervisorSessions WHERE supervisorId = ?').run(req.params.id)
    }
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
    req.session?.userId ?? '', req.session?.fullName ?? '', req.session?.role?.toUpperCase() ?? 'ADMIN',
    req.params.id, `Updated profile for ${row.employeeCode as string}`, null, now, null,
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
  const row = db.prepare('SELECT employeeCode, fullName, isSuperAdmin FROM supervisors WHERE id = ?').get(req.params.id) as
    | { employeeCode: string; fullName: string; isSuperAdmin: number }
    | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Supervisor not found.' })
    return
  }
  if (row.isSuperAdmin || String(row.employeeCode).toUpperCase() === 'SUPER-ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot delete the Super Admin.' })
    return
  }
  db.prepare('DELETE FROM supervisorSessions WHERE supervisorId = ?').run(req.params.id)
  db.prepare('DELETE FROM supervisors WHERE id = ?').run(req.params.id)
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    newToken(), 'SUPERVISOR_DELETED',
    req.session?.userId ?? '', req.session?.fullName ?? '', req.session?.role?.toUpperCase() ?? 'ADMIN',
    req.params.id, `Deleted supervisor ${row.employeeCode} (${row.fullName})`, null, now, null,
  )
  res.json({ success: true, id: req.params.id, employeeCode: row.employeeCode })
})

// --- Deactivate supervisor ---
supervisorsRouter.post('/:id/deactivate', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT employeeCode, fullName, isSuperAdmin FROM supervisors WHERE id = ?').get(req.params.id) as
    | { employeeCode: string; fullName: string; isSuperAdmin: number }
    | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Supervisor not found.' })
    return
  }
  if (row.isSuperAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot deactivate Super Admin.' })
    return
  }
  db.prepare('UPDATE supervisors SET active = 0 WHERE id = ?').run(req.params.id)
  db.prepare('DELETE FROM supervisorSessions WHERE supervisorId = ?').run(req.params.id)
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    newToken(), 'SUPERVISOR_DEACTIVATED',
    req.session?.userId ?? '', req.session?.fullName ?? '', req.session?.role?.toUpperCase() ?? 'ADMIN',
    req.params.id, `Deactivated supervisor ${row.employeeCode} (${row.fullName})`, null, now, null,
  )
  res.json({ id: req.params.id, active: false })
})
