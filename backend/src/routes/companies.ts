import { Router } from 'express'
import { db } from '../db'
import { hashPin, newToken, validateNewSecret } from '../auth'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const companiesRouter = Router()

interface CompanyRow extends Record<string, unknown> {
  id: string
  name: string
  shortCode: string
  active: number
}

interface StationRow extends Record<string, unknown> {
  id: string
  companyId: string
  name: string
  code: string
  location: string
  region: string
  pumpsCount: number
  active: number
}

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function publicCompany(row: CompanyRow) {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.shortCode,
    tagline: row.tagline ?? '',
    logoText: row.logoText ?? '',
    primaryColor: row.primaryColor ?? '#F97316',
    primaryDark: row.primaryDark ?? '#EA580C',
    accentColor: row.accentColor ?? '#FBBF24',
    currency: row.currency ?? 'GHS',
    active: Number(row.active) === 1,
    createdAt: row.createdAt,
  }
}

function publicStation(row: StationRow & { companyName?: string; companyShortCode?: string }) {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    code: row.code,
    location: row.location,
    region: row.region,
    pumpsCount: Number(row.pumpsCount) || 0,
    active: Number(row.active) === 1,
    companyName: row.companyName,
    companyShortCode: row.companyShortCode,
  }
}

function stationById(companyId: string, stationId: string): StationRow | undefined {
  return db.prepare('SELECT * FROM companyStations WHERE id = ? AND companyId = ?').get(stationId, companyId) as StationRow | undefined
}

function canAccessCompany(session: SessionClaims, companyId: string): boolean {
  return session.role === 'superadmin' || (session.role === 'headoffice' && session.companyId === companyId)
}

function validShortCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  // Minimum two characters. Staff codes are built as `<shortCode><nnn><A|M>` and
  // are resolved by prefix, so a one-character code is ambiguous with any other
  // tenant whose code starts with the same character.
  if (!/^[A-Z0-9]{2,10}$/.test(code) || ['ALL', 'GLOBAL', 'SUPER-ADMIN'].includes(code)) throw new Error('Invalid company shortCode.')
  return code
}

function validStationCode(value: unknown, fallback: string): string {
  const code = typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : fallback
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) throw new Error('Invalid station code.')
  return code
}

function validPumpsCount(value: unknown, fallback = 4): number {
  const count = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(count) || count < 0 || count > 32) throw new Error('pumpsCount must be between 0 and 32.')
  return count
}

function audit(req: AuthRequest, action: string, targetId: string, description: string, notes: string | null, meta: Record<string, unknown> | null, now: string): void {
  const session = sessionOf(req)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), action, session.userId, session.fullName, session.role.toUpperCase(), targetId, description, notes, now, meta ? JSON.stringify(meta) : null,
  )
}

