import { Router } from 'express'
import { db } from '../db'
import { authenticate, requireRole, type AuthRequest } from '../middleware'
import { newToken } from '../auth'

export const productsRouter = Router()

interface ProductRow {
  id: string
  companyId: string | null
  code: string
  name: string
  category: string
  unitPrice: number
  unit: string
  color: string
  active: number
  createdAt: string
  updatedAt: string
}

function rowToProduct(r: ProductRow) {
  return { ...r, active: r.active === 1 }
}

// ── GET /api/products ─────────────────────────────────────────────────────────
// Returns global products + optional company-specific products.
// ?companyId=  filter to a specific OMC (also returns global products merged)
// ?all=1       return every product regardless of companyId (super admin view)
productsRouter.get('/', (req, res) => {
  const companyId = req.query.companyId ? String(req.query.companyId) : null
  const showAll   = req.query.all === '1'

  let rows: ProductRow[]

  if (showAll) {
    rows = db.prepare('SELECT * FROM products ORDER BY name ASC').all() as ProductRow[]
  } else if (companyId && companyId !== 'ALL') {
    // Global products that are not overridden by this company + company-specific products
    rows = db.prepare(`
      SELECT * FROM products
      WHERE (companyId IS NULL OR companyId = ?)
      ORDER BY CASE WHEN companyId IS NULL THEN 1 ELSE 0 END, name ASC
    `).all(companyId) as ProductRow[]
  } else {
    // Default: global catalog only
    rows = db.prepare(`
      SELECT * FROM products
      WHERE companyId IS NULL
      ORDER BY name ASC
    `).all() as ProductRow[]
  }

  res.json(rows.map(rowToProduct))
})

// ── GET /api/products/active ──────────────────────────────────────────────────
// Returns only active products for forecourt use (attendants, supervisors).
// Merges global + company-specific, with company version taking precedence.
productsRouter.get('/active', (req, res) => {
  const companyId = req.query.companyId ? String(req.query.companyId) : null

  if (companyId && companyId !== 'GLOBAL') {
    // Company-specific products override global ones with the same code
    const companyProds = db.prepare(`
      SELECT * FROM products WHERE companyId = ? AND active = 1
    `).all(companyId) as ProductRow[]

    const companyCodes = new Set(companyProds.map(p => p.code))

    const globalProds = db.prepare(`
      SELECT * FROM products WHERE companyId IS NULL AND active = 1
    `).all() as ProductRow[]

    const merged = [
      ...companyProds,
      ...globalProds.filter(g => !companyCodes.has(g.code)),
    ].sort((a, b) => a.name.localeCompare(b.name))

    res.json(merged.map(rowToProduct))
    return
  }

  const rows = db.prepare(`
    SELECT * FROM products WHERE companyId IS NULL AND active = 1 ORDER BY name ASC
  `).all() as ProductRow[]

  res.json(rows.map(rowToProduct))
})

// ── POST /api/products ────────────────────────────────────────────────────────
// Create a new product (superadmin or headoffice).
productsRouter.post('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { companyId, code, name, category, unitPrice, unit, color, active } = req.body ?? {}

  if (!code?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'code and name are required.' })
    return
  }
  const price = Number(unitPrice)
  if (isNaN(price) || price <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'unitPrice must be a positive number.' })
    return
  }

  const now = new Date().toISOString()
  const id = `prod-${newToken().slice(0, 12)}`
  const cleanCode = String(code).trim().toUpperCase()
  const cleanCompanyId = companyId?.trim() || null

  db.prepare(`
    INSERT INTO products (id, companyId, code, name, category, unitPrice, unit, color, active, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    cleanCompanyId,
    cleanCode,
    String(name).trim(),
    String(category || 'FUEL'),
    Math.round(price * 100) / 100,
    String(unit || 'Litre').trim(),
    String(color || '#F97316').trim(),
    active === false ? 0 : 1,
    now,
    now,
  )

  // Audit
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), 'PRODUCT_CREATED', req.session?.userId ?? '', req.session?.fullName ?? 'Admin', req.session?.role?.toUpperCase() ?? 'SUPERADMIN', id, `Created product ${cleanCode} (${name})`, null, now, JSON.stringify({ companyId: cleanCompanyId, price }))

  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow
  res.status(201).json(rowToProduct(created))
})

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
// Update a product's name, price, unit, color, or active status.
productsRouter.put('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined

  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' })
    return
  }

  const { name, unitPrice, category, unit, color, active } = req.body ?? {}
  const now = new Date().toISOString()

  const newPrice = unitPrice !== undefined ? Number(unitPrice) : existing.unitPrice
  if (isNaN(newPrice) || newPrice <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'unitPrice must be a positive number.' })
    return
  }

  db.prepare(`
    UPDATE products SET
      name = ?,
      unitPrice = ?,
      category = ?,
      unit = ?,
      color = ?,
      active = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(
    name !== undefined ? String(name).trim() : existing.name,
    Math.round(newPrice * 100) / 100,
    category !== undefined ? String(category) : existing.category,
    unit !== undefined ? String(unit).trim() : existing.unit,
    color !== undefined ? String(color).trim() : existing.color,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    now,
    id,
  )

  // Audit
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), 'PRODUCT_UPDATED', req.session?.userId ?? '', req.session?.fullName ?? 'Admin', req.session?.role?.toUpperCase() ?? 'SUPERADMIN', id, `Updated product ${existing.code} — price: GHS ${newPrice.toFixed(2)}`, null, now, null)

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow
  res.json(rowToProduct(updated))
})

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
// Permanently deletes a product. Deleted products are NEVER auto-restored.
productsRouter.delete('/:id', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const { id } = req.params
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined

  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' })
    return
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(id)

  // Audit
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), 'PRODUCT_DELETED', req.session?.userId ?? '', req.session?.fullName ?? 'Admin', req.session?.role?.toUpperCase() ?? 'SUPERADMIN', id, `Deleted product ${existing.code} (${existing.name})`, null, now, null)

  res.json({ success: true, id, code: existing.code, name: existing.name })
})

// ── GET /api/products/price-map ───────────────────────────────────────────────
// Returns { CODE: price } map for shift calculations. Used by attendants.
productsRouter.get('/price-map', (req, res) => {
  const companyId = req.query.companyId ? String(req.query.companyId) : null

  let rows: ProductRow[]
  if (companyId && companyId !== 'GLOBAL') {
    const companyProds = db.prepare('SELECT * FROM products WHERE companyId = ? AND active = 1').all(companyId) as ProductRow[]
    const companyCodes = new Set(companyProds.map(p => p.code))
    const globalProds = db.prepare('SELECT * FROM products WHERE companyId IS NULL AND active = 1').all() as ProductRow[]
    rows = [...companyProds, ...globalProds.filter(g => !companyCodes.has(g.code))]
  } else {
    rows = db.prepare('SELECT * FROM products WHERE companyId IS NULL AND active = 1').all() as ProductRow[]
  }

  const map: Record<string, number> = {}
  for (const r of rows) {
    map[r.code] = r.unitPrice
  }
  // Safety fallbacks if core fuels were deleted
  if (!map.PMS)  map.PMS  = 14.8
  if (!map.AGO)  map.AGO  = 15.2
  if (!map.DPK)  map.DPK  = 13.9
  if (!map.KERO) map.KERO = 13.5

  res.json(map)
})
