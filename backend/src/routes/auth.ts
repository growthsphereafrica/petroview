import { Router } from 'express'
import { db, seedSuperAdmin } from '../db'
import { ENV } from '../config'
import { CURRENT_KDF_VERSION, hashPin, isSecretShape, newToken, sessionExpiry, validateNewSecret, verifyPin, verifyPinAsync } from '../auth'
import { authenticate, getUsableAccountScope, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const authRouter = Router()

interface LoginBody {
  employeeCode?: string
  pin?: string
}

function resolveRole(row: { isSuperAdmin?: number; isHeadOffice?: number }, table: 'attendants' | 'supervisors'): 'attendant' | 'supervisor' | 'headoffice' | 'superadmin' {
  if (table === 'attendants') return 'attendant'
  if (row.isSuperAdmin === 1) return 'superadmin'
  if (row.isHeadOffice === 1) return 'headoffice'
  return 'supervisor'
}

/**
 * Builds the SQL LIKE pattern that scopes staff lookups to one tenant.
 *
 * Employee codes are `<shortCode><nnn><A|M>`, so the pattern requires a digit
 * immediately after the short code. A bare `<shortCode>%` let a one-character
 * short code match every other tenant whose codes merely started with the same
 * letter, which exposed another company's staff roster and pending
 * registrations to any head-office admin.
 */
function employeeCodePrefixPattern(shortCode: string): string {
  const prefix = shortCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return `${prefix ? `${prefix}[0-9]` : '%'}${prefix ? '%' : ''}`
}

function stationNameFor(stationId: string | null): string | null {
  if (!stationId) return null
  const station = db.prepare('SELECT name FROM companyStations WHERE id = ? AND active = 1').get(stationId) as { name: string } | undefined
  return station?.name ?? null
}

interface RegistrationScope {
  stationId: string | null
  companyId: string | null
  companyShortCode: string | null
}

function resolveRegistrationScope(stationValue: unknown, companyValue: unknown, shortCodeValue: unknown): RegistrationScope {
  const stationInput = typeof stationValue === 'string' ? stationValue.trim() : ''
  const companyInput = typeof companyValue === 'string' && companyValue.trim() ? companyValue.trim() : typeof shortCodeValue === 'string' ? shortCodeValue.trim() : ''
  const station = stationInput
    ? db.prepare(`
        SELECT cs.id, cs.companyId, c.shortCode AS companyShortCode
        FROM companyStations cs
        JOIN companies c ON c.id = cs.companyId
        WHERE cs.active = 1 AND c.active = 1 AND (UPPER(cs.id) = UPPER(?) OR UPPER(cs.code) = UPPER(?))
        LIMIT 1
      `).get(stationInput, stationInput) as { id: string; companyId: string; companyShortCode: string } | undefined
    : undefined
  if (stationInput && !station) throw new Error('Station is invalid or inactive.')
  const company = companyInput
    ? db.prepare(`
        SELECT id, shortCode
        FROM companies
        WHERE active = 1 AND (UPPER(id) = UPPER(?) OR UPPER(shortCode) = UPPER(?))
        LIMIT 1
      `).get(companyInput, companyInput) as { id: string; shortCode: string } | undefined
    : undefined
  if (companyInput && !company) throw new Error('Company is invalid or inactive.')
  if (station && company && station.companyId !== company.id) throw new Error('Station does not belong to the selected company.')
  return {
    stationId: station?.id ?? null,
    companyId: station?.companyId ?? company?.id ?? null,
    companyShortCode: station?.companyShortCode ?? company?.shortCode ?? null,
  }
}

function lockoutApply(table: 'attendants' | 'supervisors', id: string, failed: number, lockoutUntil: string | null): void {
  db.prepare(`UPDATE ${table} SET failedAttempts = ?, lockoutUntil = ? WHERE id = ?`).run(failed, lockoutUntil, id)
}

authRouter.post('/login', async (req, res) => {
  const { employeeCode, pin } = (req.body ?? {}) as LoginBody
  if (!employeeCode || !pin || !isSecretShape(String(pin))) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'employeeCode and a PIN are required.' })
    return
  }
  const code = String(employeeCode).trim().toUpperCase()
  if (code.length < 3 || code.length > 50 || !/^[A-Z0-9_-]+$/.test(code)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid employeeCode format.' })
    return
  }

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

  const account = row ? getUsableAccountScope(table, String(row.id)) : null
  if (!row || !account) {
    // Do not distinguish "no such employee code" from "inactive account". The
    // previous three-way response (INVALID_CREDENTIALS / INVALID_PIN /
    // LOCKED_OUT) let an unauthenticated caller enumerate every valid code.
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid employee code or PIN.' })
    return
  }

  if (row.lockoutUntil && new Date(row.lockoutUntil as string).getTime() > Date.now()) {
    res.status(423).json({ error: 'LOCKED_OUT', message: 'Too many failed attempts. Try again later.' })
    return
  }
  // Async so the KDF does not block the event loop for concurrent callers.
  const verification = await verifyPinAsync(String(pin), row.pinSalt as string, row.pinHash as string)
  if (!verification.valid) {
    const failed = ((row.failedAttempts as number) || 0) + 1
    const lockout = failed >= ENV.MAX_PIN_ATTEMPTS ? new Date(Date.now() + ENV.LOCKOUT_MS).toISOString() : null
    lockoutApply(table, row.id as string, lockout ? 0 : failed, lockout)
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: lockout ? 'Too many attempts — account locked for 5 minutes.' : 'Invalid employee code or PIN.' })
    return
  }

  lockoutApply(table, row.id as string, 0, null)

  // Transparent credential upgrade. If this row was written with a superseded
  // KDF, rewrite it to the current scheme now, while the plaintext PIN is in
  // hand. Without this the stricter parameters could never be applied to
  // existing accounts.
  if (verification.version !== CURRENT_KDF_VERSION) {
    const upgraded = hashPin(String(pin))
    db.prepare(`UPDATE ${table} SET pinSalt = ?, pinHash = ? WHERE id = ?`).run(upgraded.salt, upgraded.hash, row.id)
    console.log(`[auth] Upgraded ${row.employeeCode} credential from KDF v${verification.version} to v${CURRENT_KDF_VERSION}`)
  }

  const approvalStatus = String(row.approvalStatus || '')
  if (approvalStatus !== 'APPROVED') {
    res.status(403).json({ error: 'PENDING_APPROVAL', message: 'Your account is not approved.' })
    return
  }

  const role = resolveRole(row as { isSuperAdmin?: number; isHeadOffice?: number }, table)
  const token = newToken()
  const createdAt = new Date().toISOString()
  const expiresAt = sessionExpiry()
  const stationName = stationNameFor(account.stationId)

  let resolvedFullName = account.fullName
  if (account.isHeadOffice) {
    if (!resolvedFullName || resolvedFullName.toUpperCase() === 'SUPER-ADMIN' || resolvedFullName.toUpperCase().includes('SUPER')) {
      resolvedFullName = `${account.companyShortCode || ''} HQ Admin`.trim()
    }
  }

  db.prepare(
    'INSERT INTO sessions (token, role, userId, employeeCode, fullName, stationId, companyId, companyShortCode, createdAt, expiresAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(token, role, account.id, account.employeeCode, resolvedFullName, account.stationId, account.companyId, account.companyShortCode, createdAt, expiresAt)

  // Expired sessions were never removed, so the table only ever grew. Production
  // had reached 148 rows of which 147 were already dead. Login is the one moment
  // guaranteed to be cheap and frequent enough to keep it bounded.
  db.prepare("DELETE FROM sessions WHERE expiresAt < datetime('now')").run()

  res.json({
    token,
    userId: account.id,
    role,
    fullName: resolvedFullName,
    employeeCode: account.employeeCode,
    stationId: account.stationId,
    stationName,
    companyId: account.companyId,
    companyShortCode: account.companyShortCode,
    isSuperAdmin: !!row.isSuperAdmin,
    isHeadOffice: !!row.isHeadOffice,
    expiresAt,
  })
})

