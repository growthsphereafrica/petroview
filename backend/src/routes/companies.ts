import { Router } from 'express'
import { db } from '../db'
import { hashPin, newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest } from '../middleware'

export const companiesRouter = Router()

// --- SUPER-ADMIN: create company (OMC) ---
companiesRouter.post('/', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const { name, shortCode, tagline, phone, adminFullName, adminPin, initialStations } = (req.body ?? {}) as {
    name?: string
    shortCode?: string
    tagline?: string
    phone?: string
    adminFullName?: string
    adminPin?: string
    initialStations?: Array<{
      name: string
      code?: string
      location?: string
      region?: string
      pumpsCount?: number
    }>
  }

  const code = String(shortCode ?? '').trim().toUpperCase()
  if (!name?.trim() || !code || code.length > 10) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Company name and shortCode (max 10 chars) are required.' })
    return
  }
  if (db.prepare('SELECT 1 FROM companies WHERE shortCode = ?').get(code)) {
    res.status(409).json({ error: 'CONFLICT', message: 'A company with that shortCode already exists.' })
    return
  }

  const now = new Date().toISOString()
  const id = `comp-${code.toLowerCase()}`
  db.prepare(
    `INSERT INTO companies (id, name, shortCode, tagline, logoText, primaryColor, primaryDark, accentColor, currency, phone, active, createdAt)
     VALUES (?, ?, ?, ?, ?, '#F97316', '#EA580C', '#FBBF24', 'GHS', ?, 1, ?)`,
  ).run(id, name.trim(), code, tagline ?? '', name.trim().charAt(0), phone ?? null, now)

  // Insert initial stations if provided
  const createdStations: Array<{ id: string; name: string; code: string; location: string; region: string; pumpsCount: number }> = []
  if (Array.isArray(initialStations) && initialStations.length > 0) {
    for (let i = 0; i < initialStations.length; i++) {
      const st = initialStations[i]
      if (st && st.name?.trim()) {
        const stCode = (st.code?.trim() || `${code}-${String(i + 1).padStart(2, '0')}`).toUpperCase()
        const stId = `stn-${code.toLowerCase()}-${stCode.toLowerCase()}`
        const stLoc = st.location?.trim() || 'Forecourt'
        const stReg = st.region?.trim() || 'Greater Accra'
        const stPumps = Number(st.pumpsCount) || 4
        db.prepare(
          'INSERT OR REPLACE INTO companyStations (id, companyId, name, code, location, region, pumpsCount, createdAt) VALUES (?,?,?,?,?,?,?,?)',
        ).run(stId, id, st.name.trim(), stCode, stLoc, stReg, stPumps, now)
        createdStations.push({ id: stId, name: st.name.trim(), code: stCode, location: stLoc, region: stReg, pumpsCount: stPumps })
      }
    }
  }

  // Create HQ admin for this company
  const adminCode = `${code}-HQ01`
  const pin = adminPin || '9999'
  const { salt, hash } = hashPin(pin)
  const adminId = `sup-${adminCode.toLowerCase()}`
  let resolvedAdminName = adminFullName?.trim()
  if (!resolvedAdminName || resolvedAdminName.toUpperCase() === 'SUPER-ADMIN' || resolvedAdminName.toUpperCase().includes('SUPER')) {
    resolvedAdminName = `${name.trim()} HQ Admin`
  }
  db.prepare(
    `INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode,
     phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, 0, 'APPROVED', ?, 'SYSTEM', 1, 0, NULL, ?)`,
  ).run(adminId, adminCode, resolvedAdminName, salt, hash, id, code, phone ?? null, now, now)

  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), 'COMPANY_CREATED', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERADMIN', id, `${name.trim()} (${code})`, `Admin: ${adminCode}, Stations: ${createdStations.length}`, now, null)

  res.status(201).json({
    company: { id, name: name.trim(), shortCode: code, active: true },
    admin: { id: adminId, employeeCode: adminCode, pin, fullName: resolvedAdminName },
    stations: createdStations,
  })
})

