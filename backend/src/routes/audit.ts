import { Router } from 'express'
import { db } from '../db'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const auditRouter = Router()

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function stationInScope(session: SessionClaims, stationId: string): boolean {
  if (session.role === 'superadmin') return true
  if (session.role === 'headoffice') {
    const row = db.prepare('SELECT companyId FROM companyStations WHERE id = ? AND active = 1').get(stationId) as { companyId: string } | undefined
    return !!row && row.companyId === session.companyId
  }
  return session.stationId === stationId
}

function scopeCondition(session: SessionClaims, params: unknown[]): string {
  if (session.role === 'superadmin') return '1 = 1'
  if (session.role === 'headoffice') {
    params.push(session.companyId)
    params.push(session.companyId)
    params.push(session.companyId)
    params.push(session.companyId)
    params.push(session.companyId)
    params.push(session.companyId)
    params.push(session.companyId)
    params.push(session.companyId)
    return `(
      (json_valid(a.meta) AND json_extract(a.meta, '$.companyId') = ?)
      OR a.actorId IN (SELECT id FROM supervisors WHERE companyId = ? UNION SELECT id FROM attendants WHERE companyId = ?)
      OR a.targetId IN (SELECT id FROM shifts WHERE companyId = ? OR stationId IN (SELECT id FROM companyStations WHERE companyId = ?))
      OR a.targetId IN (SELECT id FROM companyStations WHERE companyId = ?)
      OR a.targetId IN (SELECT id FROM station_expenses WHERE companyId = ?)
      OR a.targetId IN (SELECT id FROM products WHERE companyId = ?)
    )`
  }
  if (!session.stationId) return '1 = 0'
  params.push(session.userId)
  params.push(session.stationId)
  params.push(session.stationId)
  params.push(session.stationId)
  return `(
    a.actorId = ?
    OR a.targetId IN (SELECT id FROM shifts WHERE stationId = ?)
    OR a.targetId IN (SELECT id FROM station_expenses WHERE stationId = ?)
    OR a.targetId IN (SELECT id FROM attendants WHERE stationId = ?)
  )`
}

auditRouter.get('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const rawLimit = req.query.limit === undefined ? 500 : Number(req.query.limit)
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 2000) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'limit must be an integer between 1 and 2000.' })
    return
  }
  const requestedCompany = typeof req.query.companyId === 'string' ? req.query.companyId : null
  const requestedStation = typeof req.query.stationId === 'string' ? req.query.stationId : null
  if (session.role !== 'superadmin' && requestedCompany && requestedCompany !== session.companyId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Company is outside your account scope.' })
    return
  }
  if (requestedStation && !stationInScope(session, requestedStation)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Station is outside your account scope.' })
    return
  }
  const conditions: string[] = []
  const params: unknown[] = []
  conditions.push(scopeCondition(session, params))
  if (session.role === 'superadmin' && requestedCompany && requestedCompany !== 'ALL') {
    conditions.push("(json_valid(a.meta) AND json_extract(a.meta, '$.companyId') = ?)")
    params.push(requestedCompany)
  }
  if (requestedStation) {
    conditions.push('(a.targetId = ? OR a.targetId IN (SELECT id FROM shifts WHERE stationId = ?) OR a.targetId IN (SELECT id FROM station_expenses WHERE stationId = ?))')
    params.push(requestedStation, requestedStation, requestedStation)
  }
  const actorId = typeof req.query.actorId === 'string' ? req.query.actorId : null
  if (actorId) {
    conditions.push('a.actorId = ?')
    params.push(actorId)
  }
  const action = typeof req.query.action === 'string' ? req.query.action.trim().toUpperCase() : null
  if (action) {
    conditions.push('a.action = ?')
    params.push(action)
  }
  const rows = db.prepare(`SELECT a.* FROM audit_log a WHERE ${conditions.map(condition => `(${condition})`).join(' AND ')} ORDER BY a.timestamp DESC LIMIT ?`).all(...params, rawLimit)
  res.json({ count: rows.length, entries: rows })
})
