import type { NextFunction, Request, Response } from 'express'
import { db } from './db'

export type BackendRole = 'attendant' | 'supervisor' | 'headoffice' | 'superadmin'

export interface SessionClaims {
  token: string
  role: BackendRole
  userId: string
  employeeCode: string
  fullName: string
  stationId: string | null
  companyId: string | null
  companyShortCode: string | null
  expiresAt: string
}

export interface AuthRequest extends Request {
  session?: SessionClaims
}

const BACKEND_ROLES = new Set<BackendRole>(['attendant', 'supervisor', 'headoffice', 'superadmin'])

type SessionRow = SessionClaims

interface ActiveUserRow {
  id: string
  employeeCode: string
  fullName: string
  stationId: string | null
  companyId: string | null
  companyShortCode: string | null
  active: number
  approvalStatus: string
  isHeadOffice?: number
  isSuperAdmin?: number
}

function rejectSession(res: Response, message: string): void {
  res.status(401).json({ error: 'UNAUTHORIZED', message })
}

export function getUsableAccountScope(table: 'attendants' | 'supervisors', id: string): ActiveUserRow | null {
  const roleColumns = table === 'supervisors' ? 'isHeadOffice, isSuperAdmin' : '0 AS isHeadOffice, 0 AS isSuperAdmin'
  const user = db.prepare(`
    SELECT id, employeeCode, fullName, stationId, companyId, companyShortCode, active, approvalStatus,
           ${roleColumns}
    FROM ${table}
    WHERE id = ?
  `).get(id) as ActiveUserRow | undefined
  if (!user || user.active !== 1 || user.approvalStatus !== 'APPROVED') return null

  let stationId = user.stationId
  let companyId = user.companyId
  let companyShortCode = user.companyShortCode

  if (stationId) {
    const station = db.prepare('SELECT id, companyId FROM companyStations WHERE active = 1 AND (UPPER(id) = UPPER(?) OR UPPER(code) = UPPER(?)) LIMIT 1').get(stationId, stationId) as { id: string; companyId: string } | undefined
    if (!station) return null
    stationId = station.id
    if (companyId) {
      const company = db.prepare('SELECT id, shortCode FROM companies WHERE active = 1 AND (UPPER(id) = UPPER(?) OR UPPER(shortCode) = UPPER(?)) LIMIT 1').get(companyId, companyShortCode ?? companyId) as { id: string; shortCode: string } | undefined
      if (!company || company.id !== station.companyId) return null
      companyId = company.id
      companyShortCode = company.shortCode
    } else {
      companyId = station.companyId
      const company = db.prepare('SELECT shortCode FROM companies WHERE id = ? AND active = 1').get(companyId) as { shortCode: string } | undefined
      if (!company) return null
      companyShortCode = company.shortCode
    }
  }

  if (companyId && !stationId) {
    const company = db.prepare('SELECT id, shortCode FROM companies WHERE active = 1 AND (UPPER(id) = UPPER(?) OR UPPER(shortCode) = UPPER(?)) LIMIT 1').get(companyId, companyShortCode ?? companyId) as { id: string; shortCode: string } | undefined
    if (!company) return null
    companyId = company.id
    companyShortCode = company.shortCode
  } else if (stationId && !companyId) {
    const company = db.prepare('SELECT id, shortCode FROM companies WHERE id = (SELECT companyId FROM companyStations WHERE id = ?) AND active = 1').get(stationId) as { id: string; shortCode: string } | undefined
    if (!company) return null
    companyId = company.id
    companyShortCode = company.shortCode
  }

  if (table === 'attendants' && (!companyId || !stationId)) return null
  if (table === 'supervisors' && user.isSuperAdmin !== 1 && user.isHeadOffice !== 1 && (!companyId || !stationId)) return null
  if (table === 'supervisors' && user.isHeadOffice === 1 && !companyId) return null
  return { ...user, stationId, companyId, companyShortCode }
}

export function isAccountUsable(table: 'attendants' | 'supervisors', id: string): boolean {
  return getUsableAccountScope(table, id) !== null
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.header('authorization')
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) {
    rejectSession(res, 'Missing authentication token.')
    return
  }

  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as SessionRow | undefined
  if (!row) {
    rejectSession(res, 'Session expired or invalid.')
    return
  }

  if (!BACKEND_ROLES.has(row.role as BackendRole) || new Date(row.expiresAt).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    rejectSession(res, 'Session expired or invalid.')
    return
  }

  const role = row.role as BackendRole
  const table = role === 'attendant' ? 'attendants' : 'supervisors'
  const user = getUsableAccountScope(table, row.userId)

  if (!user) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    rejectSession(res, 'User account is inactive or pending approval.')
    return
  }

  const isSuperAdmin = user.isSuperAdmin === 1
  const isHeadOffice = user.isHeadOffice === 1
  const roleMatches = role === 'attendant'
    ? table === 'attendants'
    : role === 'superadmin'
      ? isSuperAdmin
      : role === 'headoffice'
        ? !isSuperAdmin && isHeadOffice
        : !isSuperAdmin && !isHeadOffice

  if (!roleMatches) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    rejectSession(res, 'Session role no longer matches the account.')
    return
  }

  req.session = {
    token: row.token,
    role,
    userId: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    stationId: user.stationId,
    companyId: user.companyId,
    companyShortCode: user.companyShortCode,
    expiresAt: row.expiresAt,
  }
  next()
}

export function requireRole(...roles: BackendRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.session || !roles.includes(req.session.role)) {
      res.status(403).json({ error: 'FORBIDDEN', message: `This endpoint requires one of: ${roles.join(', ')}.` })
      return
    }
    next()
  }
}
