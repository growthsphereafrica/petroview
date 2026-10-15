import { Router } from 'express'
import { db } from '../db'
import { newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const pumpsRouter = Router()

interface StationRow {
  id: string
  companyId: string
  companyShortCode: string | null
}

interface PumpRow {
  id: string
  stationId: string
  companyId: string | null
  name: string
  fuels: string
  nozzles?: string | null
  active: number
  createdAt: string
  updatedAt: string
}

export interface PumpNozzle {
  id: string
  nozzleIndex: number
  name: string
  fuelCode: string
  active: boolean
}

function parseStoredNozzles(rawNozzles: unknown, fuels: string[]): PumpNozzle[] {
  if (typeof rawNozzles === 'string' && rawNozzles.trim()) {
    try {
      const parsed = JSON.parse(rawNozzles)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any, idx: number) => ({
          id: typeof item.id === 'string' ? item.id : `noz-${idx + 1}`,
          nozzleIndex: typeof item.nozzleIndex === 'number' ? item.nozzleIndex : (idx + 1),
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : (fuels[idx] ? `Nozzle ${idx + 1} (${fuels[idx]})` : `Nozzle ${idx + 1}`),
          fuelCode: typeof item.fuelCode === 'string' ? item.fuelCode.trim().toUpperCase() : (fuels[idx] || 'PMS'),
          active: item.active !== false,
        }))
      }
    } catch { /* fallback */ }
  }
  return fuels.map((f, idx) => {
    const isDup = fuels.filter(x => x === f).length > 1
    const name = isDup ? `Side ${idx + 1} (${f})` : `Nozzle ${idx + 1} (${f})`
    return {
      id: `noz-${idx + 1}`,
      nozzleIndex: idx + 1,
      name,
      fuelCode: f,
      active: true,
    }
  })
}

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function stationById(value: unknown): StationRow | undefined {
  const stationId = typeof value === 'string' ? value.trim() : ''
  if (!stationId) return undefined
  return db.prepare(`
    SELECT cs.id, cs.companyId, c.shortCode AS companyShortCode
    FROM companyStations cs
    JOIN companies c ON c.id = cs.companyId
    WHERE cs.active = 1 AND c.active = 1
      AND (UPPER(cs.id) = UPPER(?) OR UPPER(cs.code) = UPPER(?) OR UPPER(cs.name) = UPPER(?))
    LIMIT 1
  `).get(stationId, stationId, stationId) as StationRow | undefined
}

function canAccessStation(session: SessionClaims, station: StationRow): boolean {
  if (session.role === 'superadmin') return true
  if (session.role === 'headoffice') return session.companyId === station.companyId
  if (session.stationId && session.stationId === station.id) return true
  if (session.companyId && session.companyId === station.companyId) return true
  return false
}

function stationForRequest(session: SessionClaims, value: unknown, required = true): StationRow | undefined {
  const requested = typeof value === 'string' && value.trim() ? value.trim() : session.stationId
  if (!requested) {
    if (required) throw new Error('stationId is required.')
    return undefined
  }
  const station = stationById(requested)
  if (!station || !canAccessStation(session, station)) throw new Error('Station is outside your account scope.')
  return station
}

function canAccessPump(session: SessionClaims, pump: { stationId: string }): boolean {
  const station = stationById(pump.stationId)
  return !!station && canAccessStation(session, station)
}

function companyFuelCodes(companyId: string): string[] {
  const rows = db.prepare(`
    SELECT code FROM products
    WHERE active = 1 AND (companyId = ? OR companyId IS NULL)
    ORDER BY code
  `).all(companyId) as Array<{ code: string }>
  return Array.from(new Set(rows.map(row => row.code.trim().toUpperCase()).filter(Boolean)))
}

