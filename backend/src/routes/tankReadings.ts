import { Router } from 'express'
import { db } from '../db'
import { newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest } from '../middleware'

export const tankReadingsRouter = Router()

interface TankReadingEntry {
  tankId: string
  fuelCode: string
  openingLevel: number
  closingLevel: number
  dipStock: number
  received: number
  notes?: string
}

// --- Supervisor: record tank readings ---
tankReadingsRouter.post('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { stationId, readings, notes } = (req.body ?? {}) as {
    stationId?: string
    readings?: TankReadingEntry[]
    notes?: string
  }

  if (!stationId || !Array.isArray(readings) || readings.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'stationId and at least one reading are required.' })
    return
  }

  const now = new Date().toISOString()
  const id = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  db.prepare(
    'INSERT INTO tankReadings (id, stationId, companyId, recordedBy, recordedByName, readings, recordedAt, notes, createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    stationId,
    req.session?.companyId ?? null,
    req.session?.userId ?? '',
    req.session?.fullName ?? '',
    JSON.stringify(readings),
    now,
    notes ?? null,
    now,
  )

  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    newToken(),
    'TANK_READING_RECORDED',
    req.session?.userId ?? '',
    req.session?.fullName ?? '',
    req.session?.role?.toUpperCase() ?? 'SUPERVISOR',
    id,
    `Tank readings for ${stationId}`,
    `${readings.length} tank(s) recorded`,
    now,
    null,
  )

  res.status(201).json({ id, stationId, readingsCount: readings.length, recordedAt: now })
})

// --- Get tank readings (manager sees own station, OMC sees all in company, superadmin sees all) ---
tankReadingsRouter.get('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const stationId = req.query.station as string | undefined
  const days = req.query.days ? parseInt(String(req.query.days), 10) : 30
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()

  let rows: Array<Record<string, unknown>>

  if (req.session?.role === 'superadmin') {
    if (stationId) {
      rows = db.prepare('SELECT * FROM tankReadings WHERE stationId = ? AND recordedAt >= ? ORDER BY recordedAt DESC').all(stationId, cutoff) as Array<Record<string, unknown>>
    } else {
      rows = db.prepare('SELECT * FROM tankReadings WHERE recordedAt >= ? ORDER BY recordedAt DESC').all(cutoff) as Array<Record<string, unknown>>
    }
  } else if (req.session?.role === 'headoffice') {
    if (stationId) {
      rows = db.prepare('SELECT * FROM tankReadings WHERE stationId = ? AND companyId = ? AND recordedAt >= ? ORDER BY recordedAt DESC').all(stationId, req.session.companyId, cutoff) as Array<Record<string, unknown>>
    } else {
      rows = db.prepare('SELECT * FROM tankReadings WHERE companyId = ? AND recordedAt >= ? ORDER BY recordedAt DESC').all(req.session.companyId, cutoff) as Array<Record<string, unknown>>
    }
  } else {
    rows = db.prepare('SELECT * FROM tankReadings WHERE stationId = ? AND recordedAt >= ? ORDER BY recordedAt DESC').all(req.session?.stationId ?? '', cutoff) as Array<Record<string, unknown>>
  }

  const parsed = rows.map(r => ({
    id: r.id,
    stationId: r.stationId,
    companyId: r.companyId,
    recordedBy: r.recordedBy,
    recordedByName: r.recordedByName,
    readings: JSON.parse(r.readings as string),
    recordedAt: r.recordedAt,
    notes: r.notes,
    createdAt: r.createdAt,
  }))

  res.json({ count: parsed.length, readings: parsed })
})

// --- Get single tank reading ---
tankReadingsRouter.get('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req, res) => {
  const row = db.prepare('SELECT * FROM tankReadings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Tank reading not found.' })
    return
  }
  res.json({
    id: row.id,
    stationId: row.stationId,
    companyId: row.companyId,
    recordedBy: row.recordedBy,
    recordedByName: row.recordedByName,
    readings: JSON.parse(row.readings as string),
    recordedAt: row.recordedAt,
    notes: row.notes,
  })
})
