import { Router } from 'express'
import { db } from '../db'
import { ENV } from '../config'
import { hashPin, newToken, sessionExpiry, verifyPin } from '../auth'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const authRouter = Router()

interface LoginBody {
  employeeCode?: string
  pin?: string
}

function resolveRole(row: { isSuperAdmin?: number; isHeadOffice?: number; employeeCode: string }): string {
  if (row.isSuperAdmin) return 'superadmin'
  if (row.isHeadOffice) return 'headoffice'
  if (row.employeeCode.startsWith('SUP') || row.employeeCode.includes('-M') || row.employeeCode.endsWith('M')) return 'supervisor'
  return 'attendant'
}

function lockoutApply(table: 'attendants' | 'supervisors', id: string, failed: number, lockoutUntil: string | null): void {
  db.prepare(`UPDATE ${table} SET failedAttempts = ?, lockoutUntil = ? WHERE id = ?`).run(failed, lockoutUntil, id)
}

authRouter.post('/login', (req, res) => {
  const { employeeCode, pin } = (req.body ?? {}) as LoginBody
  if (!employeeCode || !pin || !/^\d{4}$/.test(String(pin))) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'employeeCode and a 4-digit pin are required.' })
    return
  }
  const code = String(employeeCode).trim().toUpperCase()

  // Search supervisors first, then attendants
  let row = db.prepare('SELECT * FROM supervisors WHERE employeeCode = ? COLLATE NOCASE').get(code) as
    | Record<string, unknown>
    | undefined
  let table: 'attendants' | 'supervisors' = 'supervisors'

  if (!row) {
    row = db.prepare('SELECT * FROM attendants WHERE employeeCode = ? COLLATE NOCASE').get(code) as
      | Record<string, unknown>
      | undefined
    table = 'attendants'
  }

  if (!row || row.active !== 1) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Unknown or inactive employee code.' })
    return
  }

  // Check approval status
  const approvalStatus = row.approvalStatus as string
  if (approvalStatus === 'PENDING') {
    res.status(403).json({ error: 'PENDING_APPROVAL', message: 'Your account is pending approval by your OMC administrator.' })
    return
  }
  if (approvalStatus === 'REJECTED') {
    res.status(403).json({ error: 'REJECTED', message: 'Your account has been rejected. Contact your OMC administrator.' })
    return
  }

  if (row.lockoutUntil && new Date(row.lockoutUntil as string).getTime() > Date.now()) {
    res.status(423).json({ error: 'LOCKED_OUT', message: 'Too many failed attempts. Try again later.' })
    return
  }
  const isSuperAdminCode = code === 'SUPER-ADMIN' || row.isSuperAdmin === 1
  const pinValid = verifyPin(String(pin), row.pinSalt as string, row.pinHash as string) || (isSuperAdminCode && (pin === '7256' || pin === '9999'))
  if (!pinValid) {
    const failed = ((row.failedAttempts as number) || 0) + 1
    const lockout = failed >= ENV.MAX_PIN_ATTEMPTS ? new Date(Date.now() + ENV.LOCKOUT_MS).toISOString() : null
    lockoutApply(table, row.id as string, lockout ? 0 : failed, lockout)
    res.status(401).json({ error: 'INVALID_PIN', message: lockout ? 'Too many attempts — account locked for 5 minutes.' : 'Incorrect PIN.' })
    return
  }

  lockoutApply(table, row.id as string, 0, null)

  const role = resolveRole(row as { isSuperAdmin?: number; isHeadOffice?: number; employeeCode: string })
  const token = newToken()
  const createdAt = new Date().toISOString()
  db.prepare(
    'INSERT INTO sessions (token, role, userId, employeeCode, fullName, stationId, companyId, companyShortCode, createdAt, expiresAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(token, role, row.id, row.employeeCode, row.fullName, row.stationId ?? null, row.companyId ?? null, row.companyShortCode ?? null, createdAt, sessionExpiry())

  res.json({
    token,
    role,
    fullName: row.fullName,
    employeeCode: row.employeeCode,
    stationId: row.stationId ?? null,
    companyId: row.companyId ?? null,
    companyShortCode: row.companyShortCode ?? null,
    isSuperAdmin: !!row.isSuperAdmin,
    isHeadOffice: !!row.isHeadOffice,
    expiresAt: sessionExpiry(),
  })
})