function normalizeFuels(value: unknown, companyId: string, fallback: string[] = []): string[] {
  const source = Array.isArray(value) ? value : fallback
  const result: string[] = []
  for (const item of source) {
    if (typeof item !== 'string') throw new Error('Pump fuels must be strings.')
    const fuel = item.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{1,20}$/.test(fuel)) throw new Error('Invalid pump fuel code.')
    // Allow the same fuel on multiple nozzles (e.g. Side 1 Petrol and Side 2 Petrol)
    result.push(fuel)
  }
  if (result.length > 32) throw new Error('A pump cannot have more than 32 fuel codes.')
  const allowed = new Set(companyFuelCodes(companyId))
  if (allowed.size > 0 && result.some(fuel => !allowed.has(fuel))) throw new Error('Pump contains an unavailable fuel code.')
  return result
}

function parseStoredFuels(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function audit(req: AuthRequest, action: string, targetId: string, description: string, meta: Record<string, unknown>, now: string): void {
  const session = sessionOf(req)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), action, session.userId, session.fullName, session.role.toUpperCase(), targetId, description, null, now, JSON.stringify(meta),
  )
}

pumpsRouter.get('/', (req: AuthRequest, res) => {
  const requestedStation = typeof req.query.stationId === 'string' ? req.query.stationId.trim() : null
  const requestedCompany = typeof req.query.companyId === 'string' ? req.query.companyId.trim() : null

  // Optional authentication: allow public lookup when stationId is passed (e.g. registration screen)
  let session: SessionClaims | null = null
  const header = req.header('authorization')
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (token) {
    const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as SessionClaims | undefined
    if (row && new Date(row.expiresAt).getTime() > Date.now()) {
      session = row
    }
  }

  if (!session) {
    if (!requestedStation) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing authentication token.' })
      return
    }
    const station = stationById(requestedStation)
    if (!station) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Station not found.' })
      return
    }
    let rows = db.prepare('SELECT p.* FROM pumps p WHERE p.stationId = ? AND p.active = 1 ORDER BY p.name ASC LIMIT 100').all(station.id) as PumpRow[]
    if (rows.length === 0) {
      const now = new Date().toISOString()
      for (let p = 1; p <= 4; p++) {
        const pId = `pump-${station.id}-${p}`
        const pName = `Pump ${p}`
        db.prepare('INSERT OR IGNORE INTO pumps (id, stationId, companyId, name, fuels, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(
          pId, station.id, station.companyId, pName, JSON.stringify(['PMS', 'AGO']), now, now,
        )
      }
      rows = db.prepare('SELECT p.* FROM pumps p WHERE p.stationId = ? AND p.active = 1 ORDER BY p.name ASC LIMIT 100').all(station.id) as PumpRow[]
    }
    res.json({
      count: rows.length,
      pumps: rows.map(row => {
        const fuels = parseStoredFuels(row.fuels)
        const nozzles = parseStoredNozzles(row.nozzles, fuels)
        return {
          id: row.id,
          stationId: row.stationId,
          companyId: row.companyId,
          name: row.name,
          fuels,
          nozzles,
          active: Number(row.active) === 1,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      }),
    })
    return
  }

  if (requestedCompany === 'ALL' && session.role !== 'superadmin') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Only Super Admin can list all companies.' })
    return
  }
  let station: StationRow | undefined
  try {
    station = stationForRequest(session, requestedStation, false)
  } catch (error) {
    res.status(403).json({ error: 'FORBIDDEN', message: error instanceof Error ? error.message : 'Station is outside your account scope.' })
    return
  }
  if (session.role === 'supervisor' && !station) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Supervisor account has no assigned station.' })
    return
  }
  const conditions = ['p.active = 1']
  const params: Record<string, string> = {}
  if (station) {
    conditions.push('p.stationId = @stationId')
    params.stationId = station.id
  } else if (session.role === 'headoffice') {
    conditions.push('p.companyId = @companyId')
    params.companyId = session.companyId ?? ''
  } else if (session.role !== 'superadmin' && requestedCompany && requestedCompany !== 'ALL') {
    conditions.push('p.companyId = @requestedCompany')
    params.requestedCompany = requestedCompany
  } else if (session.role === 'superadmin' && requestedCompany && requestedCompany !== 'ALL') {
    conditions.push('p.companyId = @requestedCompany')
    params.requestedCompany = requestedCompany
  }
  let rows = db.prepare(`SELECT p.* FROM pumps p WHERE ${conditions.join(' AND ')} ORDER BY p.createdAt ASC, p.name ASC LIMIT 1000`).all(params) as PumpRow[]
  if (rows.length === 0 && station) {
    const now = new Date().toISOString()
    for (let p = 1; p <= 4; p++) {
      const pId = `pump-${station.id}-${p}`
      const pName = `Pump ${p}`
      db.prepare('INSERT OR IGNORE INTO pumps (id, stationId, companyId, name, fuels, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(
        pId, station.id, station.companyId, pName, JSON.stringify(['PMS', 'AGO']), now, now,
      )
    }
    rows = db.prepare(`SELECT p.* FROM pumps p WHERE ${conditions.join(' AND ')} ORDER BY p.createdAt ASC, p.name ASC LIMIT 1000`).all(params) as PumpRow[]
  }
  res.json({
    count: rows.length,
    pumps: rows.map(row => {
      const fuels = parseStoredFuels(row.fuels)
      const nozzles = parseStoredNozzles(row.nozzles, fuels)
      return {
        id: row.id,
        stationId: row.stationId,
        companyId: row.companyId,
        name: row.name,
        fuels,
        nozzles,
        active: Number(row.active) === 1,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    }),
  })
})

