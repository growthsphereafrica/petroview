import { Router } from 'express'
import { db } from '../db'
import { authenticate, requireRole, type AuthRequest } from '../middleware'

export const pumpsRouter = Router()

export interface PumpRecord {
  id: string
  stationId: string
  companyId?: string | null
  name: string
  fuels: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

// Helper to get active company fuel codes
function getCompanyFuelCodes(companyId?: string | null): string[] {
  try {
    let query = 'SELECT code FROM products WHERE active = 1'
    const params: Record<string, string> = {}
    if (companyId) {
      query += ' AND (companyId = @companyId OR companyId IS NULL)'
      params.companyId = companyId
    }
    const rows = db.prepare(query).all(params) as { code: string }[]
    if (rows.length > 0) {
      return Array.from(new Set(rows.map(r => r.code.toUpperCase())))
    }
  } catch { /* fallback */ }
  return ['PMS', 'AGO', 'DPK', 'KERO']
}

// GET /api/pumps — list pumps for station or company
pumpsRouter.get('/', authenticate, (req: AuthRequest, res) => {
  const stationId = req.query.stationId ? String(req.query.stationId) : null
  const companyId = req.query.companyId ? String(req.query.companyId) : (req.session?.companyId ?? null)

  const conditions: string[] = ['active = 1']
  const params: Record<string, string> = {}

  if (stationId) {
    conditions.push('stationId = @stationId')
    params.stationId = stationId
  }
  if (companyId && companyId !== 'ALL') {
    conditions.push('(companyId = @companyId OR stationId IN (SELECT id FROM companyStations WHERE companyId = @companyId))')
    params.companyId = companyId
  }

  const rows = db.prepare(`SELECT * FROM pumps WHERE ${conditions.join(' AND ')} ORDER BY name ASC`).all(params) as Array<{
    id: string
    stationId: string
    companyId: string | null
    name: string
    fuels: string
    active: number
    createdAt: string
    updatedAt: string
  }>

  if (rows.length > 0) {
    res.json({
      count: rows.length,
      pumps: rows.map(r => ({
        id: r.id,
        stationId: r.stationId,
        companyId: r.companyId,
        name: r.name,
        fuels: (() => {
          try { return JSON.parse(r.fuels) } catch { return ['PMS', 'AGO'] }
        })(),
        active: Boolean(r.active),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    })
    return
  }

  // If no pumps stored yet for stationId, auto-provision default pumps
  if (stationId) {
    let pumpsCount = 4
    let stationCompanyId = companyId
    try {
      const stRow = db.prepare('SELECT pumpsCount, companyId FROM companyStations WHERE id = ?').get(stationId) as { pumpsCount?: number; companyId?: string } | undefined
      if (stRow?.pumpsCount) pumpsCount = Number(stRow.pumpsCount) || 4
      if (stRow?.companyId) stationCompanyId = stRow.companyId
    } catch { /* fallback */ }

    const availableFuels = getCompanyFuelCodes(stationCompanyId)
    const now = new Date().toISOString()
    const autoPumps: PumpRecord[] = []

    for (let i = 1; i <= pumpsCount; i++) {
      const pId = `pump-${stationId.toLowerCase()}-${i}`
      const pName = `Pump ${i}`
      const fuelsJson = JSON.stringify(availableFuels)
      try {
        db.prepare(
          'INSERT OR REPLACE INTO pumps (id, stationId, companyId, name, fuels, active, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)'
        ).run(pId, stationId, stationCompanyId, pName, fuelsJson, now, now)

        autoPumps.push({
          id: pId,
          stationId,
          companyId: stationCompanyId,
          name: pName,
          fuels: availableFuels,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
      } catch { /* ignore duplicate */ }
    }

    res.json({ count: autoPumps.length, pumps: autoPumps })
    return
  }

  res.json({ count: 0, pumps: [] })
})

// POST /api/pumps — create a pump (HQ or SuperAdmin)
pumpsRouter.post('/', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { stationId, companyId, name, fuels } = (req.body ?? {}) as {
    stationId?: string
    companyId?: string
    name?: string
    fuels?: string[]
  }

  if (!stationId?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'stationId and name are required.' })
    return
  }

  const assignedCompany = companyId || req.session?.companyId || null
  const fuelList = Array.isArray(fuels) && fuels.length > 0 ? fuels : getCompanyFuelCodes(assignedCompany)
  const id = `pump-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  db.prepare(
    'INSERT INTO pumps (id, stationId, companyId, name, fuels, active, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)'
  ).run(id, stationId.trim(), assignedCompany, name.trim(), JSON.stringify(fuelList), now, now)

  res.status(201).json({
    pump: {
      id,
      stationId: stationId.trim(),
      companyId: assignedCompany,
      name: name.trim(),
      fuels: fuelList,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  })
})

// PUT /api/pumps/:id — update pump name or nozzles/fuels
pumpsRouter.put('/:id', authenticate, requireRole('headoffice', 'superadmin', 'supervisor'), (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM pumps WHERE id = ?').get(req.params.id) as {
    id: string
    stationId: string
    companyId: string | null
    name: string
    fuels: string
    active: number
  } | undefined

  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pump not found.' })
    return
  }

  const { name, fuels, active } = req.body ?? {}
  const newName = name !== undefined ? String(name).trim() : existing.name
  const newFuels = Array.isArray(fuels) ? JSON.stringify(fuels) : existing.fuels
  const newActive = active !== undefined ? (active ? 1 : 0) : existing.active
  const now = new Date().toISOString()

  db.prepare(
    'UPDATE pumps SET name = ?, fuels = ?, active = ?, updatedAt = ? WHERE id = ?'
  ).run(newName, newFuels, newActive, now, req.params.id)

  res.json({
    success: true,
    pump: {
      id: existing.id,
      stationId: existing.stationId,
      companyId: existing.companyId,
      name: newName,
      fuels: (() => { try { return JSON.parse(newFuels) } catch { return [] } })(),
      active: Boolean(newActive),
      updatedAt: now,
    },
  })
})

// DELETE /api/pumps/:id — delete a pump
pumpsRouter.delete('/:id', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT id FROM pumps WHERE id = ?').get(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Pump not found.' })
    return
  }
  db.prepare('DELETE FROM pumps WHERE id = ?').run(req.params.id)
  res.json({ success: true, message: 'Pump removed successfully.' })
})
