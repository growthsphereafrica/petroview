import { Router } from 'express'
import { db } from '../db'
import { authenticate, requireRole } from '../middleware'

export const auditRouter = Router()

auditRouter.get('/', authenticate, requireRole('supervisor'), (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1), 1000)
  const firstName = req.query.firstName?.toString()
  const rows = firstName
    ? db.prepare('SELECT * FROM audit_log WHERE actorName LIKE ? ORDER BY timestamp DESC LIMIT ?').all(`%${firstName}%`, limit)
    : db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit)
  res.json({ count: rows.length, entries: rows })
})