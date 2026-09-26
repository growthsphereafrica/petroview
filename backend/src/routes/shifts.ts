import { Router } from 'express'
import { db, deserializeShift, type ShiftRow, type ShiftStatus } from '../db'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'
import { newToken } from '../auth'
import { assertShiftLedger } from './sync'

export const shiftsRouter = Router()

const STATUSES = new Set(['OPEN', 'CLOSED', 'REVIEWED', 'APPROVED', 'REJECTED'])
type ScopedShiftRow = ShiftRow & { companyId?: string | null; companyShortCode?: string | null }

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function stationBelongsToCompany(stationId: string, companyId: string | null): boolean {
  if (!companyId) return false
  const row = db.prepare('SELECT companyId FROM companyStations WHERE id = ?').get(stationId) as { companyId: string } | undefined
  return row?.companyId === companyId
}

function canAccessShift(session: SessionClaims, shift: ScopedShiftRow): boolean {
  if (session.role === 'superadmin') return true
  if (session.role === 'supervisor') return Boolean(session.stationId && shift.stationId === session.stationId)
  if (session.role === 'attendant') return Boolean(session.stationId && shift.stationId === session.stationId && shift.attendantId === session.userId)
  return Boolean(session.companyId && (shift.companyId === session.companyId || stationBelongsToCompany(shift.stationId, session.companyId)))
}

function validateStationScope(req: AuthRequest, stationId: string | null, companyId: string | null): string | null {
  if (!stationId) return null
  const station = db.prepare('SELECT companyId FROM companyStations WHERE id = ? AND active = 1').get(stationId) as { companyId: string } | undefined
  if (!station) return 'Station is not active or does not exist.'
  if (sessionOf(req).role === 'headoffice' && station.companyId !== sessionOf(req).companyId) return 'Station is outside your company.'
  if (companyId && station.companyId !== companyId) return 'Station does not belong to the requested company.'
  return null
}