pumpsRouter.post('/', authenticate, requireRole('headoffice', 'superadmin', 'supervisor'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  let station: StationRow
  let name: string
  try {
    station = stationForRequest(session, body.stationId ?? session.stationId)!
    name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80) throw new Error('Pump name is invalid.')
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid pump data.' })
    return
  }
  let fuels: string[]
  try {
    fuels = normalizeFuels(body.fuels, station.companyId, companyFuelCodes(station.companyId))
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid pump fuels.' })
    return
  }
  const id = `pump-${newToken()}`
  const now = new Date().toISOString()
  const initialNozzles: PumpNozzle[] = (Array.isArray(body.nozzles) && body.nozzles.length > 0)
    ? body.nozzles.map((nz: any, idx: number) => ({
        id: typeof nz.id === 'string' ? nz.id : `noz-${idx + 1}`,
        nozzleIndex: idx + 1,
        name: typeof nz.name === 'string' && nz.name.trim() ? nz.name.trim() : `Nozzle ${idx + 1} (${fuels[idx] || 'PMS'})`,
        fuelCode: typeof nz.fuelCode === 'string' ? nz.fuelCode.trim().toUpperCase() : (fuels[idx] || 'PMS'),
        active: nz.active !== false,
      }))
    : parseStoredNozzles(null, fuels)
  db.prepare('INSERT INTO pumps (id, stationId, companyId, name, fuels, nozzles, active, createdAt, updatedAt) VALUES (?,?,?,?,?,?,1,?,?)').run(
    id, station.id, station.companyId, name, JSON.stringify(fuels), JSON.stringify(initialNozzles), now, now
  )
  audit(req, 'PUMP_CREATED', id, `Created pump ${name}`, { companyId: station.companyId, stationId: station.id }, now)
  res.status(201).json({ pump: { id, stationId: station.id, companyId: station.companyId, name, fuels, nozzles: initialNozzles, active: true, createdAt: now, updatedAt: now } })
})