companiesRouter.post('/', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  let name: string
  let code: string
  let pin: string
  try {
    name = typeof body.name === 'string' ? body.name.trim() : ''
    code = validShortCode(body.shortCode)
    pin = typeof body.adminPin === 'string' ? body.adminPin.trim() : ''
    if (!name || name.length > 120) throw new Error('Company name is invalid.')
    validateNewSecret(pin, 'adminPin')
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid company data.' })
    return
  }
  if (db.prepare('SELECT 1 FROM companies WHERE shortCode = ? COLLATE NOCASE').get(code)) {
    res.status(409).json({ error: 'CONFLICT', message: 'A company with that shortCode already exists.' })
    return
  }
  const initialStations = Array.isArray(body.initialStations) ? body.initialStations.slice(0, 50) : []
  const now = new Date().toISOString()
  const id = `comp-${code.toLowerCase()}`
  const createdStations: Array<{ id: string; name: string; code: string; location: string; region: string; pumpsCount: number }> = []
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO companies (id, name, shortCode, tagline, logoText, primaryColor, primaryDark, accentColor, currency, phone, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)').run(
        id, name, code, typeof body.tagline === 'string' ? body.tagline.trim().slice(0, 200) : '', name.charAt(0), '#F97316', '#EA580C', '#FBBF24', 'GHS', typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : null, now,
      )
      initialStations.forEach((value, index) => {
        const station = (value ?? {}) as Record<string, unknown>
        const stationName = typeof station.name === 'string' ? station.name.trim() : ''
        if (!stationName) return
        const stationCode = validStationCode(station.code, `${code}-${String(index + 1).padStart(2, '0')}`)
        const stationId = `stn-${code.toLowerCase()}-${stationCode.toLowerCase()}`
        const location = typeof station.location === 'string' && station.location.trim() ? station.location.trim().slice(0, 120) : 'Forecourt'
        const region = typeof station.region === 'string' && station.region.trim() ? station.region.trim().slice(0, 120) : 'Greater Accra'
        const pumpsCount = validPumpsCount(station.pumpsCount)
        db.prepare('INSERT INTO companyStations (id, companyId, name, code, location, region, pumpsCount, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)').run(stationId, id, stationName, stationCode, location, region, pumpsCount, now)
        for (let p = 1; p <= pumpsCount; p++) {
          const pumpId = `pump-${stationId}-${p}`
          const pumpName = `Pump ${p}`
          db.prepare('INSERT OR IGNORE INTO pumps (id, stationId, companyId, name, fuels, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(
            pumpId, stationId, id, pumpName, JSON.stringify(['PMS', 'AGO']), now, now,
          )
        }
        createdStations.push({ id: stationId, name: stationName, code: stationCode, location, region, pumpsCount })
      })
      const adminCode = `${code}-HQ01`
      const adminId = `sup-${adminCode.toLowerCase()}`
      const { salt, hash } = hashPin(pin)
      const adminName = typeof body.adminFullName === 'string' && body.adminFullName.trim() ? body.adminFullName.trim().slice(0, 120) : `${name} HQ Admin`
      db.prepare(`INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode, phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, 0, 'APPROVED', ?, ?, 1, 0, NULL, ?)`).run(
        adminId, adminCode, adminName, salt, hash, id, code, typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : null, now, now, now,
      )
      audit(req, 'COMPANY_CREATED', id, `${name} (${code})`, `Admin: ${adminCode}, Stations: ${createdStations.length}`, { companyId: id, stationIds: createdStations.map(station => station.id) }, now)
    })()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Company could not be created.'
    const conflict = message.includes('UNIQUE') || message.includes('constraint')
    res.status(conflict ? 409 : 400).json({ error: conflict ? 'CONFLICT' : 'BAD_REQUEST', message: conflict ? 'A company or station with that code already exists.' : message })
    return
  }
  res.status(201).json({ company: { id, name, shortCode: code, active: true }, admin: { id: `sup-${code.toLowerCase()}-hq01`, employeeCode: `${code}-HQ01`, fullName: typeof body.adminFullName === 'string' ? body.adminFullName.trim() : `${name} HQ Admin` }, stations: createdStations })
})

/**
 * Public tenant directory, used by the pre-login staff-registration form to
 * populate its OMC and station pickers.
 *
 * This is deliberately narrow: identifiers and display names only. The full
 * company and station objects are not needed before authentication, and
 * serving them here would hand an unauthenticated caller the complete tenant
 * and station map — the reconnaissance step for a PIN brute force.
 */
companiesRouter.get('/directory/omcs', (_req, res) => {
  const rows = db.prepare('SELECT id, name, shortCode FROM companies WHERE active = 1 ORDER BY name LIMIT 1000').all() as Array<{ id: string; name: string; shortCode: string }>
  res.json(rows)
})

/** Stations of one tenant, for the same pre-login registration form. */
companiesRouter.get('/directory/omcs/:id/stations', (req, res) => {
  const rows = db.prepare(`
    SELECT cs.id, cs.name, cs.location, cs.region
    FROM companyStations cs
    JOIN companies c ON c.id = cs.companyId
    WHERE cs.companyId = ? AND cs.active = 1 AND c.active = 1
    ORDER BY cs.name LIMIT 1000
  `).all(req.params.id) as Array<{ id: string; name: string; location: string | null; region: string | null }>
  res.json(rows)
})

