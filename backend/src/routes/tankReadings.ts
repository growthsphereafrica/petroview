import { Router } from 'express'
import { db } from '../db'
import { newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

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

interface StationRow {
  id: string
  companyId: string
  name: string
}

interface ReadingRow {
  id: string
  stationId: string
  companyId: string | null
  recordedBy: string
  recordedByName: string
  readings: string
  recordedAt: string
  notes: string | null
  createdAt: string
}

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function stationById(value: unknown): StationRow | undefined {
  const stationId = typeof value === 'string' ? value.trim() : ''
  if (!stationId) return undefined
  return db.prepare(`SELECT cs.id, cs.companyId, cs.name FROM companyStations cs JOIN companies c ON c.id = cs.companyId WHERE cs.active = 1 AND c.active = 1 AND (UPPER(cs.id) = UPPER(?) OR UPPER(cs.code) = UPPER(?)) LIMIT 1`).get(stationId, stationId) as StationRow | undefined
}

function stationForSession(session: SessionClaims, value: unknown, required = true): StationRow {
  const requested = typeof value === 'string' && value.trim() ? value.trim() : session.stationId
  if (!requested) throw new Error(required ? 'stationId is required.' : 'Your account has no assigned station.')
  const station = stationById(requested)
  if (!station) throw new Error('Station is inactive or does not exist.')
  if (session.role === 'headoffice' && session.companyId !== station.companyId) throw new Error('Station is outside your company.')
  if (session.role === 'supervisor' && session.stationId !== station.id) throw new Error('Supervisors can only access their assigned station.')
  return station
}

function canAccessStation(session: SessionClaims, stationId: string): boolean {
  const station = stationById(stationId)
  if (!station) return false
  return session.role === 'superadmin' || (session.role === 'headoffice' ? session.companyId === station.companyId : session.stationId === station.id)
}

function validEntry(value: unknown, companyId: string): TankReadingEntry {
  if (!value || typeof value !== 'object') throw new Error('Each tank reading must be an object.')
  const entry = value as Record<string, unknown>
  const tankId = typeof entry.tankId === 'string' ? entry.tankId.trim() : ''
  const fuelCode = typeof entry.fuelCode === 'string' ? entry.fuelCode.trim().toUpperCase() : ''
  if (!/^[A-Z0-9_-]{1,30}$/.test(tankId)) throw new Error('Invalid tankId.')
  if (!/^[A-Z0-9_-]{1,20}$/.test(fuelCode)) throw new Error('Invalid fuelCode.')
  const allowed = new Set((db.prepare('SELECT code FROM products WHERE active = 1 AND (companyId = ? OR companyId IS NULL)').all(companyId) as Array<{ code: string }>).map(row => row.code.toUpperCase()))
  if (allowed.size > 0 && !allowed.has(fuelCode)) throw new Error('fuelCode is not configured for this company.')
  const number = (input: unknown, field: string): number => {
    const result = Number(input)
    if (!Number.isFinite(result) || result < 0) throw new Error(`${field} must be a non-negative number.`)
    return result
  }
  return {
    tankId,
    fuelCode,
    openingLevel: number(entry.openingLevel, 'openingLevel'),
    closingLevel: number(entry.closingLevel, 'closingLevel'),
    dipStock: number(entry.dipStock, 'dipStock'),
    received: number(entry.received, 'received'),
    notes: typeof entry.notes === 'string' ? entry.notes.trim().slice(0, 500) : undefined,
  }
}

function parseReadings(value: unknown): TankReadingEntry[] {
  try {
    const parsed: unknown = JSON.parse(String(value))
    return Array.isArray(parsed) ? parsed as TankReadingEntry[] : []
  } catch {
    return []
  }
}

function audit(req: AuthRequest, id: string, station: StationRow, count: number, now: string): void {
  const session = sessionOf(req)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'TANK_READING_RECORDED', session.userId, session.fullName, session.role.toUpperCase(), id, `Tank readings for ${station.id}`, `${count} tank(s) recorded`, now, JSON.stringify({ companyId: station.companyId, stationId: station.id }),
  )
}

tankReadingsRouter.post('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  let station: StationRow
  try {
    station = stationForSession(session, body.stationId ?? session.stationId)
  } catch (error) {
    res.status(403).json({ error: 'FORBIDDEN', message: error instanceof Error ? error.message : 'Station is outside your account scope.' })
    return
  }
  if (!Array.isArray(body.readings) || body.readings.length === 0 || body.readings.length > 100) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'readings must contain between 1 and 100 items.' })
    return
  }
  let readings: TankReadingEntry[]
  try {
    readings = body.readings.map(value => validEntry(value, station.companyId))
    if (new Set(readings.map(reading => reading.tankId)).size !== readings.length) throw new Error('tankId values must be unique.')
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid tank readings.' })
    return
  }
  const now = new Date().toISOString()
  const id = `tr-${newToken()}`
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : null
  db.prepare('INSERT INTO tankReadings (id, stationId, companyId, recordedBy, recordedByName, readings, recordedAt, notes, createdAt) VALUES (?,?,?,?,?,?,?,?,?)').run(id, station.id, station.companyId, session.userId, session.fullName, JSON.stringify(readings), now, notes, now)
  audit(req, id, station, readings.length, now)
  res.status(201).json({ id, stationId: station.id, companyId: station.companyId, readingsCount: readings.length, recordedAt: now })
})

tankReadingsRouter.get('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const rawDays = req.query.days === undefined ? 30 : Number(req.query.days)
  if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > 365) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'days must be an integer between 1 and 365.' })
    return
  }
  let station: StationRow | undefined
  if (req.query.station !== undefined || session.role === 'supervisor') {
    try {
      station = stationForSession(session, req.query.station ?? session.stationId)
    } catch (error) {
      res.status(403).json({ error: 'FORBIDDEN', message: error instanceof Error ? error.message : 'Station is outside your account scope.' })
      return
    }
  }
  const cutoff = new Date(Date.now() - rawDays * 86_400_000).toISOString()
  let rows: ReadingRow[]
  if (station) {
    rows = db.prepare('SELECT * FROM tankReadings WHERE stationId = ? AND recordedAt >= ? ORDER BY recordedAt DESC LIMIT 1000').all(station.id, cutoff) as ReadingRow[]
  } else if (session.role === 'headoffice') {
    rows = db.prepare('SELECT * FROM tankReadings WHERE companyId = ? AND recordedAt >= ? ORDER BY recordedAt DESC LIMIT 1000').all(session.companyId, cutoff) as ReadingRow[]
  } else if (session.role === 'superadmin') {
    rows = db.prepare('SELECT * FROM tankReadings WHERE recordedAt >= ? ORDER BY recordedAt DESC LIMIT 1000').all(cutoff) as ReadingRow[]
  } else {
    rows = []
  }
  res.json({ count: rows.length, readings: rows.map(row => ({ ...row, readings: parseReadings(row.readings) })) })
})

tankReadingsRouter.get('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const row = db.prepare('SELECT * FROM tankReadings WHERE id = ?').get(req.params.id) as ReadingRow | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Tank reading not found.' })
    return
  }
  if (!canAccessStation(session, row.stationId)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot access this tank reading.' })
    return
  }
  res.json({ ...row, readings: parseReadings(row.readings) })
})
