/**
 * Product & Dynamic Fuel Pricing Service.
 * Allows Super Admin and OMC Head Office to create, edit prices,
 * and activate/deactivate products unique to each OMC or platform-wide.
 */

import { prodDb } from '../infra/db'
import { liveSyncBus } from './liveSyncBus'
import { auditLogRepo } from '../infra/repositories'
import type { Product, ProductCategory } from '../domain/types'

export interface CreateProductInput {
  companyId?: string
  code: string
  name: string
  category: ProductCategory
  unitPrice: number
  unit?: string
  color?: string
  active?: boolean
  actorName?: string
}

export interface UpdateProductInput {
  name?: string
  unitPrice?: number
  category?: ProductCategory
  unit?: string
  color?: string
  active?: boolean
  actorName?: string
}

export const DEFAULT_PRODUCTS: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    code: 'PMS',
    name: 'Super Petrol (PMS)',
    category: 'FUEL',
    unitPrice: 14.8,
    unit: 'Litre',
    color: '#16a34a',
    active: true,
  },
  {
    code: 'AGO',
    name: 'Diesel (AGO)',
    category: 'FUEL',
    unitPrice: 15.2,
    unit: 'Litre',
    color: '#2563eb',
    active: true,
  },
  {
    code: 'RON95',
    name: 'Super XP / V-Power (RON 95)',
    category: 'FUEL',
    unitPrice: 15.9,
    unit: 'Litre',
    color: '#dc2626',
    active: true,
  },
  {
    code: 'AGO-PREM',
    name: 'Super Diesel (Low Sulphur)',
    category: 'FUEL',
    unitPrice: 15.8,
    unit: 'Litre',
    color: '#0284c7',
    active: true,
  },
  {
    code: 'DPK',
    name: 'Kerosene (DPK)',
    category: 'FUEL',
    unitPrice: 13.9,
    unit: 'Litre',
    color: '#ea580c',
    active: true,
  },
  {
    code: 'LPG',
    name: 'LPG / Autogas',
    category: 'LPG',
    unitPrice: 16.5,
    unit: 'kg',
    color: '#ca8a04',
    active: true,
  },
  {
    code: 'PREMIX',
    name: 'Premix Fuel',
    category: 'FUEL',
    unitPrice: 11.2,
    unit: 'Litre',
    color: '#0d9488',
    active: true,
  },
  {
    code: 'LUB-20W50',
    name: 'Engine Oil 20W-50 (4L)',
    category: 'LUBRICANT',
    unitPrice: 160.0,
    unit: 'Bottle (4L)',
    color: '#7c3aed',
    active: true,
  },
  {
    code: 'LUB-15W40',
    name: 'Heavy Duty Diesel Oil 15W-40 (4L)',
    category: 'LUBRICANT',
    unitPrice: 185.0,
    unit: 'Bottle (4L)',
    color: '#4f46e5',
    active: true,
  },
  {
    code: 'LUB-ATF',
    name: 'Automatic Transmission Fluid (1L)',
    category: 'LUBRICANT',
    unitPrice: 65.0,
    unit: 'Bottle (1L)',
    color: '#db2777',
    active: true,
  },
  {
    code: 'LUB-BRAKE',
    name: 'Brake Fluid DOT 4 (500ml)',
    category: 'LUBRICANT',
    unitPrice: 45.0,
    unit: 'Bottle (500ml)',
    color: '#e11d48',
    active: true,
  },
]