// --- List all active stations across companies (open for registration & dropdowns) ---
companiesRouter.get('/all/stations', (req, res) => {
  const rows = db.prepare(
    `SELECT cs.*, c.name as companyName, c.shortCode as companyShortCode
     FROM companyStations cs
     JOIN companies c ON cs.companyId = c.id
     WHERE cs.active = 1 AND c.active = 1
     ORDER BY cs.name`,
  ).all()
  res.json(rows)
})

// --- List companies (open for registration & dashboards) ---
companiesRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM companies WHERE active = 1 ORDER BY name').all()
  res.json(rows)
})

companiesRouter.get('/list', (req, res) => {
  const rows = db.prepare('SELECT * FROM companies WHERE active = 1 ORDER BY name').all()
  res.json({ count: rows.length, companies: rows })
})

// --- Get stations for a specific company (open for registration) ---
companiesRouter.get('/:id/stations', (req, res) => {
  const stations = db.prepare('SELECT * FROM companyStations WHERE companyId = ? AND active = 1 ORDER BY name').all(req.params.id)
  res.json(stations)
})

// --- Get all staff for a specific company (Super Admin or OMC HQ) ---
companiesRouter.get('/:id/staff', authenticate, (req: AuthRequest, res) => {
  const company = db.prepare('SELECT id, shortCode FROM companies WHERE id = ?').get(req.params.id) as
    | { id: string; shortCode: string }
    | undefined
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const sups = db.prepare(`
    SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, createdAt
    FROM supervisors
    WHERE isSuperAdmin = 0
      AND UPPER(employeeCode) != 'SUPER-ADMIN'
      AND (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
    ORDER BY employeeCode
  `).all(company.id, company.shortCode, `${company.shortCode}%`)

  const atts = db.prepare(`
    SELECT id, employeeCode, fullName, phone, pumpId, stationId, companyId, companyShortCode, approvalStatus, approvedAt, approvedBy, active, createdAt
    FROM attendants
    WHERE (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
    ORDER BY employeeCode
  `).all(company.id, company.shortCode, `${company.shortCode}%`)

  res.json({
    supervisors: sups.map((r: any) => {
      let fullName = r.fullName as string
      const isHQ = !!r.isHeadOffice || (typeof r.employeeCode === 'string' && r.employeeCode.includes('HQ'))
      if (isHQ && (!fullName || fullName.toUpperCase() === 'SUPER-ADMIN' || fullName.toUpperCase().includes('SUPER'))) {
        fullName = `${company.shortCode} HQ Admin`
      }
      return { ...r, fullName, role: isHQ ? 'headoffice' : 'supervisor' }
    }),
    attendants: atts.map((r: any) => ({ ...r, role: 'attendant' })),
    total: sups.length + atts.length,
  })
})

// --- Get company details ---
companiesRouter.get('/:id', authenticate, (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id)
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const stations = db.prepare('SELECT * FROM companyStations WHERE companyId = ? AND active = 1 ORDER BY name').all(req.params.id)
  res.json({ company, stations })
})

// --- Add station to company (Super Admin or OMC HQ Admin) ---
companiesRouter.post('/:id/stations', authenticate, requireRole('superadmin', 'headoffice'), (req: AuthRequest, res) => {
  const { name, code, location, region, pumpsCount } = (req.body ?? {}) as {
    name?: string
    code?: string
    location?: string
    region?: string
    pumpsCount?: number
  }

  // If HQ admin, ensure they can only add stations to their own company
  if (req.session?.role === 'headoffice' && req.session.companyId !== req.params.id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only manage stations for your own OMC.' })
    return
  }

  if (!name?.trim() || !code?.trim() || !location?.trim() || !region?.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'name, code, location, and region are required.' })
    return
  }
  const company = db.prepare('SELECT id, shortCode FROM companies WHERE id = ?').get(req.params.id) as { id: string; shortCode: string } | undefined
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const stationId = `stn-${company.shortCode.toLowerCase()}-${code.trim().toLowerCase()}`
  const now = new Date().toISOString()
  db.prepare(
    'INSERT OR REPLACE INTO companyStations (id, companyId, name, code, location, region, pumpsCount, createdAt) VALUES (?,?,?,?,?,?,?,?)',
  ).run(stationId, company.id, name.trim(), code.trim().toUpperCase(), location.trim(), region.trim(), pumpsCount ?? 4, now)

  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), 'STATION_CREATED', req.session?.userId ?? '', req.session?.fullName ?? '', req.session?.role?.toUpperCase() ?? 'HQ', stationId, `${name.trim()} (${code.trim().toUpperCase()})`, location.trim(), now, null)

  res.status(201).json({ id: stationId, companyId: company.id, name: name.trim(), code: code.trim().toUpperCase(), location: location.trim(), region: region.trim(), pumpsCount: pumpsCount ?? 4 })
})

