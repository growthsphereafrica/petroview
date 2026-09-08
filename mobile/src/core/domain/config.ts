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

export const PRODUCTION_PUMPS = [
  { id: 'pump-1', name: 'Pump 1', fuels: ['PMS', 'AGO', 'DPK', 'KERO'] as FuelCode[] },
  { id: 'pump-2', name: 'Pump 2', fuels: ['PMS', 'AGO'] as FuelCode[] },
  { id: 'pump-3', name: 'Pump 3', fuels: ['PMS', 'AGO'] as FuelCode[] },
  { id: 'pump-4', name: 'Pump 4', fuels: ['PMS', 'AGO'] as FuelCode[] },
]

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