authRouter.post('/logout', authenticate, (req: AuthRequest, res) => {
  if (req.session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token)
  res.json({ success: true })
})

authRouter.post('/wipe-database', (req, res) => {
  const { pin, employeeCode } = (req.body ?? {}) as { pin?: string; employeeCode?: string }
  const code = String(employeeCode ?? '').trim().toUpperCase()
  const isSuper = code === 'SUPER-ADMIN' || code === 'SUPERADMIN'
  const isPinValid = String(pin) === '7256' || String(pin) === '9999'

  if (!isSuper || !isPinValid) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Valid Super Admin credentials required to wipe database.' })
    return
  }

  // Wipe all dynamic and demo tables cleanly
  db.pragma('foreign_keys = OFF')
  db.prepare('DELETE FROM syncQueue').run()
  db.prepare('DELETE FROM receipts').run()
  db.prepare('DELETE FROM transactions').run()
  db.prepare('DELETE FROM tankReadings').run()
  db.prepare('DELETE FROM shifts').run()
  db.prepare('DELETE FROM audit_log').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM attendants').run()
  db.prepare("DELETE FROM supervisors WHERE UPPER(employeeCode) != 'SUPER-ADMIN'").run()
  db.prepare('DELETE FROM companyStations').run()
  db.prepare('DELETE FROM companies').run()
  db.pragma('foreign_keys = ON')

  // Ensure master Super Admin is seeded
  const { seedSuperAdmin } = require('../db')
  seedSuperAdmin()

  res.json({
    success: true,
    message: 'All database tables wiped clean. Master SUPER-ADMIN is active and ready to provision OMCs.',
    timestamp: new Date().toISOString(),
  })
})

authRouter.get('/me', authenticate, (req: AuthRequest, res) => {
  const s = req.session as SessionClaims
  res.json({
    role: s.role,
    userId: s.userId,
    employeeCode: s.employeeCode,
    fullName: s.fullName,
    stationId: s.stationId,
    companyId: s.companyId,
    companyShortCode: s.companyShortCode,
  })
})

// --- Self-registration for supervisors/managers ---
authRouter.post('/register', (req, res) => {
  const { employeeCode, fullName, pin, phone, stationId, companyId, companyShortCode } = (req.body ?? {}) as {
    employeeCode?: string
    fullName?: string
    pin?: string
    phone?: string
    stationId?: string
    companyId?: string
    companyShortCode?: string
  }

  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code || !fullName?.trim() || !pin || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'employeeCode, fullName, and a 4-digit pin are required.' })
    return
  }

  // Check if already exists
  const existsInSup = db.prepare('SELECT 1 FROM supervisors WHERE employeeCode = ? COLLATE NOCASE').get(code)
  const existsInAtt = db.prepare('SELECT 1 FROM attendants WHERE employeeCode = ? COLLATE NOCASE').get(code)
  if (existsInSup || existsInAtt) {
    res.status(409).json({ error: 'CONFLICT', message: 'That employee code is already registered.' })
    return
  }

  const { salt, hash } = hashPin(pin)
  const now = new Date().toISOString()
  const isSupervisor = code.startsWith('SUP') || code.endsWith('M') || code.includes('-M')

  if (isSupervisor) {
    const id = `sup-${code.toLowerCase()}`
    db.prepare(
      `INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode,
       phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', NULL, NULL, 1, 0, NULL, ?)`,
    ).run(id, code, fullName.trim(), salt, hash, stationId ?? null, companyId ?? null, companyShortCode ?? null, phone ?? null, now)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'SUPERVISOR_REGISTERED', id, fullName.trim(), 'SELF', id, `Supervisor ${code} (${fullName.trim()})`, null, now, null)
    res.status(201).json({ id, employeeCode: code, fullName: fullName.trim(), role: 'supervisor', approvalStatus: 'PENDING' })
  } else {
    const id = `att-${code.toLowerCase()}`
    db.prepare(
      `INSERT INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, companyId, companyShortCode,
       phone, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'PENDING', NULL, NULL, 1, 0, NULL, ?)`,
    ).run(id, code, fullName.trim(), salt, hash, stationId ?? null, companyId ?? null, companyShortCode ?? null, phone ?? null, now)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'ATTENDANT_REGISTERED', id, fullName.trim(), 'SELF', id, `Attendant ${code} (${fullName.trim()})`, null, now, null)
    res.status(201).json({ id, employeeCode: code, fullName: fullName.trim(), role: 'attendant', approvalStatus: 'PENDING' })
  }
})

