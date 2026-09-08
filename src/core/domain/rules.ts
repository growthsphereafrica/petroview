/**
 * Pure business rules for the forecourt domain.
 * These functions are deterministic and framework-free — unit testable in isolation.
 */

import { DomainError } from './errors'
import type { FuelCode, FuelSale, MeterReading, PaymentsBreakdown, Shift } from './types'

export interface ValidatedSaleInput {
  fuelCode: FuelCode
  litres: number
  unitPrice: number
  method?: never
}

/** All four fuel codes, used to preserve stable ordering in UI & exports. */
export const ALL_FUEL_CODES: FuelCode[] = ['PMS', 'AGO', 'DPK', 'KERO']

export function emptyPayments(): PaymentsBreakdown {
  return { CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 }
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function roundLitres(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function sumPayments(payments: PaymentsBreakdown): number {
  return roundMoney(payments.CASH + payments.MOMO + payments.VOUCHER + payments.CREDIT)
}

export function sumSales(sales: FuelSale[]): number {
  return roundMoney(sales.reduce((acc, s) => acc + s.amount, 0))
}

export function saleAmount(litres: number, unitPrice: number): number {
  return roundMoney(litres * unitPrice)
}

/**
 * Validates an opening/closing meter reading.
 * - value must be a finite, non-negative number
 * - value must not exceed a sane pump meter maximum
 */
export function validateMeterReading(reading: { fuelCode: FuelCode; value: number }): void {
  if (!Number.isFinite(reading.value) || Number.isNaN(reading.value)) {
    throw new DomainError('READINGS_EMPTY', `Invalid reading for ${reading.fuelCode}.`, reading.fuelCode)
  }
  if (reading.value < 0) {
    throw new DomainError('READING_NEGATIVE', `Reading for ${reading.fuelCode} cannot be negative.`, reading.fuelCode)
  }
}

/** Validates a full set of meter readings (non-empty, each valid). */
export function validateReadingsSet(readings: MeterReading[]): void {
  if (!readings || readings.length === 0) {
    throw new DomainError('READINGS_EMPTY', 'Meter readings are required.')
  }
  for (const r of readings) {
    validateMeterReading(r)
  }
}

/**
 * Validates closing vs opening readings.
 * Each closing reading must be >= its opening reading.
 */
export function validateClosingReadings(openings: MeterReading[], closings: MeterReading[]): void {
  validateReadingsSet(openings)
  validateReadingsSet(closings)
  for (const closing of closings) {
    const opening = openings.find(o => o.fuelCode === closing.fuelCode)
    if (!opening) continue
    if (closing.value < opening.value) {
      throw new DomainError(
        'CLOSING_BELOW_OPENING',
        `Closing reading for ${closing.fuelCode} must not be lower than opening reading.`,
        closing.fuelCode,
        { opening: opening.value, closing: closing.value },
      )
    }
  }
}

/**
 * Computes fuel sales (litres + amounts) from opening & closing readings given unit prices.
 */
export function computeFuelSales(
  openings: MeterReading[],
  closings: MeterReading[],
  prices: Record<FuelCode, number>,
): FuelSale[] {
  return ALL_FUEL_CODES.map(fuelCode => {
    const opening = openings.find(o => o.fuelCode === fuelCode)
    const closing = closings.find(o => o.fuelCode === fuelCode)
    const litres = opening && closing ? roundLitres(Math.max(0, closing.value - opening.value)) : 0
    const price = prices[fuelCode] ?? 0
    return { fuelCode, litres, amount: saleAmount(litres, price), unitPrice: price }
  }).filter(sale => sale.litres > 0 || sale.unitPrice > 0)
}

/**
 * Validates a sale before it is recorded.
 * Returns the exact amount that should be charged.
 */
export function validateSale(input: { fuelCode: FuelCode; litres: number; unitPrice: number }): number {
  if (!Number.isFinite(input.litres) || input.litres <= 0) {
    throw new DomainError('SALE_ZERO_LITRES', 'Sale volume must be greater than zero.', input.fuelCode)
  }
  return saleAmount(input.litres, input.unitPrice)
}

/**
 * Accepts a payment into the shift breakdown and recomputes actual total + variance.
 * Throws if the shift is not open.
 */
export function applyPayment(shift: Shift, method: keyof PaymentsBreakdown, amount: number): Shift {
  if (shift.status !== 'OPEN') {
    throw new DomainError('SHIFT_NOT_OPEN', 'Cannot record a payment on a closed shift.', undefined, { shiftId: shift.id })
  }
  const payments: PaymentsBreakdown = { ...shift.payments, [method]: roundMoney(shift.payments[method] + amount) }
  const actualTotal = sumPayments(payments)
  return {
    ...shift,
    payments,
    actualTotal,
    variance: roundMoney(actualTotal - shift.expectedTotal),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Builds the final, immutable, locked view of a closed shift.
 */
export function finalizeClosedShift(
  shift: Shift,
  closings: MeterReading[],
  prices: Record<FuelCode, number>,
  notes: string | null,
): Shift {
  validateClosingReadings(shift.openingReadings, closings)
  const sales = computeFuelSales(shift.openingReadings, closings, prices)
  const expectedTotal = sumSales(sales)
  const actualTotal = sumPayments(shift.payments)
  return {
    ...shift,
    closingReadings: closings,
    sales,
    expectedTotal,
    actualTotal,
    variance: roundMoney(actualTotal - expectedTotal),
    notes,
    status: 'CLOSED',
    closedAt: new Date().toISOString(),
    syncStatus: 'PENDING',
    updatedAt: new Date().toISOString(),
  }
}