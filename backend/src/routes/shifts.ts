import { Router } from 'express'
import { db, deserializeShift, type ShiftRow, type ShiftStatus } from '../db'
import { authenticate } from '../middleware'

export const shiftsRouter = Router()

const STATUSES = new Set(['OPEN', 'CLOSED', 'REVIEWED', 'APPROVED', 'REJECTED'])

shiftsRouter.get('/', authenticate, (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase().split(',') : null
  const stationId = req.query.station ? String(req.query.station) : null
  const companyId = req.query.companyId ? String(req.query.companyId) : null
  const limitN = Math.min(parseInt(String(req.query.limit ?? '500'), 10) || 500, 2000)
  const conditions: string[] = []
  const params: Record<string, string | number> = {}

  if (status && status.every(s => STATUSES.has(s as ShiftStatus))) {
    conditions.push('status IN (' + status.map((_, i) => `@s${i}`).join(',') + ')')
    status.forEach((s, i) => (params[`s${i}`] = s))
  }
  if (stationId) { conditions.push('stationId = @station'); params.station = stationId }
  if (companyId && companyId !== 'ALL') {
    const cleanComp = companyId.replace(/^comp-/, '')
    conditions.push(`(
      companyId = @companyId 
      OR stationId IN (SELECT id FROM companyStations WHERE companyId = @companyId)
      OR stationId LIKE @compPattern
      OR attendantName LIKE @compPrefix
    )`)
    params.companyId = companyId
    params.compPattern = `%${cleanComp}%`
    params.compPrefix = `${cleanComp.toUpperCase()}%`
  }

  params.limit = limitN
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM shifts${where} ORDER BY openedAt DESC LIMIT @limit`).all(params) as ShiftRow[]
  res.json({ count: rows.length, shifts: rows.map(deserializeShift) })
})

shiftsRouter.get('/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  const transactions = db.prepare('SELECT * FROM transactions WHERE shiftId = ? ORDER BY recordedAt').all(req.params.id)
  res.json({ shift: deserializeShift(row as ShiftRow), transactions })
})

shiftsRouter.post('/:id/review', authenticate, (req: any, res) => {
  const { status, reviewerNotes } = req.body ?? {}
  if (!status || !['APPROVED', 'REJECTED', 'REVIEWED'].includes(status)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid status (APPROVED, REJECTED) is required.' })
    return
  }
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as ShiftRow | undefined
  if (!shift) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE shifts SET
      status = ?,
      reviewerNotes = ?,
      syncStatus = 'SYNCED',
      updatedAt = ?
    WHERE id = ?
  `).run(status, reviewerNotes || null, now, req.params.id)

  // Audit log entry
  try {
    const actorId = req.session?.userId ?? 'supervisor'
    const actorName = req.session?.fullName ?? 'Supervisor'
    const actorRole = (req.session?.role ?? 'supervisor').toUpperCase()
    db.prepare(`
      INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      status === 'APPROVED' ? 'REVIEW_APPROVED' : 'REJECTED',
      actorId,
      actorName,
      actorRole,
      req.params.id,
      `Shift ${shift.number} (${shift.attendantName}) - ${status}`,
      reviewerNotes || null,
      now
    )
  } catch (auditErr) {
    console.warn('[shiftsRouter] Failed to write audit log for shift review:', auditErr)
  }

  const updated = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as ShiftRow
  res.json({ success: true, shift: deserializeShift(updated) })
})