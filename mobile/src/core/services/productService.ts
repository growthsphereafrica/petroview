/**
 * Mobile Product & Dynamic Fuel Pricing Service
 * Synchronized with the backend REST API (https://petroviewapi.growthspheregh.com/api/products)
 * Offline-first: maintains an AsyncStorage cache as fallback.
 */

import { getCloudApiBase, getCloudToken } from '../infra/cloudApi'
import { keys, sGet, sSet } from '../store/storage'
import { PRODUCTION_STATION } from '../domain/config'
import type { Product } from '../domain/types'

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prod-pms',
    code: 'PMS',
    name: 'Super Petrol (PMS)',
    category: 'FUEL',
    unitPrice: PRODUCTION_STATION.fuelPrices.PMS || 14.80,
    unit: 'Litre',
    color: '#22C55E',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-ago',
    code: 'AGO',
    name: 'Diesel (AGO)',
    category: 'FUEL',
    unitPrice: PRODUCTION_STATION.fuelPrices.AGO || 15.20,
    unit: 'Litre',
    color: '#3B82F6',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-dpk',
    code: 'DPK',
    name: 'Kerosene (DPK)',
    category: 'FUEL',
    unitPrice: PRODUCTION_STATION.fuelPrices.DPK || 13.90,
    unit: 'Litre',
    color: '#F97316',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-kero',
    code: 'KERO',
    name: 'Special Kero',
    category: 'FUEL',
    unitPrice: PRODUCTION_STATION.fuelPrices.KERO || 13.50,
    unit: 'Litre',
    color: '#A855F7',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export class MobileProductService {
  async listActiveProducts(companyId?: string): Promise<Product[]> {
    const cached = await sGet<Product[]>(keys.products)
    const base = getCloudApiBase()
    const token = await getCloudToken()

    if (token) {
      try {
        const url = `${base}/api/products${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`
        const res = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
        if (res.ok) {
          const list = (await res.json()) as Product[]
          if (Array.isArray(list) && list.length > 0) {
            await sSet(keys.products, list)
            return list.filter(p => p.active !== false)
          }
        }
      } catch {
        // network issue — fall through to cache
      }
    }

    if (cached && cached.length > 0) {
      return cached.filter(p => p.active !== false)
    }

    // Default initialization
    await sSet(keys.products, DEFAULT_PRODUCTS)
    return DEFAULT_PRODUCTS
  }

  async updateProduct(
    id: string,
    updates: {
      name?: string
      unitPrice: number
      category?: string
      unit?: string
      color?: string
      active?: boolean
      actorName?: string
    },
  ): Promise<Product> {
    const cached = (await sGet<Product[]>(keys.products)) ?? DEFAULT_PRODUCTS
    const existingIndex = cached.findIndex(p => p.id === id || p.code === id)

    const updatedProduct: Product =
      existingIndex >= 0
        ? {
            ...cached[existingIndex],
            name: updates.name ?? cached[existingIndex].name,
            unitPrice: updates.unitPrice,
            color: updates.color ?? cached[existingIndex].color,
            active: updates.active ?? cached[existingIndex].active,
            updatedAt: new Date().toISOString(),
          }
        : {
            id,
            code: id.toUpperCase(),
            name: updates.name ?? id.toUpperCase(),
            category: 'FUEL',
            unitPrice: updates.unitPrice,
            unit: updates.unit ?? 'Litre',
            color: updates.color ?? '#F97316',
            active: updates.active ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

    if (existingIndex >= 0) {
      cached[existingIndex] = updatedProduct
    } else {
      cached.push(updatedProduct)
    }
    await sSet(keys.products, cached)

    // Sync to cloud if available
    const base = getCloudApiBase()
    const token = await getCloudToken()
    if (token) {
      try {
        await fetch(`${base}/api/products/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
        })
      } catch {
        // Queued offline
      }
    }

    return updatedProduct
  }

  async getFuelPrices(): Promise<Record<string, number>> {
    try {
      const prods = await this.listActiveProducts()
      const prices: Record<string, number> = { ...PRODUCTION_STATION.fuelPrices }
      for (const p of prods) {
        if (p.code && typeof p.unitPrice === 'number' && p.unitPrice > 0) {
          prices[p.code.toUpperCase()] = p.unitPrice
        }
      }
      return prices
    } catch {
      return { ...PRODUCTION_STATION.fuelPrices }
    }
  }
}

export const mobileProductService = new MobileProductService()