pumpsRouter.put('/:id', authenticate, requireRole('headoffice', 'superadmin', 'supervisor'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const existing = db.prepare('SELECT * FROM pumps WHERE id = ?').get(req.params.id) as PumpRow | undefined
  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pump not found.' })
    return
  }
  if (!canAccessPump(session, existing)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot modify this pump.' })
    return
  }
  const station = stationById(existing.stationId)
  if (!station) {
    res.status(409).json({ error: 'INVALID_STATE', message: 'Pump station is inactive.' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  const name = body.name === undefined ? existing.name : typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 80) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Pump name is invalid.' })
    return
  }
  let fuels: string[] = Array.isArray(body.fuels) ? (body.fuels as string[]) : parseStoredFuels(existing.fuels)
  let nozzles = parseStoredNozzles(existing.nozzles, parseStoredFuels(existing.fuels))

  // Custom nozzle name updates or single nozzle operations
  const rename = (body.updateNozzle ?? body.renameNozzle) as { oldName?: unknown; newName?: unknown; name?: unknown; fuelCode?: unknown; index?: unknown } | undefined
  if (rename) {
    fuels = [...fuels]
    const targetIndex = typeof rename.index === 'number' ? rename.index : -1
    const newName = typeof rename.newName === 'string' ? rename.newName.trim() : typeof rename.name === 'string' ? rename.name.trim() : ''
    const fuelCode = typeof rename.fuelCode === 'string' ? rename.fuelCode.trim().toUpperCase() : ''

    if (targetIndex >= 0 && targetIndex < nozzles.length) {
      if (newName) nozzles[targetIndex].name = newName
      if (fuelCode) {
        nozzles[targetIndex].fuelCode = fuelCode
        fuels[targetIndex] = fuelCode
      }
    } else if (rename.oldName) {
      const oldFuel = String(rename.oldName).trim().toUpperCase()
      const idx = nozzles.findIndex(n => n.fuelCode.toUpperCase() === oldFuel || n.name.toUpperCase() === oldFuel)
      if (idx !== -1) {
        if (newName) nozzles[idx].name = newName
        if (fuelCode) {
          nozzles[idx].fuelCode = fuelCode
          fuels[idx] = fuelCode
        }
      }
    }
  }

  if (body.nozzles !== undefined && Array.isArray(body.nozzles)) {
    nozzles = body.nozzles.map((nz: any, idx: number) => ({
      id: typeof nz.id === 'string' ? nz.id : `noz-${idx + 1}`,
      nozzleIndex: idx + 1,
      name: typeof nz.name === 'string' && nz.name.trim() ? nz.name.trim() : `Nozzle ${idx + 1}`,
      fuelCode: typeof nz.fuelCode === 'string' ? nz.fuelCode.trim().toUpperCase() : 'PMS',
      active: nz.active !== false,
    }))
    fuels = nozzles.map(n => n.fuelCode)
  }

  if (body.deleteNozzleIndex !== undefined && typeof body.deleteNozzleIndex === 'number') {
    const idx = body.deleteNozzleIndex
    if (idx >= 0 && idx < nozzles.length) {
      nozzles.splice(idx, 1)
      nozzles.forEach((n, i) => { n.nozzleIndex = i + 1 })
      if (Array.isArray(fuels) && idx < fuels.length) fuels.splice(idx, 1)
    }
  } else if (body.deleteNozzle !== undefined) {
    const deleted = typeof body.deleteNozzle === 'string' ? body.deleteNozzle.trim().toUpperCase() : ''
    const idx = nozzles.findIndex(n => n.fuelCode.toUpperCase() === deleted || n.name.toUpperCase() === deleted)
    if (idx !== -1) {
      nozzles.splice(idx, 1)
      nozzles.forEach((n, i) => { n.nozzleIndex = i + 1 })
      if (Array.isArray(fuels) && idx < fuels.length) fuels.splice(idx, 1)
    }
  }

  if (body.addNozzle !== undefined) {
    let addFuel = 'PMS'
    let addName = ''
    if (typeof body.addNozzle === 'string') {
      addFuel = body.addNozzle.trim().toUpperCase()
    } else if (typeof body.addNozzle === 'object' && body.addNozzle !== null) {
      const obj = body.addNozzle as { name?: string; fuelCode?: string }
      if (obj.fuelCode) addFuel = obj.fuelCode.trim().toUpperCase()
      if (obj.name) addName = obj.name.trim()
    }
    const nextIdx = nozzles.length + 1
    const finalName = addName || `Side ${nextIdx} (${addFuel})`
    nozzles.push({
      id: `noz-${newToken().slice(0, 8)}`,
      nozzleIndex: nextIdx,
      name: finalName,
      fuelCode: addFuel,
      active: true,
    })
    if (!Array.isArray(fuels)) fuels = []
    fuels.push(addFuel)
  }

  let normalized: string[]
  try {
    normalized = normalizeFuels(fuels, station.companyId)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid pump fuels.' })
    return
  }
  const active = body.active === undefined ? existing.active : body.active ? 1 : 0
  const now = new Date().toISOString()
  db.prepare('UPDATE pumps SET name = ?, fuels = ?, nozzles = ?, active = ?, updatedAt = ? WHERE id = ?').run(
    name, JSON.stringify(normalized), JSON.stringify(nozzles), active, now, existing.id
  )
  audit(req, 'PUMP_UPDATED', existing.id, `Updated pump ${name} with ${nozzles.length} nozzles`, { companyId: station.companyId, stationId: station.id }, now)
  res.json({ success: true, pump: { id: existing.id, stationId: existing.stationId, companyId: existing.companyId, name, fuels: normalized, nozzles, active: Boolean(active), updatedAt: now } })
})

