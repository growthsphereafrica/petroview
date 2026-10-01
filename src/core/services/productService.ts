/**
 * Product & Dynamic Fuel Pricing Service — API-backed.
 *
 * All reads and writes go directly to the backend REST API
 * (https://petroviewapi.growthspheregh.com/api/products) so that changes
 * made by the Super Admin are immediately visible to ALL users on ALL devices.
 *
 * A localStorage cache is maintained as a read-through fallback for
 * offline resilience — the cache is refreshed on every successful API call.
 */

import { liveSyncBus } from './liveSyncBus'
import { getBackendUrl } from '../../services/backendApiService'
import type { Product, ProductCategory } from '../domain/types'

const API_BASE = getBackendUrl()
const CACHE_KEY = 'pv_products_cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ── Local cache helpers ───────────────────────────────────────────────────────

interface CacheEntry {
  ts: number
  products: Product[]
}

function readCache(): Product[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null
    return entry.products
  } catch {
    return null
  }
}

function writeCache(products: Product[]): void {
  try {
    const entry: CacheEntry = { ts: Date.now(), products }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // storage quota — non-fatal
  }
}

function invalidateCache(): void {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* noop */ }
}

// ── API helpers ───────────────────────────────────────────────────────────────

function getAuthHeader(): Record<string, string> {
  // The session token is saved to localStorage by the unified login screen.
  try {
    const raw = localStorage.getItem('mvp_active_session')
    if (raw) {
      const session = JSON.parse(raw) as { token?: string }
      if (session?.token) return { Authorization: `Bearer ${session.token}` }
    }
  } catch { /* noop */ }
  return {}
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${API_BASE}/api/products${path}`
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Input interfaces ──────────────────────────────────────────────────────────

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

// ── ProductService ────────────────────────────────────────────────────────────

export class ProductService {
  /**
   * Lists ALL products for admin views.
   * Super Admin gets everything (all=1).
   * OMC-scoped admins get global + their company products.
   */
  async getAllProducts(companyId?: string): Promise<Product[]> {
    if (!API_BASE) return this._fallback()
    try {
      const isAll = !companyId || companyId === 'ALL'
      const qs = isAll ? '?all=1' : `?companyId=${encodeURIComponent(companyId!)}`
      const products = await apiFetch<Product[]>(qs)
      writeCache(products)
      return products
    } catch (err) {
      console.warn('[productService] getAllProducts fallback to cache:', err)
      return this._fallback()
    }
  }

  /**
   * Lists active products visible on a forecourt.
   * Merges global + company-specific (company takes precedence).
   */
  async listActiveProducts(companyId?: string): Promise<Product[]> {
    if (!API_BASE) return this._fallback()
    try {
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
      const products = await apiFetch<Product[]>(`/active${qs}`)
      writeCache(products)
      return products
    } catch (err) {
      console.warn('[productService] listActiveProducts fallback to cache:', err)
      return this._fallback()
    }
  }

  /**
   * Returns a { CODE: price } map used for shift sales calculations.
   */
  async getFuelPriceMap(companyId?: string): Promise<Record<string, number>> {
    if (!API_BASE) {
      const prods = await this._fallback()
      return this._toMap(prods)
    }
    try {
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
      return await apiFetch<Record<string, number>>(`/price-map${qs}`)
    } catch (err) {
      console.warn('[productService] getFuelPriceMap fallback:', err)
      const prods = await this._fallback()
      return this._toMap(prods)
    }
  }

  /**
   * Creates a new product. Change is immediately global (stored on backend).
   */
  async createProduct(input: CreateProductInput): Promise<Product> {
    if (!API_BASE) throw new Error('No backend configured.')
    const product = await apiFetch<Product>('', {
      method: 'POST',
      body: JSON.stringify({
        companyId: input.companyId || null,
        code: input.code,
        name: input.name,
        category: input.category,
        unitPrice: input.unitPrice,
        unit: input.unit ?? 'Litre',
        color: input.color ?? '#F97316',
        active: input.active !== false,
      }),
    })
    invalidateCache()
    liveSyncBus.publish({ table: 'PRODUCTS' as any, reason: 'INSERT', key: product.id })
    return product
  }

  /**
   * Updates an existing product. Change is immediately global.
   */
  async updateProduct(id: string, updates: UpdateProductInput): Promise<Product> {
    if (!API_BASE) throw new Error('No backend configured.')
    const product = await apiFetch<Product>(`/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: updates.name,
        unitPrice: updates.unitPrice,
        category: updates.category,
        unit: updates.unit,
        color: updates.color,
        active: updates.active,
      }),
    })
    invalidateCache()
    liveSyncBus.publish({ table: 'PRODUCTS' as any, reason: 'UPDATE', key: product.id })
    return product
  }

  /**
   * Permanently deletes a product. It will NOT be re-seeded on restart.
   */
  async deleteProduct(id: string, _actorName = 'Admin'): Promise<void> {
    if (!API_BASE) throw new Error('No backend configured.')
    await apiFetch<{ success: boolean }>(`/${id}`, { method: 'DELETE' })
    invalidateCache()
    liveSyncBus.publish({ table: 'PRODUCTS' as any, reason: 'DELETE', key: id })
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Offline fallback: return cached products only.
   * Returns an empty array if there is no valid cache — this ensures that
   * products deleted by HQ are NOT resurrected from hard-coded defaults.
   * The UI must handle an empty product list gracefully.
   */
  private async _fallback(): Promise<Product[]> {
    const cached = readCache()
    return cached ?? []
  }

  private _toMap(products: Product[]): Record<string, number> {
    const map: Record<string, number> = {}
    for (const p of products) {
      if (p.active) map[p.code] = p.unitPrice
    }
    return map
  }
}

export const productService = new ProductService()