authRouter.post('/logout', authenticate, (req: AuthRequest, res) => {
  if (req.session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token)
  res.json({ success: true })
})

authRouter.post('/wipe-database', authenticate, requireRole('superadmin'), (req: AuthRequest, res) => {
  const { pin } = (req.body ?? {}) as { pin?: string }
  if (!ENV.ENABLE_DESTRUCTIVE_OPERATIONS) {
    res.status(403).json({ error: 'DISABLED', message: 'Destructive operations are disabled on this server.' })
    return
  }
  if (!pin || !isSecretShape(String(pin))) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'A Super Admin PIN is required.' })
    return
  }

  const admin = db.prepare('SELECT pinSalt, pinHash FROM supervisors WHERE employeeCode = ? COLLATE NOCASE').get('SUPER-ADMIN') as
    | { pinSalt: string; pinHash: string }
    | undefined
  if (!admin || !verifyPin(String(pin), admin.pinSalt, admin.pinHash)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'The supplied Super Admin PIN is invalid.' })
    return
  }

  try {
    db.pragma('foreign_keys = OFF')
    const wipe = db.transaction(() => {
      db.prepare('DELETE FROM syncQueue').run()
      db.prepare('DELETE FROM receipts').run()
      db.prepare('DELETE FROM transactions').run()
      db.prepare('DELETE FROM tankReadings').run()
      db.prepare('DELETE FROM shifts').run()
      db.prepare('DELETE FROM station_expenses').run()
      db.prepare('DELETE FROM products').run()
      db.prepare('DELETE FROM pumps').run()
      db.prepare('DELETE FROM audit_log').run()
      db.prepare('DELETE FROM sessions').run()
      db.prepare('DELETE FROM attendants').run()
      db.prepare("DELETE FROM supervisors WHERE UPPER(employeeCode) != 'SUPER-ADMIN'").run()
      db.prepare('DELETE FROM companyStations').run()
      db.prepare('DELETE FROM companies').run()
    })
    wipe()
  } finally {
    db.pragma('foreign_keys = ON')
  }

  seedSuperAdmin()
  res.json({
    success: true,
    message: 'All database tables wiped clean. Master SUPER-ADMIN is active and ready to provision OMCs.',
    timestamp: new Date().toISOString(),
  })
})