pumpsRouter.delete('/:id', authenticate, requireRole('headoffice', 'superadmin', 'supervisor'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const existing = db.prepare('SELECT * FROM pumps WHERE id = ?').get(req.params.id) as PumpRow | undefined
  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pump not found.' })
    return
  }
  if (!canAccessPump(session, existing)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot delete this pump.' })
    return
  }
  const now = new Date().toISOString()
  db.prepare('UPDATE pumps SET active = 0, updatedAt = ? WHERE id = ?').run(now, existing.id)
  audit(req, 'PUMP_DELETED', existing.id, `Deactivated pump ${existing.name}`, { companyId: existing.companyId, stationId: existing.stationId }, now)
  res.json({ success: true, message: 'Pump removed successfully.' })
})

pumpsRouter.delete('/:id/nozzles/:fuelCode', authenticate, requireRole('headoffice', 'superadmin', 'supervisor'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const existing = db.prepare('SELECT * FROM pumps WHERE id = ?').get(req.params.id) as PumpRow | undefined
  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pump not found.' })
    return
  }
  if (!canAccessPump(session, existing)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot modify this pump.' })
    return
  }
  const station = stationById(existing.stationId)
  if (!station) {
    res.status(409).json({ error: 'INVALID_STATE', message: 'Pump station is inactive.' })
    return
  }
  const fuelCode = decodeURIComponent(req.params.fuelCode).trim().toUpperCase()
  if (!/^[A-Z0-9_-]{1,20}$/.test(fuelCode)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid fuel code.' })
    return
  }
  const targetIndex = req.query.index !== undefined ? Number(req.query.index) : -1
  const fuels = parseStoredFuels(existing.fuels)
  let storedNozzles = parseStoredNozzles(existing.nozzles, fuels)
  if (targetIndex >= 0 && targetIndex < fuels.length) {
    fuels.splice(targetIndex, 1)
    storedNozzles = storedNozzles.filter(n => n.nozzleIndex !== targetIndex + 1)
  } else {
    const idx = fuels.findIndex(fuel => fuel.toUpperCase() === fuelCode)
    if (idx !== -1) {
      fuels.splice(idx, 1)
      storedNozzles = storedNozzles.filter(n => n.nozzleIndex !== idx + 1)
    }
  }
  // Re-index nozzle indices
  storedNozzles = storedNozzles.map((n, i) => ({
    ...n,
    nozzleIndex: i + 1,
  }))
  const now = new Date().toISOString()
  db.prepare('UPDATE pumps SET fuels = ?, nozzles = ?, updatedAt = ? WHERE id = ?').run(
    JSON.stringify(fuels),
    JSON.stringify(storedNozzles),
    now,
    existing.id,
  )
  audit(req, 'PUMP_NOZZLE_REMOVED', existing.id, `Removed nozzle ${fuelCode}`, { companyId: station.companyId, stationId: station.id }, now)
  res.json({ success: true, pumpId: existing.id, fuels, nozzles: storedNozzles })
})
