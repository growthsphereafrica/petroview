/**
 * Mobile station/fuel/pump configuration. Mirrors the web build's domain config
 * so attendant, supervisor and head-office behavior is identical across platforms.
 */

import type { FuelCode, PaymentMethod } from './types'

export const PRODUCTION_STATION = {
  id: 'STN-GV-042',
  name: 'Green Valley Main',
  code: 'GV-042',
  location: 'Accra - Tema Motorway Corridor',
  currency: 'GHS',
  fuelPrices: { PMS: 14.8, AGO: 15.2, DPK: 13.9, KERO: 13.5 } as Record<FuelCode, number>,
  paymentMethods: ['CASH', 'MOMO', 'VOUCHER', 'CREDIT'] as PaymentMethod[],
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

export interface ShiftNozzleDetail {
  nozzleLabel: string
  nozzleIndex: number
  fuelCode: FuelCode
  openingValue: number
  closingValue: number
  litres: number
}

/**
 * Returns a human-readable list of nozzles operated in a shift
 * (e.g. "Nozzle 1 (PMS), Nozzle 2 (AGO)" or "Side 1, Side 2").
 */
export function formatShiftNozzles(shift: {
  assignedNozzles?: string[] | number[]
  openingReadings?: Array<{ nozzleLabel?: string; nozzleIndex?: number; fuelCode?: string }> | Record<string, any> | null
  closingReadings?: Array<{ nozzleLabel?: string; nozzleIndex?: number; fuelCode?: string }> | Record<string, any> | null
}): string {
  if (Array.isArray(shift.assignedNozzles) && shift.assignedNozzles.length > 0) {
    return shift.assignedNozzles.map(String).join(', ')
  }
  const getArray = (v: any) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []))
  const openings = getArray(shift.openingReadings)
  const closings = getArray(shift.closingReadings)
  const readings = openings.length > 0 ? openings : closings

  if (!readings || readings.length === 0) return 'Standard'
  const labels: string[] = []
  readings.forEach((r: any, idx: number) => {
    const label = r.nozzleLabel || `Nozzle ${r.nozzleIndex ?? (idx + 1)}${r.fuelCode ? ` (${r.fuelCode})` : ''}`
    if (!labels.includes(label)) labels.push(label)
  })
  return labels.length > 0 ? labels.join(', ') : 'Standard'
}

/**
 * Extracts per-nozzle meter reading audit rows for a shift
 */
export function extractShiftNozzlesList(shift: {
  openingReadings?: any
  closingReadings?: any
  sales?: any[]
}): ShiftNozzleDetail[] {
  const getArray = (v: any) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []))
  const openings = getArray(shift.openingReadings)
  const closings = getArray(shift.closingReadings)

  if (openings.length === 0 && closings.length === 0) {
    if (Array.isArray(shift.sales)) {
      return shift.sales.map((s: any, idx: number) => ({
        nozzleLabel: `${s.fuelCode} Nozzle`,
        nozzleIndex: idx + 1,
        fuelCode: (s.fuelCode || 'PMS') as FuelCode,
        openingValue: 0,
        closingValue: Number(s.litres || 0),
        litres: Number(s.litres || 0),
      }))
    }
    return []
  }

  return openings.map((o: any, idx: number) => {
    const nozzleIndex = o.nozzleIndex ?? (idx + 1)
    const fuelCode = (o.fuelCode || 'PMS') as FuelCode
    const nozzleLabel = o.nozzleLabel || `Nozzle ${nozzleIndex} (${fuelCode})`
    const openVal = Number(o.value || 0)
    const matchedClosing = closings.find((c: any, cIdx: number) => {
      if (c.nozzleIndex !== undefined && o.nozzleIndex !== undefined) return c.nozzleIndex === o.nozzleIndex
      if (c.nozzleLabel && o.nozzleLabel) return c.nozzleLabel === o.nozzleLabel
      return cIdx === idx
    })
    const closeVal = matchedClosing ? Number(matchedClosing.value || 0) : 0
    const litres = closeVal >= openVal && closeVal > 0 ? Math.round((closeVal - openVal) * 100) / 100 : 0
    return {
      nozzleLabel,
      nozzleIndex,
      fuelCode,
      openingValue: openVal,
      closingValue: closeVal,
      litres,
    }
  })
}

export const PRODUCTION_PUMPS: ProductionPumpConfig[] = [
  { id: 'pump-1', name: 'Pump 1', fuels: ['PMS', 'AGO'] as FuelCode[] },
  { id: 'pump-2', name: 'Pump 2', fuels: ['PMS', 'AGO'] as FuelCode[] },
  { id: 'pump-3', name: 'Pump 3', fuels: ['PMS', 'AGO'] as FuelCode[] },
  { id: 'pump-4', name: 'Pump 4', fuels: ['PMS', 'AGO'] as FuelCode[] },
]

const dynamicPumpsMap = new Map<string, ProductionPumpConfig[]>()

export function registerStationPumps(stationId: string, pumps: ProductionPumpConfig[]): void {
  if (stationId && Array.isArray(pumps) && pumps.length > 0) {
    dynamicPumpsMap.set(stationId, pumps)
    dynamicPumpsMap.set(stationId.toLowerCase(), pumps)
  }
}

export function getStationPumps(stationId?: string): ProductionPumpConfig[] {
  if (stationId) {
    const norm = stationId.trim()
    if (dynamicPumpsMap.has(norm)) return dynamicPumpsMap.get(norm)!
    if (dynamicPumpsMap.has(norm.toLowerCase())) return dynamicPumpsMap.get(norm.toLowerCase())!
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

export const FUEL_META: Record<FuelCode, { label: string; shortLabel: string; color: string }> = {
  PMS: { label: 'Super Petrol (PMS)', shortLabel: 'PMS', color: '#22c55e' },
  AGO: { label: 'Diesel (AGO)', shortLabel: 'AGO', color: '#3b82f6' },
  DPK: { label: 'Dual Purpose Kerosene (DPK)', shortLabel: 'DPK', color: '#f97316' },
  KERO: { label: 'Kerosene (KERO)', shortLabel: 'KERO', color: '#a855f7' },
}

export const PAYMENT_META: Record<PaymentMethod, { label: string; shortLabel: string; color: string }> = {
  CASH: { label: 'Cash', shortLabel: 'Cash', color: '#f59e0b' },
  MOMO: { label: 'Mobile Money', shortLabel: 'MoMo', color: '#10b981' },
  VOUCHER: { label: 'Voucher / Fuel Card', shortLabel: 'Voucher', color: '#8b5cf6' },
  CREDIT: { label: 'Credit (Corporate)', shortLabel: 'Credit', color: '#06b6d4' },
}

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const MAX_PIN_ATTEMPTS = 5
export const LOCKOUT_MS = 5 * 60 * 1000
export const MAX_METER_READING = 1_000_000

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