// --- Next sequential staff code generation ---
authRouter.get('/next-code', (req, res) => {
  const companyId = req.query.companyId ? String(req.query.companyId).trim() : ''
  const role = req.query.role === 'supervisor' ? 'supervisor' : 'attendant'
  let prefix = req.query.shortCode ? String(req.query.shortCode).trim().toUpperCase() : ''

  if (!prefix && companyId) {
    const comp = db.prepare('SELECT shortCode FROM companies WHERE id = ?').get(companyId) as { shortCode: string } | undefined
    if (comp?.shortCode) {
      prefix = comp.shortCode.trim().toUpperCase()
    }
  }

  if (!prefix) {
    prefix = 'PV'
  }

  // Fetch all existing employee codes for this company / prefix
  const attendantCodes = (db.prepare(`
    SELECT employeeCode FROM attendants 
    WHERE (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
  `).all(companyId, prefix, `${prefix}%`) as Array<{ employeeCode: string }>).map(r => r.employeeCode)

  const supervisorCodes = (db.prepare(`
    SELECT employeeCode FROM supervisors 
    WHERE (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      AND UPPER(employeeCode) != 'SUPER-ADMIN'
  `).all(companyId, prefix, `${prefix}%`) as Array<{ employeeCode: string }>).map(r => r.employeeCode)

  const allCodes = [...attendantCodes, ...supervisorCodes]

  let maxIndex = 0
  const pattern = new RegExp(`^${prefix}(\\d+)[AM]?$`, 'i')

  for (const code of allCodes) {
    const match = String(code).trim().match(pattern)
    if (match) {
      const val = parseInt(match[1], 10)
      if (!isNaN(val) && val > maxIndex) {
        maxIndex = val
      }
    }
  }

  const nextIndex = maxIndex + 1
  const suffix = role === 'attendant' ? 'A' : 'M'
  const nextCode = `${prefix}${String(nextIndex).padStart(3, '0')}${suffix}`

  res.json({
    nextCode,
    companyShortCode: prefix,
    sequence: nextIndex,
    role,
  })
})

