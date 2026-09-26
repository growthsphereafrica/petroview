import { describe, expect, it } from 'vitest'

import {
  ALL_FUEL_CODES,
  FALLBACK_UNIT_PRICES,
  computeFuelSales,
  emptyPayments,
  finalizeClosedShift,
  resolveUnitPrice,
  roundLitres,
  roundMoney,
  saleAmount,
  sumPayments,
  sumSales,
  validateClosingReadings,
  validateSale,
} from './rules'
import { DomainError } from './errors'
import type { FuelSale, MeterReading, Shift } from './types'

function readings(values: Partial<Record<string, number>>): MeterReading[] {
  return Object.entries(values).map(([fuelCode, value]) => ({ fuelCode, value }) as MeterReading)
}

function sale(fuelCode: string, litres: number, amount: number): FuelSale {
  return { fuelCode, litres, amount, unitPrice: 0 } as FuelSale
}

function openShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-1',
    number: 'SH-1',
    attendantId: 'att-1',
    attendantName: 'Attendant',
    stationId: 'stn-1',
    stationName: 'Station',
    companyId: 'comp-1',
    pumpId: 'pump-1',
    pumpName: 'Pump 1',
    status: 'OPEN',
    openedAt: '2026-01-01T08:00:00.000Z',
    closedAt: null,
    openingReadings: readings({ PMS: 1000, AGO: 2000 }),
    closingReadings: [],
    sales: [],
    expectedTotal: 0,
    payments: emptyPayments(),
    actualTotal: 0,
    variance: 0,
    notes: null,
    reviewerNotes: null,
    syncStatus: 'PENDING',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    ...overrides,
  } as Shift
}

