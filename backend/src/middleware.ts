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

  // Super Admin has global platform scope without station/company constraints
  if (user.isSuperAdmin === 1) {
    return { ...user, stationId: null, companyId: null, companyShortCode: null }
  }

  let stationId = user.stationId
  let companyId = user.companyId
  let companyShortCode = user.companyShortCode

  // Resolve company if companyId or companyShortCode is provided
  if (companyId || companyShortCode) {
    const comp = db.prepare(`
      SELECT id, shortCode FROM companies 
      WHERE active = 1 AND (UPPER(id) = UPPER(?) OR UPPER(shortCode) = UPPER(?)) 
      LIMIT 1
    `).get(companyId || companyShortCode, companyShortCode || companyId) as { id: string; shortCode: string } | undefined
    if (comp) {
      companyId = comp.id
      companyShortCode = comp.shortCode
    }
  }

  // If stationId was assigned, verify it is active and belongs to the company
  let station: { id: string; companyId: string } | undefined
  if (stationId) {
    station = db.prepare(`
      SELECT id, companyId FROM companyStations 
      WHERE active = 1 AND (UPPER(id) = UPPER(?) OR UPPER(code) = UPPER(?)) 
      LIMIT 1
    `).get(stationId, stationId) as { id: string; companyId: string } | undefined
  }

  // Auto-heal: If stationId is missing, invalid, deleted, or belongs to another company,
  // automatically locate the first active station for this company.
  if ((!station || (companyId && station.companyId.toLowerCase() !== companyId.toLowerCase())) && companyId) {
    const fallbackStation = db.prepare(`
      SELECT id, companyId FROM companyStations 
      WHERE (UPPER(companyId) = UPPER(?) OR companyId = (SELECT id FROM companies WHERE UPPER(shortCode) = UPPER(?))) 
        AND active = 1 
      ORDER BY createdAt ASC LIMIT 1
    `).get(companyId, companyShortCode || companyId) as { id: string; companyId: string } | undefined

    if (fallbackStation) {
      station = fallbackStation
      stationId = fallbackStation.id
      try {
        db.prepare(`UPDATE ${table} SET stationId = ? WHERE id = ?`).run(stationId, id)
        console.log(`[auth] Auto-healed stationId for ${table} ${user.employeeCode} -> ${stationId}`)
      } catch { /* ignore concurrency */ }
    }
  }

  if (station) {
    stationId = station.id
    if (!companyId) {
      companyId = station.companyId
      const comp = db.prepare('SELECT shortCode FROM companies WHERE id = ? AND active = 1').get(companyId) as { shortCode: string } | undefined
      companyShortCode = comp?.shortCode ?? null
    }
  } else if (!stationId && stationId !== null) {
    stationId = null
  }

  // Attendants and Station Supervisors require an active company.
  // If company stations exist, they have now been resolved. If none exist yet, allow login with stationId = null
  if (!companyId) return null

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
