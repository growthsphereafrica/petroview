import { Router } from 'express'
import { db } from '../db'
import { newToken } from '../auth'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

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

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function rowToProduct(row: ProductRow) {
  return { ...row, active: Number(row.active) === 1 }
}

function requestedCompany(session: SessionClaims, value: unknown): string | null {
  if (session.role === 'superadmin') {
    const companyId = typeof value === 'string' ? value.trim() : ''
    return companyId && companyId !== 'ALL' ? companyId : null
  }
  return session.companyId
}

function canManageProduct(session: SessionClaims, product: Pick<ProductRow, 'companyId'>): boolean {
  if (session.role === 'superadmin') return true
  return !!session.companyId && product.companyId === session.companyId
}

function productCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z0-9][A-Z0-9_-]{1,30}$/.test(code)) throw new Error('Invalid product code.')
  return code
}

function productName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 120) throw new Error('Invalid product name.')
  return name
}

function priceValue(value: unknown): number {
  const price = Number(value)
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) throw new Error('unitPrice must be a positive finite number.')
  return Math.round(price * 100) / 100
}

function audit(req: AuthRequest, action: string, product: ProductRow, notes: string | null, now: string): void {
  const session = sessionOf(req)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(), action, session.userId, session.fullName, session.role.toUpperCase(), product.id, `Product ${product.code} (${product.name})`, notes, now, JSON.stringify({ companyId: product.companyId, price: product.unitPrice }),
  )
}

productsRouter.get('/', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const requested = typeof req.query.companyId === 'string' ? req.query.companyId : null
  const companyId = requestedCompany(session, requested)
  const showAll = req.query.all === '1'
  if (showAll && session.role !== 'superadmin') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Only Super Admin can list all products.' })
    return
  }
  let rows: ProductRow[]
  if (showAll || !companyId) {
    rows = db.prepare('SELECT * FROM products ORDER BY name ASC LIMIT 5000').all() as ProductRow[]
  } else {
    rows = db.prepare('SELECT * FROM products WHERE companyId IS NULL OR companyId = ? ORDER BY CASE WHEN companyId IS NULL THEN 1 ELSE 0 END, name ASC LIMIT 5000').all(companyId) as ProductRow[]
  }
  res.json(rows.map(rowToProduct))
})

productsRouter.get('/active', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const companyId = requestedCompany(session, typeof req.query.companyId === 'string' ? req.query.companyId : null)
  let rows: ProductRow[]
  if (companyId) {
    rows = db.prepare('SELECT * FROM products WHERE active = 1 AND (companyId IS NULL OR companyId = ?) ORDER BY CASE WHEN companyId IS NULL THEN 1 ELSE 0 END, name ASC LIMIT 5000').all(companyId) as ProductRow[]
  } else {
    rows = db.prepare('SELECT * FROM products WHERE active = 1 AND companyId IS NULL ORDER BY name ASC LIMIT 5000').all() as ProductRow[]
  }
  res.json(rows.map(rowToProduct))
})

productsRouter.post('/', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  let code: string
  let name: string
  let price: number
  try {
    code = productCode(body.code)
    name = productName(body.name)
    price = priceValue(body.unitPrice)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid product data.' })
    return
  }
  const requestedCompany = typeof body.companyId === 'string' && body.companyId.trim() ? body.companyId.trim() : null
  const companyId = session.role === 'superadmin' ? requestedCompany : session.companyId
  if (session.role !== 'superadmin' && (!companyId || requestedCompany !== companyId)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only create products for your company.' })
    return
  }
  if (db.prepare('SELECT 1 FROM products WHERE companyId IS ? AND code = ? COLLATE NOCASE').get(companyId, code)) {
    res.status(409).json({ error: 'CONFLICT', message: 'A product with that code already exists for this company.' })
    return
  }
  const id = `prod-${newToken()}`
  const now = new Date().toISOString()
  const row = {
    id,
    companyId,
    code,
    name,
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim().slice(0, 40) : 'FUEL',
    unitPrice: price,
    unit: typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim().slice(0, 30) : 'Litre',
    color: typeof body.color === 'string' && body.color.trim() ? body.color.trim().slice(0, 20) : '#F97316',
    active: body.active === false ? 0 : 1,
  }
  try {
    db.prepare('INSERT INTO products (id, companyId, code, name, category, unitPrice, unit, color, active, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(row.id, row.companyId, row.code, row.name, row.category, row.unitPrice, row.unit, row.color, row.active, now, now)
  } catch {
    res.status(409).json({ error: 'CONFLICT', message: 'A product with that code already exists for this company.' })
    return
  }
  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow
  audit(req, 'PRODUCT_CREATED', created, null, now)
  res.status(201).json(rowToProduct(created))
})

productsRouter.put('/:id', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as ProductRow | undefined
  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' })
    return
  }
  if (!canManageProduct(session, existing)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot modify this product.' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  let name: string
  let price: number
  try {
    name = body.name === undefined ? existing.name : productName(body.name)
    price = body.unitPrice === undefined ? existing.unitPrice : priceValue(body.unitPrice)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid product data.' })
    return
  }
  const now = new Date().toISOString()
  const updated = db.prepare(`UPDATE products SET name = ?, unitPrice = ?, category = ?, unit = ?, color = ?, active = ?, updatedAt = ? WHERE id = ?`).run(
    name,
    price,
    body.category !== undefined ? String(body.category).trim().slice(0, 40) : existing.category,
    body.unit !== undefined ? String(body.unit).trim().slice(0, 30) : existing.unit,
    body.color !== undefined ? String(body.color).trim().slice(0, 20) : existing.color,
    body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
    now,
    existing.id,
  )
  if (updated.changes !== 1) {
    res.status(409).json({ error: 'CONFLICT', message: 'Product was not updated.' })
    return
  }
  const result = db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id) as ProductRow
  audit(req, 'PRODUCT_UPDATED', result, null, now)
  res.json(rowToProduct(result))
})

productsRouter.delete('/:id', authenticate, requireRole('headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as ProductRow | undefined
  if (!existing) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Product not found.' })
    return
  }
  if (!canManageProduct(session, existing)) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot delete this product.' })
    return
  }
  db.prepare('UPDATE products SET active = 0, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), existing.id)
  audit(req, 'PRODUCT_DELETED', existing, 'Product deactivated', new Date().toISOString())
  res.json({ success: true, id: existing.id, code: existing.code, name: existing.name })
})

productsRouter.get('/price-map', authenticate, (req: AuthRequest, res) => {
  const session = sessionOf(req)
  const companyId = requestedCompany(session, typeof req.query.companyId === 'string' ? req.query.companyId : null)
  const rows = companyId
    ? db.prepare('SELECT code, unitPrice FROM products WHERE active = 1 AND (companyId IS NULL OR companyId = ?)').all(companyId) as Array<{ code: string; unitPrice: number }>
    : db.prepare('SELECT code, unitPrice FROM products WHERE active = 1 AND companyId IS NULL').all() as Array<{ code: string; unitPrice: number }>
  const map: Record<string, number> = {}
  for (const row of rows) {
    if (Number.isFinite(row.unitPrice) && row.unitPrice > 0) map[row.code.toUpperCase()] = row.unitPrice
  }
  res.json(map)
})