export class ProductService {
  /**
   * Ensures standard default fuel items exist if products table is empty.
   */
  async seedDefaultProducts(): Promise<void> {
    const count = await prodDb.products.count()
    if (count === 0) {
      const now = new Date().toISOString()
      for (const def of DEFAULT_PRODUCTS) {
        await prodDb.products.add({
          id: `prod-def-${def.code.toLowerCase()}`,
          companyId: undefined, // Global default
          code: def.code,
          name: def.name,
          category: def.category,
          unitPrice: def.unitPrice,
          unit: def.unit,
          color: def.color,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  }

  /**
   * Lists active products for an OMC forecourt.
   * Merges global active products with company-specific products.
   * If the OMC has customized a product with the same code (e.g. custom PMS price),
   * the OMC's version takes precedence. Products from other OMCs are strictly excluded.
   */
  async listActiveProducts(companyId?: string): Promise<Product[]> {
    await this.seedDefaultProducts()
    const all = await prodDb.products.toArray()

    const activeGlobals = all.filter(p => (!p.companyId || p.companyId === 'GLOBAL') && p.active)
    
    if (!companyId || companyId === 'GLOBAL' || companyId === 'ALL') {
      return activeGlobals.sort((a, b) => a.name.localeCompare(b.name))
    }

    const companyProducts = all.filter(p => p.companyId === companyId && p.active)
    const companyCodes = new Set(companyProducts.map(p => p.code))

    // Include global products that haven't been overridden by company-specific products
    const nonOverriddenGlobals = activeGlobals.filter(g => !companyCodes.has(g.code))

    const merged = [...companyProducts, ...nonOverriddenGlobals]
    return merged.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Retrieves all products for administration.
   * When scoped to a company, returns only that company's products + global products.
   * Products belonging to other OMCs are strictly isolated and never shown.
   */
  async getAllProducts(companyId?: string): Promise<Product[]> {
    await this.seedDefaultProducts()
    const all = await prodDb.products.toArray()

    if (companyId && companyId !== 'ALL') {
      return all
        .filter(p => !p.companyId || p.companyId === 'GLOBAL' || p.companyId === companyId)
        .sort((a, b) => {
          // Put company's own custom products first, then global
          const aIsCompany = a.companyId === companyId ? 0 : 1
          const bIsCompany = b.companyId === companyId ? 0 : 1
          if (aIsCompany !== bIsCompany) return aIsCompany - bIsCompany
          return a.name.localeCompare(b.name)
        })
    }

    return all.sort((a, b) => (a.companyId || '').localeCompare(b.companyId || '') || a.name.localeCompare(b.name))
  }

  /**
   * Returns a map of FuelCode -> UnitPrice (GHS/L) for calculating shift sales and readings.
   */
  async getFuelPriceMap(companyId?: string): Promise<Record<string, number>> {
    const products = await this.listActiveProducts(companyId)
    const map: Record<string, number> = {}
    for (const p of products) {
      map[p.code] = p.unitPrice
    }
    // Guarantee basic fallback keys
    if (!map.PMS) map.PMS = 14.8
    if (!map.AGO) map.AGO = 15.2
    if (!map.DPK) map.DPK = 13.9
    if (!map.KERO) map.KERO = 13.5
    return map
  }

  /**
   * Creates a new product with custom price for an OMC or platform-wide.
   */
  async createProduct(input: CreateProductInput): Promise<Product> {
    const now = new Date().toISOString()
    const code = input.code.trim().toUpperCase()
    const name = input.name.trim()

    if (!code) throw new Error('Product code is required (e.g. PMS, AGO, V-POWER).')
    if (!name) throw new Error('Product name is required.')
    if (input.unitPrice <= 0 || isNaN(input.unitPrice)) {
      throw new Error('Unit price must be a positive number.')
    }

    const id = `prod-${crypto.randomUUID()}`
    const product: Product = {
      id,
      companyId: input.companyId || undefined,
      code,
      name,
      category: input.category || 'FUEL',
      unitPrice: Math.round(input.unitPrice * 100) / 100,
      unit: input.unit || 'Litre',
      color: input.color || (code === 'PMS' ? '#22c55e' : code === 'AGO' ? '#3b82f6' : '#f97316'),
      active: input.active !== false,
      createdAt: now,
      updatedAt: now,
    }

    await prodDb.products.add(product)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'PRODUCT_CREATED',
      actorId: input.companyId || 'SUPER-ADMIN',
      actorName: input.actorName || 'Admin',
      actorRole: 'SUPERVISOR',
      targetId: product.id,
      targetDescription: `Created product ${product.name} (${product.code}) at GHS ${product.unitPrice.toFixed(2)}/${product.unit}`,
      notes: null,
      timestamp: now,
      meta: { companyId: input.companyId || 'GLOBAL', code: product.code, price: product.unitPrice },
    })

    liveSyncBus.publish({ table: 'PRODUCTS' as any, reason: 'INSERT', key: product.id })
    return product
  }

  /**
   * Updates an existing product's details or unit pricing.
   */
  async updateProduct(id: string, updates: UpdateProductInput): Promise<Product> {
    const existing = await prodDb.products.get(id)
    if (!existing) throw new Error(`Product not found with id: ${id}`)

    const now = new Date().toISOString()
    const updated: Product = {
      ...existing,
      name: updates.name !== undefined ? updates.name.trim() : existing.name,
      unitPrice:
        updates.unitPrice !== undefined
          ? Math.round(Number(updates.unitPrice) * 100) / 100
          : existing.unitPrice,
      category: updates.category !== undefined ? updates.category : existing.category,
      unit: updates.unit !== undefined ? updates.unit : existing.unit,
      color: updates.color !== undefined ? updates.color : existing.color,
      active: updates.active !== undefined ? updates.active : existing.active,
      updatedAt: now,
    }

    if (updated.unitPrice <= 0 || isNaN(updated.unitPrice)) {
      throw new Error('Unit price must be a positive number.')
    }

    await prodDb.products.put(updated)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'PRODUCT_UPDATED',
      actorId: existing.companyId || 'SUPER-ADMIN',
      actorName: updates.actorName || 'Admin',
      actorRole: 'SUPERVISOR',
      targetId: updated.id,
      targetDescription: `Updated product ${updated.name} (${updated.code}) price to GHS ${updated.unitPrice.toFixed(2)}/${updated.unit} (Active: ${updated.active})`,
      notes: null,
      timestamp: now,
      meta: { code: updated.code, price: updated.unitPrice, active: updated.active },
    })

    liveSyncBus.publish({ table: 'PRODUCTS' as any, reason: 'UPDATE', key: updated.id })
    return updated
  }

  /**
   * Deletes a product by ID.
   */
  async deleteProduct(id: string, actorName = 'Admin'): Promise<void> {
    const existing = await prodDb.products.get(id)
    if (!existing) return

    await prodDb.products.delete(id)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'PRODUCT_DELETED',
      actorId: existing.companyId || 'SUPER-ADMIN',
      actorName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `Deleted product ${existing.name} (${existing.code})`,
      notes: null,
      timestamp: new Date().toISOString(),
    })

    liveSyncBus.publish({ table: 'PRODUCTS' as any, reason: 'DELETE', key: id })
  }
}

export const productService = new ProductService()