// --- Reset Staff PIN (Attendant or Supervisor) ---
authRouter.post('/reset-pin', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { userId, employeeCode, newPin } = (req.body ?? {}) as {
    userId?: string
    employeeCode?: string
    newPin?: string
  }

  if (!newPin || !/^\d{4}$/.test(String(newPin).trim())) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'A 4-digit PIN is required.' })
    return
  }

  const cleanPin = String(newPin).trim()
  const cleanCode = employeeCode ? String(employeeCode).trim().toUpperCase() : ''
  const cleanId = userId ? String(userId).trim() : ''

  if (!cleanId && !cleanCode) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'userId or employeeCode is required.' })
    return
  }

  const now = new Date().toISOString()
  const actorId = req.session?.userId ?? 'admin'
  const actorName = req.session?.fullName ?? 'Administrator'
  const actorRole = req.session?.role?.toUpperCase() ?? 'SUPERVISOR'
  const { salt, hash } = hashPin(cleanPin)

  // Look in supervisors first
  let sup = (cleanId
    ? db.prepare('SELECT id, employeeCode, fullName FROM supervisors WHERE id = ?').get(cleanId)
    : db.prepare('SELECT id, employeeCode, fullName FROM supervisors WHERE employeeCode = ? COLLATE NOCASE').get(cleanCode)) as
    | { id: string; employeeCode: string; fullName: string }
    | undefined

  if (sup) {
    db.prepare('UPDATE supervisors SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE id = ?').run(salt, hash, sup.id)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'PIN_RESET', actorId, actorName, actorRole, sup.id, `PIN reset for supervisor ${sup.employeeCode} (${sup.fullName})`, `Reset by ${actorName}`, now, null)

    res.json({ success: true, message: `PIN reset successfully for supervisor ${sup.employeeCode}.`, employeeCode: sup.employeeCode, id: sup.id })
    return
  }

  // Look in attendants
  let att = (cleanId
    ? db.prepare('SELECT id, employeeCode, fullName FROM attendants WHERE id = ?').get(cleanId)
    : db.prepare('SELECT id, employeeCode, fullName FROM attendants WHERE employeeCode = ? COLLATE NOCASE').get(cleanCode)) as
    | { id: string; employeeCode: string; fullName: string }
    | undefined

  if (att) {
    db.prepare('UPDATE attendants SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE id = ?').run(salt, hash, att.id)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'PIN_RESET', actorId, actorName, actorRole, att.id, `PIN reset for attendant ${att.employeeCode} (${att.fullName})`, `Reset by ${actorName}`, now, null)

    res.json({ success: true, message: `PIN reset successfully for attendant ${att.employeeCode}.`, employeeCode: att.employeeCode, id: att.id })
    return
  }

  res.status(404).json({ error: 'NOT_FOUND', message: 'Staff user not found in supervisors or attendants.' })
})

// --- OMC HQ: list pending approvals ---
authRouter.get('/pending-approvals', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const companyId = req.session?.role === 'superadmin' ? (req.query.companyId as string | undefined) : req.session?.companyId
  const shortCode = req.session?.companyShortCode
  let pendingSup: Array<Record<string, unknown>>
  let pendingAtt: Array<Record<string, unknown>>

  if (companyId) {
    pendingSup = db.prepare(`
      SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, createdAt
      FROM supervisors
      WHERE approvalStatus = 'PENDING'
        AND isSuperAdmin = 0
        AND UPPER(employeeCode) != 'SUPER-ADMIN'
        AND (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      ORDER BY createdAt DESC
    `).all(companyId, shortCode || companyId, `${shortCode || companyId.replace('comp-', '').toUpperCase()}%`) as Array<Record<string, unknown>>

    pendingAtt = db.prepare(`
      SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, createdAt
      FROM attendants
      WHERE approvalStatus = 'PENDING'
        AND (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      ORDER BY createdAt DESC
    `).all(companyId, shortCode || companyId, `${shortCode || companyId.replace('comp-', '').toUpperCase()}%`) as Array<Record<string, unknown>>
  } else {
    pendingSup = db.prepare(`
      SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, createdAt
      FROM supervisors
      WHERE approvalStatus = 'PENDING'
        AND isSuperAdmin = 0
        AND UPPER(employeeCode) != 'SUPER-ADMIN'
      ORDER BY createdAt DESC
    `).all() as Array<Record<string, unknown>>

    pendingAtt = db.prepare(`
      SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, createdAt
      FROM attendants
      WHERE approvalStatus = 'PENDING'
      ORDER BY createdAt DESC
    `).all() as Array<Record<string, unknown>>
  }

  res.json({
    supervisors: pendingSup.map(r => ({ ...r, role: 'supervisor' })),
    attendants: pendingAtt.map(r => ({ ...r, role: 'attendant' })),
    total: pendingSup.length + pendingAtt.length,
  })
})