authRouter.get('/me', authenticate, (req: AuthRequest, res) => {
  const s = req.session as SessionClaims
  let fullName = s.fullName
  if (s.role === 'headoffice' && (fullName.toUpperCase() === 'SUPER-ADMIN' || fullName.toUpperCase().includes('SUPER'))) {
    fullName = `${s.companyShortCode || ''} HQ Admin`.trim()
  }
  res.json({
    role: s.role,
    userId: s.userId,
    employeeCode: s.employeeCode,
    fullName,
    stationId: s.stationId,
    stationName: stationNameFor(s.stationId),
    companyId: s.companyId,
    companyShortCode: s.companyShortCode,
    isSuperAdmin: s.role === 'superadmin',
    isHeadOffice: s.role === 'headoffice',
    expiresAt: s.expiresAt,
  })
})

// --- Self-registration for supervisors/managers ---
authRouter.post('/register', (req, res) => {
  const { employeeCode, fullName, pin, phone, stationId, companyId, companyShortCode, pumpId } = (req.body ?? {}) as {
    employeeCode?: string
    fullName?: string
    pin?: string
    phone?: string
    stationId?: string
    companyId?: string
    companyShortCode?: string
    pumpId?: string
  }

  const code = String(employeeCode ?? '').trim().toUpperCase()
  if (!code || !fullName?.trim() || !pin) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'employeeCode, fullName, and a PIN are required.' })
    return
  }
  try {
    validateNewSecret(pin)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid PIN.' })
    return
  }
  if (code.length > 40 || fullName.trim().length > 120) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Registration data is too long.' })
    return
  }
  let scope: RegistrationScope
  try {
    scope = resolveRegistrationScope(stationId, companyId, companyShortCode)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid registration scope.' })
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
  if (!isSupervisor) {
    if (!scope.stationId) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'An attendant must be assigned to an active station.' })
      return
    }
    const requestedPump = typeof pumpId === 'string' ? pumpId.trim() : ''
    if (!requestedPump || !db.prepare('SELECT 1 FROM pumps WHERE id = ? AND stationId = ? AND active = 1').get(requestedPump, scope.stationId)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Select an active pump belonging to the selected station.' })
      return
    }
  }

  if (isSupervisor) {
    const id = `sup-${code.toLowerCase()}`
    db.prepare(
      `INSERT INTO supervisors (id, employeeCode, fullName, pinSalt, pinHash, stationId, companyId, companyShortCode,
       phone, isHeadOffice, isSuperAdmin, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'PENDING', NULL, NULL, 1, 0, NULL, ?)`,
    ).run(id, code, fullName.trim(), salt, hash, scope.stationId, scope.companyId, scope.companyShortCode, phone ?? null, now)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'SUPERVISOR_REGISTERED', id, fullName.trim(), 'SELF', id, `Supervisor ${code} (${fullName.trim()})`, null, now, null)
    res.status(201).json({ id, employeeCode: code, fullName: fullName.trim(), role: 'supervisor', approvalStatus: 'PENDING' })
  } else {
    const id = `att-${code.toLowerCase()}`
    db.prepare(
      `INSERT INTO attendants (id, employeeCode, fullName, pinSalt, pinHash, pumpId, stationId, companyId, companyShortCode,
       phone, approvalStatus, approvedAt, approvedBy, active, failedAttempts, lockoutUntil, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, NULL, 1, 0, NULL, ?)`,
    ).run(id, code, fullName.trim(), salt, hash, typeof pumpId === 'string' ? pumpId.trim() : null, scope.stationId, scope.companyId, scope.companyShortCode, phone ?? null, now)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'ATTENDANT_REGISTERED', id, fullName.trim(), 'SELF', id, `Attendant ${code} (${fullName.trim()})`, null, now, null)
    res.status(201).json({ id, employeeCode: code, fullName: fullName.trim(), role: 'attendant', approvalStatus: 'PENDING' })
  }
})

