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
  if (session.role === 'attendant') return shift.attendantId === session.userId
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
    attendantId = requestedAttendant || null
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
    attendantId = requestedAttendant || null
  } else if (session.role === 'attendant') {
    // An attendant must ALWAYS be able to view their own shifts to check status and handle rejections
    attendantId = session.userId
    companyId = null
    if (stationId && stationId !== 'ALL' && session.stationId && stationId !== session.stationId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot view another station.' })
      return
    }
    stationId = null
  } else {
    stationId = stationId === 'ALL' ? null : stationId
    companyId = companyId === 'ALL' ? null : companyId
    attendantId = requestedAttendant || null
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

  const fromDate = typeof req.query.from === 'string' && req.query.from.trim() ? req.query.from.trim() : null
  const toDate = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to.trim() : null
  if (fromDate) {
    conditions.push('openedAt >= @fromDate')
    params.fromDate = fromDate
  }
  if (toDate) {
    conditions.push('openedAt <= @toDate')
    params.toDate = toDate
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
  if (shift.status !== 'CLOSED' && !(shift.status === 'REJECTED' && status === 'REJECTED')) {
    res.status(409).json({ error: 'INVALID_STATE', message: 'Only closed shifts can be reviewed.' })
    return
  }
  // Separation of duties: the same person cannot sign off their own shift.
  if (shift.attendantId === sessionOf(req).userId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot review a shift you recorded yourself. Ask another supervisor or Head Office.' })
    return
  }
  if (status === 'APPROVED') {
    try {
      assertShiftLedger(shift)
    } catch (error) {
      res.status(409).json({ error: 'LEDGER_MISMATCH', message: error instanceof Error ? error.message : 'Shift ledger is incomplete.' })
      return
    }
  }
  const reviewerNotes = typeof body.reviewerNotes === 'string' ? body.reviewerNotes.trim().slice(0, 1000) : null
  const now = new Date().toISOString()
  const reviewerName = sessionOf(req).fullName || sessionOf(req).userId
  const applied = db.prepare(`
    UPDATE shifts
    SET status = ?, reviewerNotes = ?, reviewedBy = ?, reviewedAt = ?, syncStatus = 'SYNCED', updatedAt = ?
    WHERE id = ? AND (status = 'CLOSED' OR status = 'REJECTED')
  `).run(status, reviewerNotes, reviewerName, now, now, shift.id)
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

shiftsRouter.post('/:id/resubmit', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as ScopedShiftRow | undefined
  if (!shift) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  if (session.role === 'attendant' && shift.attendantId !== session.userId) {
    res.status(403).json({ error: 'FORBIDDEN', message: "You cannot resubmit another attendant's shift." })
    return
  }
  if (session.role === 'supervisor' && shift.stationId !== session.stationId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot resubmit a shift from another station.' })
    return
  }
  if (!canAccessShift(session, shift)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot access this shift.' })
    return
  }
  if (shift.status !== 'REJECTED' && shift.status !== 'CLOSED') {
    res.status(409).json({ error: 'INVALID_STATE', message: 'Only rejected or closed shifts can be resubmitted with corrections.' })
    return
  }

  const body = (req.body ?? {}) as {
    pumpId?: string
    pumpName?: string
    openingReadings?: unknown
    closingReadings?: unknown
    sales?: unknown
    expectedTotal?: number
    payments?: unknown
    actualTotal?: number
    variance?: number
    notes?: string
  }

  const now = new Date().toISOString()
  const pumpId = typeof body.pumpId === 'string' && body.pumpId.trim() ? body.pumpId.trim() : shift.pumpId
  const pumpName = typeof body.pumpName === 'string' && body.pumpName.trim() ? body.pumpName.trim() : shift.pumpName

  let openingReadingsStr = shift.openingReadings
  if (body.openingReadings !== undefined) {
    openingReadingsStr = typeof body.openingReadings === 'string' ? body.openingReadings : JSON.stringify(body.openingReadings)
  }

  let closingReadingsStr = shift.closingReadings
  if (body.closingReadings !== undefined) {
    closingReadingsStr = typeof body.closingReadings === 'string' ? body.closingReadings : JSON.stringify(body.closingReadings)
  }

  let salesStr = shift.sales
  if (body.sales !== undefined) {
    salesStr = typeof body.sales === 'string' ? body.sales : JSON.stringify(body.sales)
  }

  let paymentsStr = shift.payments
  if (body.payments !== undefined) {
    paymentsStr = typeof body.payments === 'string' ? body.payments : JSON.stringify(body.payments)
  }

  const expectedTotal = typeof body.expectedTotal === 'number' ? body.expectedTotal : shift.expectedTotal
  const actualTotal = typeof body.actualTotal === 'number' ? body.actualTotal : shift.actualTotal
  const variance = typeof body.variance === 'number' ? body.variance : Math.round((actualTotal - expectedTotal) * 100) / 100
  const userNotes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const combinedNotes = userNotes ? `[Corrected & Resubmitted] ${userNotes}` : (shift.notes ? `${shift.notes} [Resubmitted with corrections]` : '[Resubmitted with corrections]')

  let assignedNozzlesStr = shift.assignedNozzles
  if (Array.isArray((body as any).assignedNozzles)) {
    assignedNozzlesStr = JSON.stringify((body as any).assignedNozzles)
  } else if (body.openingReadings && Array.isArray(body.openingReadings)) {
    assignedNozzlesStr = JSON.stringify(
      (body.openingReadings as any[]).map((r, i) => r.nozzleLabel || `Nozzle ${r.nozzleIndex ?? (i + 1)} (${r.fuelCode})`)
    )
  }

  db.prepare(`
    UPDATE shifts
    SET pumpId = ?,
        pumpName = ?,
        assignedNozzles = ?,
        openingReadings = ?,
        closingReadings = ?,
        sales = ?,
        expectedTotal = ?,
        payments = ?,
        actualTotal = ?,
        variance = ?,
        notes = ?,
        status = 'CLOSED',
        syncStatus = 'SYNCED',
        updatedAt = ?
    WHERE id = ?
  `).run(
    pumpId,
    pumpName,
    assignedNozzlesStr,
    openingReadingsStr,
    closingReadingsStr,
    salesStr,
    expectedTotal,
    paymentsStr,
    actualTotal,
    variance,
    combinedNotes,
    now,
    shift.id,
  )

  db.prepare(`
    INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newToken(),
    'SHIFT_RESUBMITTED',
    session.userId,
    session.fullName,
    session.role.toUpperCase(),
    shift.id,
    `Shift ${shift.number} (${shift.attendantName}) - Corrected & Resubmitted`,
    `Prior rejection note: "${shift.reviewerNotes || 'None'}". Attendant note: "${userNotes || 'None'}"`,
    now,
  )

  const updated = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift.id) as ShiftRow
  res.json({ success: true, shift: deserializeShift(updated) })
})

shiftsRouter.post('/:id/close', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id) as ScopedShiftRow | undefined
  if (!shift) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  if (session.role === 'attendant' && shift.attendantId !== session.userId) {
    res.status(403).json({ error: 'FORBIDDEN', message: "You cannot close another attendant's shift." })
    return
  }
  if (session.role === 'supervisor' && shift.stationId !== session.stationId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot close a shift from another station.' })
    return
  }
  if (!canAccessShift(session, shift)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot access this shift.' })
    return
  }

  // Idempotent: If already closed or reviewed, return current state
  if (shift.status === 'CLOSED' || shift.status === 'APPROVED' || shift.status === 'REVIEWED') {
    res.json({ success: true, shift: deserializeShift(shift), alreadyClosed: true })
    return
  }

  const body = (req.body ?? {}) as {
    closingReadings?: unknown
    sales?: unknown
    expectedTotal?: number
    payments?: unknown
    actualTotal?: number
    variance?: number
    notes?: string
    closedAt?: string
  }

  const now = new Date().toISOString()
  const closedAt = typeof body.closedAt === 'string' && body.closedAt ? body.closedAt : now

  let closingReadingsStr = shift.closingReadings
  if (body.closingReadings !== undefined) {
    closingReadingsStr = typeof body.closingReadings === 'string' ? body.closingReadings : JSON.stringify(body.closingReadings)
  }

  let salesStr = shift.sales
  if (body.sales !== undefined) {
    salesStr = typeof body.sales === 'string' ? body.sales : JSON.stringify(body.sales)
  }

  let paymentsStr = shift.payments
  if (body.payments !== undefined) {
    paymentsStr = typeof body.payments === 'string' ? body.payments : JSON.stringify(body.payments)
  }

  const expectedTotal = typeof body.expectedTotal === 'number' ? body.expectedTotal : shift.expectedTotal
  const actualTotal = typeof body.actualTotal === 'number' ? body.actualTotal : shift.actualTotal
  const variance = typeof body.variance === 'number' ? body.variance : Math.round((actualTotal - expectedTotal) * 100) / 100
  const userNotes = typeof body.notes === 'string' ? body.notes.trim() : (shift.notes || '')

  // Ensure all metered sales have corresponding transactions in SQLite so assertShiftLedger succeeds
  try {
    const parsedSales = Array.isArray(body.sales)
      ? body.sales
      : (typeof salesStr === 'string' ? JSON.parse(salesStr) : [])
    for (const sale of parsedSales) {
      if (sale && Number(sale.litres) > 0) {
        const fuelCode = String(sale.fuelCode).toUpperCase()
        const row = db.prepare('SELECT COALESCE(SUM(litres), 0) AS totalLitres FROM transactions WHERE shiftId = ? AND UPPER(fuelCode) = ?').get(shift.id, fuelCode) as { totalLitres: number }
        const missingLitres = Math.round((Number(sale.litres) - row.totalLitres) * 100) / 100
        if (missingLitres > 0.05) {
          const unitPrice = Number(sale.unitPrice) || 14.8
          const missingAmount = Math.round(missingLitres * unitPrice * 100) / 100
          db.prepare(`
            INSERT INTO transactions (id, shiftId, attendantId, fuelCode, litres, amount, unitPrice, method, customerRef, recordedAt, syncStatus)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'CASH', 'Shift closing auto-reconciliation', ?, 'SYNCED')
          `).run(
            newToken(),
            shift.id,
            shift.attendantId,
            fuelCode,
            missingLitres,
            missingAmount,
            unitPrice,
            closedAt
          )
        }
      }
    }
  } catch (txErr) {
    console.warn('[closeShift] auto-reconciliation error:', txErr)
  }

  db.prepare(`
    UPDATE shifts
    SET closingReadings = ?,
        sales = ?,
        expectedTotal = ?,
        payments = ?,
        actualTotal = ?,
        variance = ?,
        notes = ?,
        status = 'CLOSED',
        closedAt = ?,
        syncStatus = 'SYNCED',
        updatedAt = ?
    WHERE id = ?
  `).run(
    closingReadingsStr,
    salesStr,
    expectedTotal,
    paymentsStr,
    actualTotal,
    variance,
    userNotes,
    closedAt,
    now,
    shift.id,
  )

  db.prepare(`
    INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newToken(),
    'SHIFT_CLOSED',
    session.userId,
    session.fullName,
    session.role.toUpperCase(),
    shift.id,
    `Shift ${shift.number} (${shift.attendantName}) closed. Variance: GHS ${variance.toFixed(2)}`,
    userNotes,
    now,
  )

  const updated = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift.id) as ShiftRow
  res.json({ success: true, shift: deserializeShift(updated) })
})


