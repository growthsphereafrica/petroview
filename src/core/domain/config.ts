/**
 * Station configuration, fuel pricing and pump registry for the production core.
 * In a real deployment this would be provisioned per-station from the backend.
 */

import type { FuelCode, PaymentMethod } from './types'

export interface ProductionStationConfig {
  id: string
  name: string
  code: string
  location: string
  currency: string
  fuelPrices: Record<FuelCode, number>
  paymentMethods: PaymentMethod[]
}

export interface PumpNozzleConfig {
  id: string
  nozzleIndex: number
  name: string
  fuelCode: FuelCode
  active: boolean
}

export interface ProductionPumpConfig {
  id: string
  name: string
  fuels: FuelCode[]
  nozzles?: PumpNozzleConfig[]
}

export function deriveNozzlesForPump(pump: ProductionPumpConfig): PumpNozzleConfig[] {
  const fuels = Array.isArray(pump.fuels) ? pump.fuels : ['PMS']
  if (pump.nozzles && Array.isArray(pump.nozzles) && pump.nozzles.length > 0) {
    return pump.nozzles.map((nz, idx) => ({
      id: nz.id || `${pump.id}-noz-${idx + 1}`,
      nozzleIndex: idx + 1,
      name: nz.name && nz.name.trim() ? nz.name.trim() : (fuels.length === 2 ? (idx === 0 ? 'Side 1' : 'Side 2') : `Nozzle ${idx + 1}`),
      fuelCode: nz.fuelCode || fuels[idx] || 'PMS',
      active: nz.active !== false,
    }))
  }
  return fuels.map((f, idx) => {
    const isDup = fuels.filter(x => x === f).length > 1
    const name = isDup ? `Side ${idx + 1} (${f})` : `Nozzle ${idx + 1} (${f})`
    return {
      id: `${pump.id}-noz-${idx + 1}`,
      nozzleIndex: idx + 1,
      name,
      fuelCode: f,
      active: true,
    }
  })
}

export interface ProductionStationEntry {
  id: string
  name: string
  code: string
  location: string
  region: string
  pumps: number
}

export const PRODUCTION_STATION: ProductionStationConfig = {
  id: 'STN-01',
  name: 'Forecourt Station',
  code: 'STN-01',
  location: 'Station Forecourt',
  currency: 'GHS',
  fuelPrices: {
    PMS: 14.8,
    AGO: 15.2,
    DPK: 13.9,
    KERO: 13.5,
  },
  paymentMethods: ['CASH', 'MOMO', 'VOUCHER', 'CREDIT'],
}

export const PRODUCTION_PUMPS: ProductionPumpConfig[] = [
  { id: 'pump-1', name: 'Pump 1', fuels: ['PMS', 'AGO'] },
  { id: 'pump-2', name: 'Pump 2', fuels: ['PMS', 'AGO'] },
  { id: 'pump-3', name: 'Pump 3', fuels: ['PMS', 'AGO'] },
  { id: 'pump-4', name: 'Pump 4', fuels: ['PMS', 'AGO'] },
]

const PUMPS_STORAGE_KEY = 'pv_dynamic_pumps_cache'
const dynamicPumpsMap = new Map<string, ProductionPumpConfig[]>()

function readCachedPumps(): Record<string, ProductionPumpConfig[]> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PUMPS_STORAGE_KEY) : null
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

