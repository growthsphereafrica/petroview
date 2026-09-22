import { Router } from 'express'
import { db } from '../db'
import { authenticate } from '../middleware'

export const auditRouter = Router()

// Open to all authenticated users. Super admin sees everything; HQ/supervisor is scoped by companyId.
auditRouter.get('/', authenticate, (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '500'), 10) || 500, 1), 2000)
  const companyId = req.query.companyId ? String(req.query.companyId) : null
  const stationId = req.query.stationId ? String(req.query.stationId) : null
  const actorId  = req.query.actorId ? String(req.query.actorId) : null
  const action   = req.query.action ? String(req.query.action) : null

  const conditions: string[] = []
  const params: unknown[] = []

  if (companyId && companyId !== 'ALL') {
    // Filter by companyId stored in the meta JSON field or targetId prefix
    conditions.push(`(meta LIKE ? OR targetId LIKE ?)`)
    params.push(`%"companyId":"${companyId}"%`, `${companyId}%`)
  }
  if (stationId) {
    conditions.push(`(meta LIKE ? OR targetId = ?)`)
    params.push(`%"stationId":"${stationId}"%`, stationId)
  }
  if (actorId) {
    conditions.push('actorId = ?')
    params.push(actorId)
  }
  if (action) {
    conditions.push('action = ?')
    params.push(action.toUpperCase())
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ?`).all(...params, limit)
  res.json({ count: rows.length, entries: rows })
})