companiesRouter.get('/all/stations', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const requestedCompany = typeof req.query.companyId === 'string' ? req.query.companyId : null
  const companyId = session.role === 'superadmin' ? requestedCompany : session.companyId
  if (!companyId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'A company scope is required.' })
    return
  }
  const rows = db.prepare(`SELECT cs.id, cs.companyId, cs.name, cs.code, cs.location, cs.region, cs.pumpsCount, cs.active, c.name AS companyName, c.shortCode AS companyShortCode FROM companyStations cs JOIN companies c ON c.id = cs.companyId WHERE cs.companyId = ? AND cs.active = 1 AND c.active = 1 ORDER BY cs.name LIMIT 1000`).all(companyId) as Array<StationRow & { companyName: string; companyShortCode: string }>
  res.json(rows.map(publicStation))
})

companiesRouter.get('/', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const rows = session.role === 'superadmin'
    ? db.prepare('SELECT * FROM companies WHERE active = 1 ORDER BY name LIMIT 1000').all() as CompanyRow[]
    : db.prepare('SELECT * FROM companies WHERE active = 1 AND id = ? ORDER BY name LIMIT 1000').all(session.companyId) as CompanyRow[]
  res.json(rows.map(publicCompany))
})

companiesRouter.get('/:id/stations', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  if (session.role !== 'superadmin' && req.params.id !== session.companyId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'This company is outside your account scope.' })
    return
  }
  const stations = db.prepare(`SELECT cs.*, c.name AS companyName, c.shortCode AS companyShortCode FROM companyStations cs JOIN companies c ON c.id = cs.companyId WHERE cs.companyId = ? AND cs.active = 1 AND c.active = 1 ORDER BY cs.name LIMIT 1000`).all(req.params.id) as Array<StationRow & { companyName: string; companyShortCode: string }>
  res.json(stations.map(publicStation))
})

companiesRouter.get('/:id/staff', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  if (!canAccessCompany(session, req.params.id)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot view this company staff.' })
    return
  }
  const company = db.prepare('SELECT id, shortCode FROM companies WHERE id = ?').get(req.params.id) as { id: string; shortCode: string } | undefined
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const supervisors = db.prepare(`SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, createdAt FROM supervisors WHERE companyId = ? AND isSuperAdmin = 0 AND UPPER(employeeCode) != 'SUPER-ADMIN' ORDER BY employeeCode LIMIT 2000`).all(company.id) as Array<Record<string, unknown>>
  const attendants = db.prepare(`SELECT id, employeeCode, fullName, phone, pumpId, stationId, companyId, companyShortCode, approvalStatus, approvedAt, approvedBy, active, createdAt FROM attendants WHERE companyId = ? ORDER BY employeeCode LIMIT 2000`).all(company.id) as Array<Record<string, unknown>>
  res.json({ supervisors: supervisors.map(row => ({ ...row, role: Number(row.isHeadOffice) === 1 ? 'headoffice' : 'supervisor' })), attendants: attendants.map(row => ({ ...row, role: 'attendant' })), total: supervisors.length + attendants.length })
})

companiesRouter.get('/:id', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  if (!canAccessCompany(session, req.params.id)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot view this company.' })
    return
  }
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id) as CompanyRow | undefined
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const stations = db.prepare('SELECT * FROM companyStations WHERE companyId = ? AND active = 1 ORDER BY name LIMIT 1000').all(req.params.id) as StationRow[]
  res.json({ company: publicCompany(company), stations: stations.map(publicStation) })
})

