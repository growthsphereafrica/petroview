import { Router } from 'express'
import { db, deserializeShift, type ShiftRow, type ShiftStatus } from '../db'
import { authenticate } from '../middleware'

export const shiftsRouter = Router()

const STATUSES = new Set(['OPEN', 'CLOSED', 'REVIEWED', 'APPROVED', 'REJECTED'])

shiftsRouter.get('/', authenticate, (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase().split(',') : null
  const stationId = req.query.station ? String(req.query.station) : null
  const filter: string[] = []
  const params: Record<string, string> = {}

  let conditions = ''
  if (status && status.every(s => STATUSES.has(s as ShiftStatus))) {
    conditions += ' WHERE status IN (' + status.map((_, i) => `@s${i}`).join(',') + ')'
    status.forEach((s, i) => (params[`s${i}`] = s))
  }
  if (stationId) {
    conditions += conditions ? ' AND stationId = @station' : ' WHERE stationId = @station'
    params.station = stationId
  }
  void filter

  const rows = db.prepare(`SELECT * FROM shifts${conditions} ORDER BY openedAt DESC LIMIT 500`).all(params) as ShiftRow[]
  res.json({ count: rows.length, shifts: rows.map(deserializeShift) })
})

shiftsRouter.get('/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  const transactions = db.prepare('SELECT * FROM transactions WHERE shiftId = ? ORDER BY recordedAt').all(req.params.id)
  res.json({ shift: deserializeShift(row as ShiftRow), transactions })
})