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

export interface ProductionPumpConfig {
  id: string
  name: string
  fuels: FuelCode[]
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
  id: 'STN-GV-042',
  name: 'Green Valley Main',
  code: 'GV-042',
  location: 'Accra - Tema Motorway Corridor',
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
  { id: 'pump-1', name: 'Pump 1', fuels: ['PMS', 'AGO', 'DPK', 'KERO'] },
  { id: 'pump-2', name: 'Pump 2', fuels: ['PMS', 'AGO'] },
  { id: 'pump-3', name: 'Pump 3', fuels: ['PMS', 'AGO'] },
  { id: 'pump-4', name: 'Pump 4', fuels: ['PMS', 'AGO'] },
]

/**
 * Enterprise station registry. The attendant terminal operates station 0
 * (Green Valley Main); supervisor & head-office rollups span all stations.
 */
export const PRODUCTION_STATIONS: ProductionStationEntry[] = [
  { id: 'STN-GV-042', name: 'Green Valley Main', code: 'GV-042', location: 'Accra - Tema Motorway', region: 'Greater Accra', pumps: 4 },
  { id: 'STN-AB-015', name: 'Airport Bypass Express', code: 'AB-015', location: 'Airport Residential, Accra', region: 'Greater Accra', pumps: 2 },
  { id: 'STN-TH-021', name: 'Takoradi Harbour Hub', code: 'TH-021', location: 'Harbour Road, Takoradi', region: 'Western Region', pumps: 2 },
]

export function getStationById(stationId: string): ProductionStationEntry {
  return PRODUCTION_STATIONS.find(s => s.id === stationId) ?? PRODUCTION_STATIONS[0]
}

export function getStationName(stationId: string): string {
  return getStationById(stationId).name
}

export const FUEL_META: Record<FuelCode, { label: string; shortLabel: string; color: string; bg: string }> = {
  PMS: { label: 'Super Petrol (PMS)', shortLabel: 'PMS', color: '#22c55e', bg: 'bg-emerald-500' },
  AGO: { label: 'Diesel (AGO)', shortLabel: 'AGO', color: '#3b82f6', bg: 'bg-blue-600' },
  DPK: { label: 'Dual Purpose Kerosene (DPK)', shortLabel: 'DPK', color: '#f97316', bg: 'bg-orange-500' },
  KERO: { label: 'Kerosene (KERO)', shortLabel: 'KERO', color: '#a855f7', bg: 'bg-purple-600' },
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
export const PIN_LENGTH = 4