shiftsRouter.get('/', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const requestedStatuses = typeof req.query.status === 'string' ? req.query.status.toUpperCase().split(',').map(value => value.trim()).filter(Boolean) : []
  if (requestedStatuses.some(status => !STATUSES.has(status))) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid shift status filter.' })
    return
  }

  const requestedStation = typeof req.query.station === 'string' ? req.query.station.trim() : ''
  const requestedCompany = typeof req.query.companyId === 'string' ? req.query.companyId.trim() : ''
  const requestedAttendant = typeof req.query.attendantId === 'string' ? req.query.attendantId.trim() : ''
  let stationId: string | null = requestedStation || null
  let companyId: string | null = requestedCompany || null
  let attendantId: string | null = requestedAttendant || null

  if (session.role === 'supervisor') {
    if (!session.stationId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Your account is not assigned to a station.' })
      return
    }
    if (stationId && stationId !== 'ALL' && stationId !== session.stationId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot view another station.' })
      return
    }
    stationId = session.stationId
    companyId = null
    attendantId = null
  } else if (session.role === 'headoffice') {
    if (!session.companyId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Your account is not assigned to a company.' })
      return
    }
    if (companyId && companyId !== 'ALL' && companyId !== session.companyId && companyId.toUpperCase() !== (session.companyShortCode ?? '').toUpperCase()) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot view another company.' })
      return
    }
    companyId = session.companyId
  } else if (session.role === 'attendant') {
    if (!session.stationId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Your account is not assigned to a station.' })
      return
    }
    if (stationId && stationId !== 'ALL' && stationId !== session.stationId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot view another station.' })
      return
    }
    if (attendantId && attendantId !== session.userId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot view another attendant record.' })
      return
    }
    stationId = session.stationId
    companyId = null
    attendantId = session.userId
  } else {
    stationId = stationId === 'ALL' ? null : stationId
    companyId = companyId === 'ALL' ? null : companyId
  }

  const stationError = validateStationScope(req, stationId, companyId)
  if (stationError) {
    res.status(403).json({ error: 'FORBIDDEN', message: stationError })
    return
  }

  const conditions: string[] = []
  const params: Record<string, string | number> = {}
  if (requestedStatuses.length > 0) {
    conditions.push(`status IN (${requestedStatuses.map((_, index) => `@status${index}`).join(',')})`)
    requestedStatuses.forEach((status, index) => { params[`status${index}`] = status })
  }
  if (stationId) {
    conditions.push('stationId = @stationId')
    params.stationId = stationId
  }
  if (companyId) {
    conditions.push('(companyId = @companyId OR stationId IN (SELECT id FROM companyStations WHERE companyId = @companyId))')
    params.companyId = companyId
  }
  if (attendantId) {
    conditions.push('attendantId = @attendantId')
    params.attendantId = attendantId
  }
  const requestedLimit = Number(req.query.limit ?? 500)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 2000) : 500
  params.limit = limit
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM shifts${where} ORDER BY openedAt DESC LIMIT @limit`).all(params) as ScopedShiftRow[]
  res.json({ count: rows.length, shifts: rows.map(deserializeShift) })
})

shiftsRouter.get('/:id', authenticate, (req: AuthRequest, res) => {
  const row = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as ScopedShiftRow | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  if (!canAccessShift(sessionOf(req), row)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot access this shift.' })
    return
  }
  const transactions = db.prepare('SELECT * FROM transactions WHERE shiftId = ? ORDER BY recordedAt').all(req.params.id)
  res.json({ shift: deserializeShift(row), transactions })
})

shiftsRouter.post('/:id/review', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as { status?: string; reviewerNotes?: string }
  const status = String(body.status ?? '').toUpperCase()
  if (!['APPROVED', 'REJECTED', 'REVIEWED'].includes(status)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid status (APPROVED, REJECTED, REVIEWED) is required.' })
    return
  }
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as ScopedShiftRow | undefined
  if (!shift) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  if (!canAccessShift(sessionOf(req), shift)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot review this shift.' })
    return
  }
  if (shift.status !== 'CLOSED') {
    res.status(409).json({ error: 'INVALID_STATE', message: 'Only closed shifts can be reviewed.' })
    return
  }
  // Separation of duties: the same person cannot sign off their own shift.
  if (shift.attendantId === sessionOf(req).userId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot review a shift you recorded yourself. Ask another supervisor or Head Office.' })
    return
  }
  // This path previously skipped the ledger reconciliation that the device sync
  // path performs, so a shift with a fabricated or incomplete transaction ledger
  // could be approved.
  try {
    assertShiftLedger(shift)
  } catch (error) {
    res.status(409).json({ error: 'LEDGER_MISMATCH', message: error instanceof Error ? error.message : 'Shift ledger is incomplete.' })
    return
  }
  const reviewerNotes = typeof body.reviewerNotes === 'string' ? body.reviewerNotes.trim().slice(0, 1000) : null
  const now = new Date().toISOString()
  const applied = db.prepare(`
    UPDATE shifts
    SET status = ?, reviewerNotes = ?, syncStatus = 'SYNCED', updatedAt = ?
    WHERE id = ? AND status = 'CLOSED'
  `).run(status, reviewerNotes, now, shift.id)
  if (applied.changes === 0) {
    res.status(409).json({ error: 'INVALID_STATE', message: 'This shift was already reviewed.' })
    return
  }
  db.prepare(`
    INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newToken(),
    status === 'APPROVED' ? 'REVIEW_APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'REVIEWED',
    sessionOf(req).userId,
    sessionOf(req).fullName,
    sessionOf(req).role.toUpperCase(),
    shift.id,
    `Shift ${shift.number} (${shift.attendantName}) - ${status}`,
    reviewerNotes,
    now,
  )
  const updated = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift.id) as ShiftRow
  res.json({ success: true, shift: deserializeShift(updated) })
})