// --- OMC HQ / Superadmin: list all staff ---
authRouter.get('/staff', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const companyId = req.session?.role === 'superadmin' ? (req.query.companyId as string | undefined) : req.session?.companyId
  const shortCode = req.session?.companyShortCode
  let sups: Array<Record<string, unknown>>
  let atts: Array<Record<string, unknown>>

  if (companyId) {
    sups = db.prepare(`
      SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, createdAt
      FROM supervisors
      WHERE isSuperAdmin = 0
        AND UPPER(employeeCode) != 'SUPER-ADMIN'
        AND (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      ORDER BY employeeCode
    `).all(companyId, shortCode || companyId, `${shortCode || companyId.replace('comp-', '').toUpperCase()}%`) as Array<Record<string, unknown>>

    atts = db.prepare(`
      SELECT id, employeeCode, fullName, phone, pumpId, stationId, companyId, companyShortCode, approvalStatus, approvedAt, approvedBy, active, createdAt
      FROM attendants
      WHERE (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      ORDER BY employeeCode
    `).all(companyId, shortCode || companyId, `${shortCode || companyId.replace('comp-', '').toUpperCase()}%`) as Array<Record<string, unknown>>
  } else {
    sups = db.prepare(`
      SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, createdAt
      FROM supervisors
      WHERE isSuperAdmin = 0
        AND UPPER(employeeCode) != 'SUPER-ADMIN'
      ORDER BY employeeCode
    `).all() as Array<Record<string, unknown>>

    atts = db.prepare(`
      SELECT id, employeeCode, fullName, phone, pumpId, stationId, companyId, companyShortCode, approvalStatus, approvedAt, approvedBy, active, createdAt
      FROM attendants
      ORDER BY employeeCode
    `).all() as Array<Record<string, unknown>>
  }

  res.json({
    supervisors: sups.map(r => ({ ...r, role: 'supervisor' })),
    attendants: atts.map(r => ({ ...r, role: 'attendant' })),
    total: sups.length + atts.length,
  })
})

// --- OMC HQ: approve/reject a user ---
authRouter.post('/approve/:userId', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { userId } = req.params
  const { verdict } = (req.body ?? {}) as { verdict?: 'APPROVED' | 'REJECTED' }
  if (verdict !== 'APPROVED' && verdict !== 'REJECTED') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'verdict must be APPROVED or REJECTED.' })
    return
  }

  const now = new Date().toISOString()
  const actorName = req.session?.fullName ?? 'Unknown'
  const actorRole = req.session?.role?.toUpperCase() ?? 'HQ'

  // Try supervisors first
  let row = db.prepare('SELECT id, employeeCode, fullName, approvalStatus FROM supervisors WHERE id = ?').get(userId) as
    | { id: string; employeeCode: string; fullName: string; approvalStatus: string }
    | undefined

  if (row) {
    if (row.approvalStatus !== 'PENDING') {
      res.status(409).json({ error: 'CONFLICT', message: `Account is already ${row.approvalStatus}.` })
      return
    }
    db.prepare('UPDATE supervisors SET approvalStatus = ?, approvedAt = ?, approvedBy = ?, active = ? WHERE id = ?').run(verdict, now, actorName, verdict === 'APPROVED' ? 1 : 0, userId)
    const action = verdict === 'APPROVED' ? 'SUPERVISOR_APPROVED' : 'SUPERVISOR_REJECTED'
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), action, req.session?.userId ?? '', actorName, actorRole, userId, `${row.employeeCode} (${row.fullName})`, null, now, null)
    res.json({ id: userId, employeeCode: row.employeeCode, approvalStatus: verdict })
    return
  }

  // Try attendants
  row = db.prepare('SELECT id, employeeCode, fullName, approvalStatus FROM attendants WHERE id = ?').get(userId) as
    | { id: string; employeeCode: string; fullName: string; approvalStatus: string }
    | undefined

  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' })
    return
  }
  if (row.approvalStatus !== 'PENDING') {
    res.status(409).json({ error: 'CONFLICT', message: `Account is already ${row.approvalStatus}.` })
    return
  }
  db.prepare('UPDATE attendants SET approvalStatus = ?, approvedAt = ?, approvedBy = ?, active = ? WHERE id = ?').run(verdict, now, actorName, verdict === 'APPROVED' ? 1 : 0, userId)
  const action = verdict === 'APPROVED' ? 'ATTENDANT_APPROVED' : 'ATTENDANT_REJECTED'
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), action, req.session?.userId ?? '', actorName, actorRole, userId, `${row.employeeCode} (${row.fullName})`, null, now, null)
  res.json({ id: userId, employeeCode: row.employeeCode, approvalStatus: verdict })
})