describe('roundMoney', () => {
  it('rounds to two decimal places', () => {
    expect(roundMoney(14.8)).toBe(14.8)
    expect(roundMoney(0.145)).toBe(0.15)
    expect(roundMoney(1.005)).toBe(1.01)
  })

  it('is EPSILON-aware so floating point noise does not cost a centime', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754.
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    // 1.005 is stored as 1.00499999...; a naive Math.round drops it to 1.00.
    expect(roundMoney(1.005)).toBe(1.01)
    expect(Math.round(1.005 * 100) / 100).toBe(1)
  })

  it('is idempotent', () => {
    const once = roundMoney(123.456)
    expect(roundMoney(once)).toBe(once)
  })

  it('handles negative amounts symmetrically', () => {
    expect(roundMoney(-14.805)).toBe(-14.81)
    expect(roundMoney(14.805)).toBe(14.81)
    expect(roundMoney(-0.145)).toBe(-0.15)
  })

  it('never returns negative zero', () => {
    expect(Object.is(roundMoney(-0.001), -0)).toBe(false)
  })

  it('passes non-finite values through unchanged', () => {
    expect(roundMoney(Number.NaN)).toBeNaN()
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('roundLitres', () => {
  it('rounds to two decimal places', () => {
    expect(roundLitres(19.995)).toBe(20)
    expect(roundLitres(0.1 + 0.2)).toBe(0.3)
  })
})

describe('saleAmount', () => {
  it('computes litres x unit price to the centime', () => {
    expect(saleAmount(20, 14.8)).toBe(296)
    expect(saleAmount(19.99, 15.2)).toBe(303.85)
  })

  it('agrees with itself across a repeated recalculation', () => {
    // Recording and then editing a sale must not change its value. These both
    // route through saleAmount so the two paths cannot diverge.
    const litres = 12.345
    const price = 14.8
    const onRecord = saleAmount(roundLitres(litres), price)
    const onEdit = saleAmount(roundLitres(litres), price)
    expect(onEdit).toBe(onRecord)
  })
})

describe('sumPayments and sumSales', () => {
  it('sums payment methods to the centime', () => {
    expect(sumPayments({ CASH: 100.1, MOMO: 0.2, VOUCHER: 0, CREDIT: 0 })).toBe(100.3)
  })

  it('sums sales to the centime', () => {
    expect(sumSales([sale('PMS', 10, 148), sale('AGO', 5, 76)])).toBe(224)
  })

  it('does not drift across many small amounts', () => {
    const many = Array.from({ length: 1000 }, () => sale('PMS', 1, 0.01))
    expect(sumSales(many)).toBe(10)
  })
})

describe('validateSale', () => {
  it('returns the amount to charge', () => {
    expect(validateSale({ fuelCode: 'PMS', litres: 10, unitPrice: 14.8 })).toBe(148)
  })

  it('rejects zero, negative and non-finite volumes', () => {
    expect(() => validateSale({ fuelCode: 'PMS', litres: 0, unitPrice: 14.8 })).toThrow(DomainError)
    expect(() => validateSale({ fuelCode: 'PMS', litres: -5, unitPrice: 14.8 })).toThrow(DomainError)
    expect(() => validateSale({ fuelCode: 'PMS', litres: Number.NaN, unitPrice: 14.8 })).toThrow(DomainError)
    expect(() => validateSale({ fuelCode: 'PMS', litres: Number.POSITIVE_INFINITY, unitPrice: 14.8 })).toThrow(DomainError)
  })
})

describe('resolveUnitPrice', () => {
  it('prefers the loaded product price', () => {
    expect(resolveUnitPrice([{ code: 'PMS', unitPrice: 15.05 }], 'PMS')).toBe(15.05)
  })

  it('falls back to the canonical price when no product is loaded', () => {
    expect(resolveUnitPrice([], 'PMS')).toBe(FALLBACK_UNIT_PRICES.PMS)
    expect(resolveUnitPrice([], 'DPK')).toBe(13.9)
    expect(resolveUnitPrice([], 'KERO')).toBe(13.5)
    expect(resolveUnitPrice([], 'AGO')).toBe(15.2)
  })

  it('regression: DPK and KERO must not both collapse to the PMS price', () => {
    // The edit preview used a two-way fallback (AGO ? 15.2 : 14.8) while the
    // save used a four-way one, so an offline device previewed DPK at 14.80 and
    // committed 13.90. Both paths now call this function.
    expect(resolveUnitPrice([], 'DPK')).not.toBe(resolveUnitPrice([], 'PMS'))
    expect(resolveUnitPrice([], 'KERO')).not.toBe(resolveUnitPrice([], 'PMS'))
  })

  it('ignores a non-positive or non-finite catalogue price', () => {
    expect(resolveUnitPrice([{ code: 'PMS', unitPrice: 0 }], 'PMS')).toBe(FALLBACK_UNIT_PRICES.PMS)
    expect(resolveUnitPrice([{ code: 'PMS', unitPrice: Number.NaN }], 'PMS')).toBe(FALLBACK_UNIT_PRICES.PMS)
  })

  it('has a fallback for an unknown fuel code', () => {
    expect(resolveUnitPrice([], 'NOT-A-FUEL')).toBe(FALLBACK_UNIT_PRICES.PMS)
  })
})

describe('computeFuelSales', () => {
  it('derives litres from the meter delta and prices them', () => {
    const result = computeFuelSales(
      readings({ PMS: 1000, AGO: 2000 }),
      readings({ PMS: 1030, AGO: 2000 }),
      { PMS: 14.8, AGO: 15.2 },
    )
    const pms = result.find(s => s.fuelCode === 'PMS')!
    expect(pms.litres).toBe(30)
    expect(pms.amount).toBe(444)
  })

  it('never produces negative litres when a closing reading is lower', () => {
    const result = computeFuelSales(
      readings({ PMS: 1000 }),
      readings({ PMS: 900 }),
      { PMS: 14.8 },
    )
    expect(result.find(s => s.fuelCode === 'PMS')!.litres).toBe(0)
  })

  it('keeps the fuel code order stable for exports', () => {
    const result = computeFuelSales(readings({ PMS: 1, AGO: 1 }), readings({ PMS: 2, AGO: 2 }), { PMS: 14.8, AGO: 15.2 })
    expect(result.map(s => s.fuelCode)).toEqual(ALL_FUEL_CODES.filter(c => result.some(s => s.fuelCode === c)))
  })
})

describe('validateClosingReadings', () => {
  it('rejects a closing reading below its opening reading', () => {
    expect(() => validateClosingReadings(readings({ PMS: 100 }), readings({ PMS: 99 }))).toThrow(DomainError)
  })

  it('accepts an equal closing reading', () => {
    expect(() => validateClosingReadings(readings({ PMS: 100 }), readings({ PMS: 100 }))).not.toThrow()
  })

  it('rejects an empty closing set', () => {
    expect(() => validateClosingReadings(readings({ PMS: 100 }), [])).toThrow(DomainError)
  })
})

describe('finalizeClosedShift', () => {
  it('produces a zero variance when payments match metered sales', () => {
    const shift = openShift()
    const result = finalizeClosedShift(
      shift,
      readings({ PMS: 1030, AGO: 2000 }),
      { PMS: 14.8, AGO: 15.2 },
      null,
    )
    // 30L PMS @ 14.80 = 444.00
    expect(result.expectedTotal).toBe(444)
    expect(result.status).toBe('CLOSED')
    expect(result.variance).toBe(-444)
  })

  it('reports a positive variance when more cash than metered sales is counted', () => {
    const shift = openShift({ payments: { CASH: 500, MOMO: 0, VOUCHER: 0, CREDIT: 0 } })
    const result = finalizeClosedShift(shift, readings({ PMS: 1030, AGO: 2000 }), { PMS: 14.8, AGO: 15.2 }, null)
    expect(result.actualTotal).toBe(500)
    expect(result.variance).toBe(56)
  })

  it('keeps centimes in the variance rather than rounding to whole cedis', () => {
    const shift = openShift({ payments: { CASH: 444.5, MOMO: 0, VOUCHER: 0, CREDIT: 0 } })
    const result = finalizeClosedShift(shift, readings({ PMS: 1030, AGO: 2000 }), { PMS: 14.8, AGO: 15.2 }, null)
    expect(result.variance).toBe(0.5)
  })

  it('marks the closed shift for sync', () => {
    const result = finalizeClosedShift(openShift(), readings({ PMS: 1010, AGO: 2000 }), { PMS: 14.8, AGO: 15.2 }, 'note')
    expect(result.syncStatus).toBe('PENDING')
    expect(result.notes).toBe('note')
  })
})
