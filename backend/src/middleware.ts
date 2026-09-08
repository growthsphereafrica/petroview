import type { NextFunction, Request, Response } from 'express'
import { db } from './db'

export interface SessionClaims {
  token: string
  role: 'attendant' | 'supervisor'
  userId: string
  employeeCode: string
  fullName: string
  stationId: string | null
}

export interface AuthRequest extends Request {
  session?: SessionClaims
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined)
  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing authentication token.' })
    return
  }
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as
    | { token: string; role: string; userId: string; employeeCode: string; fullName: string; stationId: string | null; expiresAt: string }
    | undefined
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) {
    if (row) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid.' })
    return
  }
  req.session = {
    token: row.token,
    role: row.role as 'attendant' | 'supervisor',
    userId: row.userId,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    stationId: row.stationId,
  }
  next()
}

export function requireRole(role: 'attendant' | 'supervisor') {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.session?.role !== role) {
      res.status(403).json({ error: 'FORBIDDEN', message: `This endpoint requires a ${role} session.` })
      return
    }
    next()
  }
}