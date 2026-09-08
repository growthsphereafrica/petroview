import { Router } from 'express'
import { db } from '../db'
import { ENV } from '../config'
import { newToken, sessionExpiry, verifyPin } from '../auth'
import { authenticate, type AuthRequest, type SessionClaims } from '../middleware'

export const authRouter = Router()

interface LoginBody {
  employeeCode?: string
  pin?: string
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
  const isSupervisor = code.startsWith('SUP')
  const table = isSupervisor ? 'supervisors' : 'attendants'

  const row = db.prepare(`SELECT * FROM ${table} WHERE employeeCode = ? COLLATE NOCASE`).get(code) as
    | { id: string; employeeCode: string; fullName: string; pinSalt: string; pinHash: string; stationId: string | null; active: number; failedAttempts: number; lockoutUntil: string | null }
    | undefined

  if (!row || row.active !== 1) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Unknown or inactive employee code.' })
    return
  }
  if (row.lockoutUntil && new Date(row.lockoutUntil).getTime() > Date.now()) {
    res.status(423).json({ error: 'LOCKED_OUT', message: 'Too many failed attempts. Try again later.' })
    return
  }
  if (!verifyPin(String(pin), row.pinSalt, row.pinHash)) {
    const failed = row.failedAttempts + 1
    const lockout = failed >= ENV.MAX_PIN_ATTEMPTS ? new Date(Date.now() + ENV.LOCKOUT_MS).toISOString() : null
    lockoutApply(table, row.id, lockout ? 0 : failed, lockout)
    res.status(401).json({ error: 'INVALID_PIN', message: lockout ? 'Too many attempts — account locked for 5 minutes.' : 'Incorrect PIN.' })
    return
  }

  lockoutApply(table, row.id, 0, null)

  const token = newToken()
  const role = isSupervisor ? 'supervisor' : 'attendant'
  const createdAt = new Date().toISOString()
  db.prepare(
    'INSERT INTO sessions (token, role, userId, employeeCode, fullName, stationId, createdAt, expiresAt) VALUES (?,?,?,?,?,?,?,?)',
  ).run(token, role, row.id, row.employeeCode, row.fullName, row.stationId ?? null, createdAt, sessionExpiry())

  res.json({ token, role, fullName: row.fullName, employeeCode: row.employeeCode, stationId: row.stationId, expiresAt: sessionExpiry() })
})

authRouter.post('/logout', authenticate, (req: AuthRequest, res) => {
  if (req.session) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.session.token)
  res.json({ success: true })
})

authRouter.get('/me', authenticate, (req: AuthRequest, res) => {
  const s = req.session as SessionClaims
  res.json({ role: s.role, userId: s.userId, employeeCode: s.employeeCode, fullName: s.fullName, stationId: s.stationId })
})