// --- Next sequential staff code generation ---
authRouter.get('/next-code', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = req.session!
  const role = req.query.role === 'supervisor' ? 'supervisor' : 'attendant'
  const companyId = session.role === 'superadmin'
    ? (typeof req.query.companyId === 'string' ? req.query.companyId.trim() : '')
    : (session.companyId ?? '')
  if (session.role !== 'superadmin' && !companyId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Your account is not assigned to a company.' })
    return
  }

  let prefix = session.role === 'superadmin' && typeof req.query.shortCode === 'string'
    ? req.query.shortCode.trim().toUpperCase()
    : (session.companyShortCode ?? '').trim().toUpperCase()

  if (companyId) {
    const comp = db.prepare('SELECT id, shortCode FROM companies WHERE (id = ? OR shortCode = ? COLLATE NOCASE) AND active = 1').get(companyId, companyId) as { id: string; shortCode: string } | undefined
    if (!comp) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Company not found or inactive.' })
      return
    }
    prefix = comp.shortCode.trim().toUpperCase()
  } else if (session.role === 'superadmin') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'companyId is required.' })
    return
  }
  if (!prefix) prefix = 'PV'

  const attendantCodes = (db.prepare(`
    SELECT employeeCode FROM attendants
    WHERE (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
  `).all(companyId, prefix, employeeCodePrefixPattern(prefix)) as Array<{ employeeCode: string }>).map(r => r.employeeCode)

  const supervisorCodes = (db.prepare(`
    SELECT employeeCode FROM supervisors
    WHERE (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      AND UPPER(employeeCode) != 'SUPER-ADMIN'
  `).all(companyId, prefix, employeeCodePrefixPattern(prefix)) as Array<{ employeeCode: string }>).map(r => r.employeeCode)

  const allCodes = [...attendantCodes, ...supervisorCodes]
  let maxIndex = 0
  const pattern = new RegExp(`^${prefix}(\\d+)[AM]?$`, 'i')
  for (const code of allCodes) {
    const match = String(code).trim().match(pattern)
    if (match) {
      const val = parseInt(match[1], 10)
      if (!isNaN(val) && val > maxIndex) maxIndex = val
    }
  }

  const nextIndex = maxIndex + 1
  const suffix = role === 'attendant' ? 'A' : 'M'
  res.json({
    nextCode: `${prefix}${String(nextIndex).padStart(3, '0')}${suffix}`,
    companyShortCode: prefix,
    sequence: nextIndex,
    role,
  })
})

// --- Reset Staff PIN (Attendant or Supervisor) ---
interface ResetTarget {
  id: string
  employeeCode: string
  fullName: string
  companyId: string | null
  stationId: string | null
}

function canManageTarget(session: SessionClaims, target: ResetTarget): boolean {
  if (session.role === 'superadmin') return true
  if (session.role === 'headoffice') {
    if (!session.companyId || !target.companyId) return false
    const company = db.prepare('SELECT id FROM companies WHERE UPPER(id) = UPPER(?) OR UPPER(shortCode) = UPPER(?) LIMIT 1').get(target.companyId, target.companyId) as { id: string } | undefined
    return company?.id === session.companyId
  }
  if (!session.stationId || !target.stationId) return false
  const station = db.prepare('SELECT id FROM companyStations WHERE active = 1 AND (UPPER(id) = UPPER(?) OR UPPER(code) = UPPER(?)) LIMIT 1').get(target.stationId, target.stationId) as { id: string } | undefined
  return station?.id === session.stationId
}