companiesRouter.post('/:id/stations', authenticate, requireRole('superadmin', 'headoffice'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  if (!canAccessCompany(session, req.params.id)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only manage your own company.' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  let name: string
  let code: string
  let location: string
  let region: string
  let pumpsCount: number
  try {
    name = typeof body.name === 'string' ? body.name.trim() : ''
    code = validStationCode(body.code, '')
    location = typeof body.location === 'string' ? body.location.trim() : ''
    region = typeof body.region === 'string' ? body.region.trim() : ''
    pumpsCount = validPumpsCount(body.pumpsCount)
    if (!name || name.length > 120 || !code || !location || !region) throw new Error('name, code, location and region are required.')
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid station data.' })
    return
  }
  const company = db.prepare('SELECT id, shortCode FROM companies WHERE id = ? AND active = 1').get(req.params.id) as { id: string; shortCode: string } | undefined
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const stationId = `stn-${company.shortCode.toLowerCase()}-${code.toLowerCase()}`
  if (db.prepare('SELECT 1 FROM companyStations WHERE id = ? OR (companyId = ? AND code = ? COLLATE NOCASE)').get(stationId, company.id, code)) {
    res.status(409).json({ error: 'CONFLICT', message: 'A station with that code already exists.' })
    return
  }
  const now = new Date().toISOString()
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO companyStations (id, companyId, name, code, location, region, pumpsCount, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)').run(stationId, company.id, name, code, location, region, pumpsCount, now)
      for (let p = 1; p <= pumpsCount; p++) {
        const pumpId = `pump-${stationId}-${p}`
        const pumpName = `Pump ${p}`
        db.prepare('INSERT OR IGNORE INTO pumps (id, stationId, companyId, name, fuels, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(
          pumpId, stationId, company.id, pumpName, JSON.stringify(['PMS', 'AGO']), now, now,
        )
      }
    })()
  } catch {
    res.status(409).json({ error: 'CONFLICT', message: 'A station with that code already exists.' })
    return
  }
  audit(req, 'STATION_CREATED', stationId, `${name} (${code})`, null, { companyId: company.id, stationId }, now)
  res.status(201).json({ id: stationId, companyId: company.id, name, code, location, region, pumpsCount, active: true })
})

companiesRouter.delete('/:id/stations/:stationId', authenticate, requireRole('superadmin', 'headoffice'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  if (!canAccessCompany(session, req.params.id)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only manage your own company.' })
    return
  }
  const station = stationById(req.params.id, req.params.stationId)
  if (!station) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Station not found.' })
    return
  }
  const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare('UPDATE companyStations SET active = 0 WHERE id = ? AND companyId = ?').run(station.id, req.params.id)
    db.prepare('DELETE FROM sessions WHERE stationId = ?').run(station.id)
    db.prepare('UPDATE attendants SET active = 0 WHERE stationId = ?').run(station.id)
    db.prepare('UPDATE supervisors SET active = 0 WHERE stationId = ?').run(station.id)
    audit(req, 'STATION_DEACTIVATED', station.id, `${station.name} (${station.code})`, null, { companyId: req.params.id, stationId: station.id }, now)
  })()
  res.json({ success: true, message: 'Station deleted.' })
})

companiesRouter.put('/:id/stations/:stationId', authenticate, requireRole('superadmin', 'headoffice'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  if (!canAccessCompany(session, req.params.id)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only manage your own company.' })
    return
  }
  const station = stationById(req.params.id, req.params.stationId)
  if (!station) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Station not found.' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  const updates: string[] = []
  const params: unknown[] = []
  try {
    if (body.name !== undefined) { const name = typeof body.name === 'string' ? body.name.trim() : ''; if (!name || name.length > 120) throw new Error('Invalid station name.'); updates.push('name = ?'); params.push(name) }
    if (body.code !== undefined) { const code = validStationCode(body.code, ''); if (code !== station.code && db.prepare('SELECT 1 FROM companyStations WHERE companyId = ? AND code = ? COLLATE NOCASE AND id != ?').get(req.params.id, code, station.id)) throw new Error('Station code already exists.'); updates.push('code = ?'); params.push(code) }
    if (body.location !== undefined) { const location = typeof body.location === 'string' ? body.location.trim() : ''; if (!location || location.length > 120) throw new Error('Invalid station location.'); updates.push('location = ?'); params.push(location) }
    if (body.region !== undefined) { const region = typeof body.region === 'string' ? body.region.trim() : ''; if (!region || region.length > 120) throw new Error('Invalid station region.'); updates.push('region = ?'); params.push(region) }
    if (body.pumpsCount !== undefined) { updates.push('pumpsCount = ?'); params.push(validPumpsCount(body.pumpsCount)) }
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid station update.' })
    return
  }
  if (updates.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update.' })
    return
  }
  params.push(req.params.id, station.id)
  const now = new Date().toISOString()
  db.prepare(`UPDATE companyStations SET ${updates.join(', ')} WHERE companyId = ? AND id = ?`).run(...params)
  audit(req, 'STATION_UPDATED', station.id, `Updated station ${station.name}`, null, { companyId: req.params.id, stationId: station.id }, now)
  res.json(db.prepare('SELECT * FROM companyStations WHERE id = ?').get(station.id))
})