// --- Delete station branch ---
companiesRouter.delete('/:id/stations/:stationId', authenticate, requireRole('superadmin', 'headoffice'), (req: AuthRequest, res) => {
  if (req.session?.role === 'headoffice' && req.session.companyId !== req.params.id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only manage stations for your own OMC.' })
    return
  }
  db.prepare('UPDATE companyStations SET active = 0 WHERE id = ? AND companyId = ?').run(req.params.stationId, req.params.id)
  res.json({ success: true, message: 'Station deleted.' })
})

// --- SUPER-ADMIN: update company ---
companiesRouter.put('/:id', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const { name, tagline, phone, primaryColor } = (req.body ?? {}) as {
    name?: string
    tagline?: string
    phone?: string
    primaryColor?: string
  }
  const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(req.params.id)
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const updates: string[] = []
  const params: unknown[] = []
  if (name) { updates.push('name = ?'); params.push(name.trim()) }
  if (tagline !== undefined) { updates.push('tagline = ?'); params.push(tagline) }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone) }
  if (primaryColor) { updates.push('primaryColor = ?'); params.push(primaryColor) }
  if (updates.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update.' })
    return
  }
  params.push(req.params.id)
  db.prepare(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  res.json({ success: true })
})

// --- SUPER-ADMIN: deactivate company ---
companiesRouter.post('/:id/deactivate', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT id, name, shortCode FROM companies WHERE id = ? AND active = 1').get(req.params.id) as
    | { id: string; name: string; shortCode: string }
    | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found or already inactive.' })
    return
  }
  const now = new Date().toISOString()
  db.prepare('UPDATE companies SET active = 0 WHERE id = ?').run(row.id)
  db.prepare('UPDATE companyStations SET active = 0 WHERE companyId = ?').run(row.id)
  db.prepare('UPDATE supervisors SET active = 0, approvalStatus = ? WHERE companyId = ?').run('REJECTED', row.id)
  db.prepare('DELETE FROM sessions WHERE companyId = ?').run(row.id)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'COMPANY_DEACTIVATED', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERADMIN',
    row.id, `${row.name} (${row.shortCode})`, null, now, null,
  )
  res.json({ id: row.id, active: false })
})

// --- SUPER-ADMIN: permanently delete company and all associated records ---
companiesRouter.delete('/:id', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const row = db.prepare('SELECT id, name, shortCode FROM companies WHERE id = ? OR shortCode = ? COLLATE NOCASE').get(req.params.id, req.params.id) as
    | { id: string; name: string; shortCode: string }
    | undefined
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const now = new Date().toISOString()
  db.prepare('DELETE FROM companyStations WHERE companyId = ?').run(row.id)
  db.prepare(`
    DELETE FROM supervisors
    WHERE isSuperAdmin = 0
      AND UPPER(employeeCode) != 'SUPER-ADMIN'
      AND (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
  `).run(row.id, row.shortCode, `${row.shortCode}%`)
  db.prepare(`
    DELETE FROM attendants
    WHERE companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?
  `).run(row.id, row.shortCode, `${row.shortCode}%`)
  db.prepare('DELETE FROM sessions WHERE companyId = ?').run(row.id)
  db.prepare('DELETE FROM companies WHERE id = ?').run(row.id)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), 'COMPANY_DELETED', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERADMIN',
    row.id, `${row.name} (${row.shortCode})`, 'Permanently deleted company from system', now, null,
  )
  res.json({ success: true, message: `Company ${row.name} (${row.shortCode}) deleted successfully.` })
})