authRouter.post('/reset-pin', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { userId, employeeCode, newPin } = (req.body ?? {}) as {
    userId?: string
    employeeCode?: string
    newPin?: string
  }
  const cleanPin = String(newPin ?? '').trim()
  const cleanCode = employeeCode ? String(employeeCode).trim().toUpperCase() : ''
  const cleanId = userId ? String(userId).trim() : ''

  try {
    validateNewSecret(cleanPin)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid PIN.' })
    return
  }
  if (!cleanId && !cleanCode) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'userId or employeeCode is required.' })
    return
  }
  if (cleanId && (cleanId.length < 3 || cleanId.length > 80)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid userId.' })
    return
  }
  if (cleanCode && (cleanCode.length < 3 || cleanCode.length > 50 || !/^[A-Z0-9_-]+$/.test(cleanCode))) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid employeeCode.' })
    return
  }

  const now = new Date().toISOString()
  const session = req.session!
  const actorId = session.userId
  const actorName = session.fullName
  const actorRole = session.role.toUpperCase()
  const { salt, hash } = hashPin(cleanPin)
  const targetQuery = 'SELECT id, employeeCode, fullName, companyId, stationId FROM supervisors WHERE '
  const supervisor = (cleanId
    ? db.prepare(`${targetQuery}id = ?`).get(cleanId)
    : db.prepare(`${targetQuery}employeeCode = ? COLLATE NOCASE`).get(cleanCode)) as ResetTarget | undefined

  if (supervisor) {
    if (!canManageTarget(session, supervisor)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot reset PINs for this account.' })
      return
    }
    db.prepare('UPDATE supervisors SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE id = ?').run(salt, hash, supervisor.id)
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(supervisor.id)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'PIN_RESET', actorId, actorName, actorRole, supervisor.id, `PIN reset for supervisor ${supervisor.employeeCode} (${supervisor.fullName})`, `Reset by ${actorName}`, now, null)
    res.json({ success: true, message: `PIN reset successfully for supervisor ${supervisor.employeeCode}.`, employeeCode: supervisor.employeeCode, id: supervisor.id })
    return
  }

  const attendant = (cleanId
    ? db.prepare('SELECT id, employeeCode, fullName, companyId, stationId FROM attendants WHERE id = ?').get(cleanId)
    : db.prepare('SELECT id, employeeCode, fullName, companyId, stationId FROM attendants WHERE employeeCode = ? COLLATE NOCASE').get(cleanCode)) as ResetTarget | undefined

  if (attendant) {
    if (!canManageTarget(session, attendant)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot reset PINs for this account.' })
      return
    }
    db.prepare('UPDATE attendants SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE id = ?').run(salt, hash, attendant.id)
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(attendant.id)
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), 'PIN_RESET', actorId, actorName, actorRole, attendant.id, `PIN reset for attendant ${attendant.employeeCode} (${attendant.fullName})`, `Reset by ${actorName}`, now, null)
    res.json({ success: true, message: `PIN reset successfully for attendant ${attendant.employeeCode}.`, employeeCode: attendant.employeeCode, id: attendant.id })
    return
  }

  res.status(404).json({ error: 'NOT_FOUND', message: 'Staff user not found in supervisors or attendants.' })
})