function writeCachedPumps(stationId: string, pumps: ProductionPumpConfig[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    const cache = readCachedPumps()
    cache[stationId] = pumps
    cache[stationId.toLowerCase()] = pumps
    localStorage.setItem(PUMPS_STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // quota exceeded / non-fatal
  }
}

export function registerStationPumps(stationId: string, pumps: ProductionPumpConfig[]): void {
  if (stationId && Array.isArray(pumps) && pumps.length > 0) {
    dynamicPumpsMap.set(stationId, pumps)
    dynamicPumpsMap.set(stationId.toLowerCase(), pumps)
    writeCachedPumps(stationId, pumps)
  }
}

export function getStationPumps(stationId?: string): ProductionPumpConfig[] {
  if (stationId) {
    const norm = stationId.trim()
    if (dynamicPumpsMap.has(norm)) return dynamicPumpsMap.get(norm)!
    if (dynamicPumpsMap.has(norm.toLowerCase())) return dynamicPumpsMap.get(norm.toLowerCase())!
    const cache = readCachedPumps()
    if (cache[norm]) {
      dynamicPumpsMap.set(norm, cache[norm])
      return cache[norm]
    }
    if (cache[norm.toLowerCase()]) {
      dynamicPumpsMap.set(norm, cache[norm.toLowerCase()])
      return cache[norm.toLowerCase()]
    }
  }
  const cache = readCachedPumps()
  const cachedKeys = Object.keys(cache)
  if (cachedKeys.length > 0 && cache[cachedKeys[0]]?.length > 0) {
    return cache[cachedKeys[0]]
  }
  return PRODUCTION_PUMPS
}

export function findPumpByIdOrName(
  pumps: ProductionPumpConfig[],
  pumpId?: string | null,
  pumpName?: string | null,
): ProductionPumpConfig | undefined {
  if (!pumps || pumps.length === 0) return undefined
  if (pumpId) {
    const exact = pumps.find(p => p.id === pumpId)
    if (exact) return exact
  }
  if (pumpName) {
    const byName = pumps.find(p => p.name.trim().toLowerCase() === pumpName.trim().toLowerCase())
    if (byName) return byName
  }
  if (pumpId) {
    const directNum = pumpId.match(/^pump-(\d+)$/i)
    if (directNum) {
      const n = directNum[1]
      const byNum = pumps.find(p => p.id === `pump-${n}` || p.name.trim().toLowerCase() === `pump ${n}`)
      if (byNum) return byNum
    }
  }
  return undefined
}

export const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Eastern',
  'Western',
  'Western North',
  'Central',
  'Volta',
  'Oti',
  'Northern',
  'North East',
  'Savannah',
  'Upper East',
  'Upper West',
  'Bono',
  'Bono East',
  'Ahafo',
] as const

export type GhanaRegion = typeof GHANA_REGIONS[number]

export const PRODUCTION_STATIONS: ProductionStationEntry[] = []

const dynamicStationMap = new Map<string, ProductionStationEntry>()

export function registerDynamicStations(stations: { id: string; name: string; code?: string; location?: string; region?: string; pumpsCount?: number; pumps?: number }[]): void {
  for (const st of stations) {
    dynamicStationMap.set(st.id, {
      id: st.id,
      name: st.name,
      code: st.code || st.id,
      location: st.location || 'Forecourt Station',
      region: st.region || 'Branch Region',
      pumps: st.pumpsCount || st.pumps || 4,
    })
  }
}

export function getStationById(stationId: string): ProductionStationEntry {
  if (dynamicStationMap.has(stationId)) {
    return dynamicStationMap.get(stationId)!
  }
  const staticFound = PRODUCTION_STATIONS.find(s => s.id === stationId)
  if (staticFound) return staticFound
  return {
    id: stationId,
    name: stationId.startsWith('STN-') ? `Station ${stationId.replace(/^STN-/, '')}` : stationId,
    code: stationId,
    location: 'Forecourt Station',
    region: 'Active Region',
    pumps: 4,
  }
}

export function getStationName(stationId: string): string {
  if (!stationId) return 'Main Station'
  if (dynamicStationMap.has(stationId)) {
    return dynamicStationMap.get(stationId)!.name
  }
  const staticFound = PRODUCTION_STATIONS.find(s => s.id === stationId)
  if (staticFound) return staticFound.name
  return stationId.startsWith('STN-') ? `Station ${stationId.replace(/^STN-/, '')}` : stationId
}

