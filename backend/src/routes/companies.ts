import { Router } from 'express'
import { db } from '../db'
import { hashPin, newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest } from '../middleware'

export const companiesRouter = Router()

// --- SUPER-ADMIN: create company (OMC) ---
companiesRouter.post('/', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const { name, shortCode, tagline, phone, adminFullName, adminPin } = (req.body ?? {}) as {
    name?: string
    shortCode?: string
    tagline?: string
    phone?: string
    adminFullName?: string
    adminPin?: string
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

  // Create HQ admin for this company
  const adminCode = `${code}-HQ01`
  const pin = adminPin || '9999'
  const { salt, hash } = hashPin(pin)
  const adminId = `sup-${adminCode.toLowerCase()}`
  db.prepare(
    `INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode,
     phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, 0, 'APPROVED', ?, 'SYSTEM', 1, 0, NULL, ?)`,
  ).run(adminId, adminCode, adminFullName || `${name.trim()} HQ Admin`, salt, hash, id, code, phone ?? null, now, now)

  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), 'COMPANY_CREATED', req.session?.userId ?? '', req.session?.fullName ?? '', 'SUPERADMIN', id, `${name.trim()} (${code})`, `Admin: ${adminCode}`, now, null)

  res.status(201).json({
    company: { id, name: name.trim(), shortCode: code, active: true },
    admin: { id: adminId, employeeCode: adminCode, pin, fullName: adminFullName || `${name.trim()} HQ Admin` },
  })
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

// --- Get company details ---
companiesRouter.get('/:id', authenticate, (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id)
  if (!company) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found.' })
    return
  }
  const stations = db.prepare('SELECT * FROM companyStations WHERE companyId = ? ORDER BY name').all(req.params.id)
  res.json({ company, stations })
})

// --- SUPER-ADMIN: add station to company ---
companiesRouter.post('/:id/stations', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const { name, code, location, region, pumpsCount } = (req.body ?? {}) as {
    name?: string
    code?: string
    location?: string
    region?: string
    pumpsCount?: number
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
    'INSERT INTO companyStations (id, companyId, name, code, location, region, pumpsCount, createdAt) VALUES (?,?,?,?,?,?,?,?)',
  ).run(stationId, company.id, name.trim(), code.trim(), location.trim(), region.trim(), pumpsCount ?? 4, now)
  res.status(201).json({ id: stationId, companyId: company.id, name: name.trim(), code: code.trim(), location: location.trim(), region: region.trim(), pumpsCount: pumpsCount ?? 4 })
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