// --- OMC HQ: list pending approvals ---
authRouter.get('/pending-approvals', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = req.session!
  const companyId = session.role === 'superadmin'
    ? (typeof req.query.companyId === 'string' ? req.query.companyId.trim() : '')
    : session.companyId
  const shortCode = session.companyShortCode
  if (session.role !== 'superadmin' && !companyId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Your account is not assigned to a company.' })
    return
  }
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
    `).all(companyId, shortCode || companyId, employeeCodePrefixPattern(shortCode || companyId.replace('comp-', '').toUpperCase())) as Array<Record<string, unknown>>

    pendingAtt = db.prepare(`
      SELECT id, employeeCode, fullName, phone, stationId, companyId, companyShortCode, createdAt
      FROM attendants
      WHERE approvalStatus = 'PENDING'
        AND (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      ORDER BY createdAt DESC
    `).all(companyId, shortCode || companyId, employeeCodePrefixPattern(shortCode || companyId.replace('comp-', '').toUpperCase())) as Array<Record<string, unknown>>
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
  const session = req.session!
  const companyId = session.role === 'superadmin'
    ? (typeof req.query.companyId === 'string' ? req.query.companyId.trim() : '')
    : session.companyId
  const shortCode = session.companyShortCode
  if (session.role !== 'superadmin' && !companyId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Your account is not assigned to a company.' })
    return
  }
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
    `).all(companyId, shortCode || companyId, employeeCodePrefixPattern(shortCode || companyId.replace('comp-', '').toUpperCase())) as Array<Record<string, unknown>>

    atts = db.prepare(`
      SELECT id, employeeCode, fullName, phone, pumpId, stationId, companyId, companyShortCode, approvalStatus, approvedAt, approvedBy, active, createdAt
      FROM attendants
      WHERE (companyId = ? OR companyShortCode = ? OR employeeCode LIKE ?)
      ORDER BY employeeCode
    `).all(companyId, shortCode || companyId, employeeCodePrefixPattern(shortCode || companyId.replace('comp-', '').toUpperCase())) as Array<Record<string, unknown>>
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
    supervisors: sups.map(r => {
      let fullName = r.fullName as string
      const isHQ = !!r.isHeadOffice || (typeof r.employeeCode === 'string' && r.employeeCode.includes('HQ'))
      if (isHQ && (!fullName || fullName.toUpperCase() === 'SUPER-ADMIN' || fullName.toUpperCase().includes('SUPER'))) {
        fullName = `${(r.companyShortCode as string) || ''} HQ Admin`.trim()
      }
      return { ...r, fullName, role: isHQ ? 'headoffice' : 'supervisor' }
    }),
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

  const session = req.session!
  const now = new Date().toISOString()
  const actorName = session.fullName
  const actorRole = session.role.toUpperCase()

  // Try supervisors first
  let row = db.prepare('SELECT id, employeeCode, fullName, approvalStatus, companyId, stationId FROM supervisors WHERE id = ?').get(userId) as
    | (ResetTarget & { approvalStatus: string })
    | undefined

  if (row) {
    if (!canManageTarget(session, row)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot approve this account.' })
      return
    }
    if (row.approvalStatus !== 'PENDING') {
      res.status(409).json({ error: 'CONFLICT', message: `Account is already ${row.approvalStatus}.` })
      return
    }
    const result = db.prepare('UPDATE supervisors SET approvalStatus = ?, approvedAt = ?, approvedBy = ?, active = ? WHERE id = ? AND approvalStatus = \'PENDING\'').run(verdict, now, actorName, verdict === 'APPROVED' ? 1 : 0, userId)
    if (result.changes === 0) {
      res.status(409).json({ error: 'CONFLICT', message: 'Account status was modified concurrently.' })
      return
    }
    const action = verdict === 'APPROVED' ? 'SUPERVISOR_APPROVED' : 'SUPERVISOR_REJECTED'
    db.prepare(
      'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(newToken(), action, session.userId, actorName, actorRole, userId, `${row.employeeCode} (${row.fullName})`, null, now, null)
    res.json({ id: userId, employeeCode: row.employeeCode, approvalStatus: verdict })
    return
  }

  // Try attendants
  row = db.prepare('SELECT id, employeeCode, fullName, approvalStatus, companyId, stationId FROM attendants WHERE id = ?').get(userId) as
    | (ResetTarget & { approvalStatus: string })
    | undefined

  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' })
    return
  }
  if (!canManageTarget(session, row)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot approve this account.' })
    return
  }
  if (row.approvalStatus !== 'PENDING') {
    res.status(409).json({ error: 'CONFLICT', message: `Account is already ${row.approvalStatus}.` })
    return
  }
  const result = db.prepare('UPDATE attendants SET approvalStatus = ?, approvedAt = ?, approvedBy = ?, active = ? WHERE id = ? AND approvalStatus = \'PENDING\'').run(verdict, now, actorName, verdict === 'APPROVED' ? 1 : 0, userId)
  if (result.changes === 0) {
    res.status(409).json({ error: 'CONFLICT', message: 'Account status was modified concurrently.' })
    return
  }
  const action = verdict === 'APPROVED' ? 'ATTENDANT_APPROVED' : 'ATTENDANT_REJECTED'
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), action, req.session?.userId ?? '', actorName, actorRole, userId, `${row.employeeCode} (${row.fullName})`, null, now, null)
  res.json({ id: userId, employeeCode: row.employeeCode, approvalStatus: verdict })
})