export const FUEL_META: Record<string, { label: string; shortLabel: string; color: string; bg: string }> = {
  PMS: { label: 'Super Petrol (PMS)', shortLabel: 'Super (PMS)', color: '#16a34a', bg: 'bg-emerald-500' },
  AGO: { label: 'Diesel (AGO)', shortLabel: 'Diesel (AGO)', color: '#2563eb', bg: 'bg-blue-600' },
  RON95: { label: 'Super XP / V-Power (RON 95)', shortLabel: 'RON 95', color: '#dc2626', bg: 'bg-red-600' },
  'AGO-PREM': { label: 'Super Diesel (Low Sulphur)', shortLabel: 'Prem AGO', color: '#0284c7', bg: 'bg-sky-600' },
  DPK: { label: 'Kerosene (DPK)', shortLabel: 'Kerosene (DPK)', color: '#ea580c', bg: 'bg-orange-500' },
  KERO: { label: 'Kerosene (KERO)', shortLabel: 'KERO', color: '#9333ea', bg: 'bg-purple-600' },
  LPG: { label: 'LPG / Autogas', shortLabel: 'LPG', color: '#ca8a04', bg: 'bg-yellow-600' },
  PREMIX: { label: 'Premix Fuel', shortLabel: 'Premix', color: '#0d9488', bg: 'bg-teal-600' },
  'LUB-20W50': { label: 'Engine Oil 20W-50 (4L)', shortLabel: '20W-50', color: '#7c3aed', bg: 'bg-violet-600' },
  'LUB-15W40': { label: 'Diesel Oil 15W-40 (4L)', shortLabel: '15W-40', color: '#4f46e5', bg: 'bg-indigo-600' },
  'LUB-ATF': { label: 'Transmission Fluid (ATF)', shortLabel: 'ATF', color: '#db2777', bg: 'bg-pink-600' },
  'LUB-BRAKE': { label: 'Brake Fluid DOT 4 (500ml)', shortLabel: 'Brake', color: '#e11d48', bg: 'bg-rose-600' },
  'LUB-COOLANT': { label: 'Radiator Coolant (4L)', shortLabel: 'Coolant', color: '#059669', bg: 'bg-emerald-600' },
}

export const PAYMENT_META: Record<PaymentMethod, { label: string; shortLabel: string; color: string; bg: string }> = {
  CASH: { label: 'Cash', shortLabel: 'Cash', color: '#f59e0b', bg: 'bg-amber-500' },
  MOMO: { label: 'Mobile Money', shortLabel: 'MoMo', color: '#10b981', bg: 'bg-emerald-500' },
  VOUCHER: { label: 'Voucher / Fuel Card', shortLabel: 'Voucher', color: '#8b5cf6', bg: 'bg-violet-500' },
  CREDIT: { label: 'Credit (Corporate)', shortLabel: 'Credit', color: '#06b6d4', bg: 'bg-cyan-500' },
}

export const MAX_METER_READING = 1_000_000
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const MAX_PIN_ATTEMPTS = 5
export const LOCKOUT_MS = 5 * 60 * 1000

/**
 * Minimum length for a PIN that is being *set*. A 4-digit PIN is a
 * 10,000-entry space, so a stolen device or database yields every credential
 * quickly regardless of KDF cost. Verification still accepts anything the
 * server issued, so credentials set before this policy keep working.
 *
 * Must stay in step with MIN_SECRET_LENGTH in backend/src/auth.ts.
 */
export const MIN_PIN_LENGTH = 4
export const MAX_PIN_LENGTH = 32

export function isPinShape(value: string): boolean {
  return /^\d{4,32}$/.test(value)
}

export function validateNewPin(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('PIN must contain digits only.')
  if (value.length < MIN_PIN_LENGTH) throw new Error(`PIN must be at least ${MIN_PIN_LENGTH} digits.`)
  if (value.length > MAX_PIN_LENGTH) throw new Error(`PIN must be at most ${MAX_PIN_LENGTH} digits.`)
  return value
}