companiesRouter.put('/:id', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(req.params.id)
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const updates: string[] = []
  const params: unknown[] = []
  if (body.name !== undefined) { const name = typeof body.name === 'string' ? body.name.trim() : ''; if (!name || name.length > 120) { res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid company name.' }); return } updates.push('name = ?'); params.push(name) }
  if (body.tagline !== undefined) { updates.push('tagline = ?'); params.push(typeof body.tagline === 'string' ? body.tagline.trim().slice(0, 200) : '') }
  if (body.phone !== undefined) { updates.push('phone = ?'); params.push(typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : null) }
  if (body.primaryColor !== undefined) { const color = typeof body.primaryColor === 'string' ? body.primaryColor.trim() : ''; if (!/^#[0-9A-Fa-f]{6}$/.test(color)) { res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid primaryColor.' }); return } updates.push('primaryColor = ?'); params.push(color) }
  if (updates.length === 0) { res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update.' }); return }
  params.push(req.params.id)
  db.prepare(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  res.json({ success: true })
})

companiesRouter.post('/:id/deactivate', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT id, name, shortCode FROM companies WHERE id = ? AND active = 1').get(req.params.id) as { id: string; name: string; shortCode: string } | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found or already inactive.' })
    return
  }
  const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare('UPDATE companies SET active = 0 WHERE id = ?').run(row.id)
    db.prepare('UPDATE companyStations SET active = 0 WHERE companyId = ?').run(row.id)
    db.prepare('UPDATE supervisors SET active = 0, approvalStatus = ? WHERE companyId = ?').run('REJECTED', row.id)
    db.prepare('UPDATE attendants SET active = 0, approvalStatus = ? WHERE companyId = ?').run('REJECTED', row.id)
    db.prepare('DELETE FROM sessions WHERE companyId = ?').run(row.id)
    audit(req, 'COMPANY_DEACTIVATED', row.id, `${row.name} (${row.shortCode})`, null, { companyId: row.id }, now)
  })()
  res.json({ id: row.id, active: false })
})

companiesRouter.delete('/:id', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT id, name, shortCode FROM companies WHERE id = ?').get(req.params.id) as { id: string; name: string; shortCode: string } | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const now = new Date().toISOString()
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM syncQueue WHERE entityId IN (SELECT id FROM shifts WHERE companyId = ?)').run(row.id)
      db.prepare('DELETE FROM receipts WHERE shiftId IN (SELECT id FROM shifts WHERE companyId = ?)').run(row.id)
      db.prepare('DELETE FROM transactions WHERE shiftId IN (SELECT id FROM shifts WHERE companyId = ?)').run(row.id)
      db.prepare('DELETE FROM shifts WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM tankReadings WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM station_expenses WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM pumps WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM products WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM companyStations WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM supervisors WHERE companyId = ? AND isSuperAdmin = 0').run(row.id)
      db.prepare('DELETE FROM attendants WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM sessions WHERE companyId = ?').run(row.id)
      db.prepare('DELETE FROM companies WHERE id = ?').run(row.id)
      audit(req, 'COMPANY_DELETED', row.id, `${row.name} (${row.shortCode})`, 'Permanently deleted company from system', { companyId: row.id }, now)
    })()
  } catch (error) {
    res.status(409).json({ error: 'CONFLICT', message: error instanceof Error ? error.message : 'Company could not be deleted.' })
    return
  }
  res.json({ success: true, message: `Company ${row.name} (${row.shortCode}) deleted successfully.` })
})
