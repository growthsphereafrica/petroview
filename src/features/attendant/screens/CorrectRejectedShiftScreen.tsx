/**
 * CorrectRejectedShiftScreen.tsx
 * Allows an attendant whose shift was rejected by the station manager/supervisor
 * to view the rejection feedback and restart the closing sales process:
 * 1. Select / confirm assigned dispenser pump and nozzle(s).
 * 2. Enter corrected opening and closing meter readings.
 * 3. Enter corrected remittance figures (Cash, MoMo, Card, Credit).
 * 4. Resubmit shift back to the manager for review with status 'CLOSED'.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertOctagon,
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  DollarSign,
  Droplets,
  Fuel,
  Gauge,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { ScreenHeader } from '../ui'
import { useAttendantSession, useShift } from '../providers'
import {
  FUEL_META,
  MAX_METER_READING,
  deriveNozzlesForPump,
  findPumpByIdOrName,
  getStationName,
  getStationPumps,
  registerStationPumps,
  type ProductionPumpConfig,
} from '../../../core/domain/config'
import { resolveUnitPrice, roundLitres, roundMoney, saleAmount } from '../../../core/domain/rules'
import { productService } from '../../../core/services/productService'
import { backendGetPumps } from '../../../services/backendApiService'
import { formatDateTime, formatGHS, formatLitres } from '../../../utils/currencyFormatter'
import { describeError } from '../../../core/domain/errors'
import type { FuelCode, MeterReading, PaymentsBreakdown, Shift } from '../../../core/domain/types'

interface Props {
  shift: Shift
  onBack: () => void
  onDone: () => void
}

export const CorrectRejectedShiftScreen: React.FC<Props> = ({ shift, onBack, onDone }) => {
  const { attendant, session } = useAttendantSession()
  const { resubmitShift } = useShift()

  const [pumps, setPumps] = useState<ProductionPumpConfig[]>(() => getStationPumps(attendant?.stationId))
  const [selectedPumpId, setSelectedPumpId] = useState<string>(shift.pumpId)
  const [loadingPumps, setLoadingPumps] = useState(false)

  // Load pumps from backend / local
  useEffect(() => {
    let cancelled = false
    const loadPumps = async () => {
      setLoadingPumps(true)
      try {
        const res = await backendGetPumps(attendant?.stationId, attendant?.companyId)
        if (!cancelled && res?.pumps && res.pumps.length > 0) {
          const mapped: ProductionPumpConfig[] = res.pumps.map(p => ({
            id: p.id,
            name: p.name,
            fuels: p.fuels as any,
            nozzles: (p as any).nozzles,
          }))
          if (attendant?.stationId) registerStationPumps(attendant.stationId, mapped)
          setPumps(mapped)
        }
      } catch {
        if (!cancelled) setPumps(getStationPumps(attendant?.stationId))
      } finally {
        if (!cancelled) setLoadingPumps(false)
      }
    }
    void loadPumps()
    return () => { cancelled = true }
  }, [attendant?.stationId, attendant?.companyId])

  const currentPump = useMemo(() => {
    return pumps.find(p => p.id === selectedPumpId) || pumps[0]
  }, [pumps, selectedPumpId])

  const availableNozzles = useMemo(() => {
    if (!currentPump) return []
    return deriveNozzlesForPump(currentPump)
  }, [currentPump])

  // Selected nozzles for this shift
  const [selectedNozzleIndices, setSelectedNozzleIndices] = useState<number[]>(() => {
    if (shift.openingReadings && shift.openingReadings.length > 0) {
      return shift.openingReadings.map(o => o.nozzleIndex || 1)
    }
    return [1]
  })

  // When pump changes, update selected nozzles if empty
  useEffect(() => {
    if (availableNozzles.length > 0) {
      setSelectedNozzleIndices(prev => {
        const valid = prev.filter(idx => availableNozzles.some(n => n.nozzleIndex === idx))
        return valid.length > 0 ? valid : availableNozzles.map(n => n.nozzleIndex)
      })
    }
  }, [selectedPumpId, availableNozzles])

  const toggleNozzle = (nozzleIndex: number) => {
    setSelectedNozzleIndices(prev => {
      if (prev.includes(nozzleIndex)) {
        if (prev.length === 1) return prev
        return prev.filter(x => x !== nozzleIndex)
      }
      return [...prev, nozzleIndex].sort((a, b) => a - b)
    })
  }

  // Meter readings state (both opening & closing can be verified / corrected)
  const [openingValues, setOpeningValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    shift.openingReadings?.forEach(o => {
      const key = `nozzle_${o.nozzleIndex || 1}`
      map[key] = String(o.value)
    })
    return map
  })

  const [closingValues, setClosingValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    shift.closingReadings?.forEach(c => {
      const key = `nozzle_${c.nozzleIndex || 1}`
      map[key] = String(c.value)
    })
    return map
  })

  // Dynamic fuel prices set by HQ / Supervisor
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({})
  useEffect(() => {
    productService
      .getFuelPriceMap(shift.companyId || attendant?.companyId)
      .then(setFuelPrices)
      .catch(() => {})
  }, [shift.companyId, attendant?.companyId])

  // Remittance values
  const [cashRemit, setCashRemit] = useState<string>(() => shift.payments?.CASH ? String(shift.payments.CASH) : '')
  const [momoRemit, setMomoRemit] = useState<string>(() => shift.payments?.MOMO ? String(shift.payments.MOMO) : '')
  const [cardRemit, setCardRemit] = useState<string>(() => shift.payments?.VOUCHER ? String(shift.payments.VOUCHER) : '')
  const [creditRemit, setCreditRemit] = useState<string>(() => shift.payments?.CREDIT ? String(shift.payments.CREDIT) : '')
  const [attendantNotes, setAttendantNotes] = useState<string>('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const parseNum = (v: string): number => {
    const clean = v.replace(/,/g, '').trim()
    const n = parseFloat(clean)
    return Number.isFinite(n) ? n : 0
  }

  // Active operated nozzles
  const activeOperatedNozzles = useMemo(() => {
    return availableNozzles.filter(n => selectedNozzleIndices.includes(n.nozzleIndex))
  }, [availableNozzles, selectedNozzleIndices])

  // Calculations
  const calculations = useMemo(() => {
    let totalLitres = 0
    let totalExpectedCash = 0
    let allValid = activeOperatedNozzles.length > 0

    const perNozzle = activeOperatedNozzles.map(nozzle => {
      const key = `nozzle_${nozzle.nozzleIndex}`
      const rawOpen = openingValues[key] ?? ''
      const rawClose = closingValues[key] ?? ''

      const openVal = parseNum(rawOpen)
      const closeVal = parseNum(rawClose)
      const hasCloseInput = rawClose.trim().length > 0

      let validationError: string | null = null
      if (rawOpen.trim().length === 0) {
        validationError = 'Opening meter required'
        allValid = false
      } else if (!hasCloseInput) {
        validationError = 'Closing meter required'
        allValid = false
      } else if (closeVal < openVal) {
        validationError = `Must be ≥ opening (${openVal.toLocaleString('en-US', { minimumFractionDigits: 2 })})`
        allValid = false
      }

      const litresSold = hasCloseInput && closeVal >= openVal ? roundLitres(closeVal - openVal) : 0
      const unitPrice = fuelPrices[nozzle.fuelCode] ?? resolveUnitPrice([], nozzle.fuelCode as FuelCode)
      const productSales = saleAmount(litresSold, unitPrice)

      if (hasCloseInput && !validationError) {
        totalLitres += litresSold
        totalExpectedCash += productSales
      }

      return {
        key,
        nozzleIndex: nozzle.nozzleIndex,
        label: nozzle.name,
        fuelCode: nozzle.fuelCode,
        openVal,
        closeVal,
        rawOpen,
        rawClose,
        validationError,
        litresSold,
        unitPrice,
        productSales,
      }
    })

    const cashNum = parseNum(cashRemit)
    const momoNum = parseNum(momoRemit)
    const cardNum = parseNum(cardRemit)
    const creditNum = parseNum(creditRemit)
    const totalRemitted = roundMoney(cashNum + momoNum + cardNum + creditNum)
    const expectedRounded = roundMoney(totalExpectedCash)
    const variance = roundMoney(totalRemitted - expectedRounded)

    return {
      perNozzle,
      totalLitres: roundLitres(totalLitres),
      totalExpectedCash: expectedRounded,
      totalRemitted,
      variance,
      cashNum,
      momoNum,
      cardNum,
      creditNum,
      allValid,
    }
  }, [activeOperatedNozzles, openingValues, closingValues, fuelPrices, cashRemit, momoRemit, cardRemit, creditRemit])

  const handleResubmit = async () => {
    setError(null)
    if (!calculations.allValid) {
      setError('Please check all nozzle opening and closing meter figures.')
      return
    }

    setSubmitting(true)
    try {
      const correctedOpenings: MeterReading[] = calculations.perNozzle.map(n => ({
        fuelCode: n.fuelCode as FuelCode,
        value: n.openVal,
        nozzleIndex: n.nozzleIndex,
        nozzleLabel: n.label,
      }))

      const correctedClosings: MeterReading[] = calculations.perNozzle.map(n => ({
        fuelCode: n.fuelCode as FuelCode,
        value: n.closeVal,
        nozzleIndex: n.nozzleIndex,
        nozzleLabel: n.label,
      }))

      const remittance: Partial<PaymentsBreakdown> = {
        CASH: calculations.cashNum,
        MOMO: calculations.momoNum,
        VOUCHER: calculations.cardNum,
        CREDIT: calculations.creditNum,
      }

      await resubmitShift({
        shiftId: shift.id,
        pumpId: currentPump?.id || shift.pumpId,
        pumpName: currentPump?.name || shift.pumpName,
        openingReadings: correctedOpenings,
        closingReadings: correctedClosings,
        notes: attendantNotes.trim() || undefined,
        remittance,
      })

      setShowConfirmModal(false)
      onDone()
    } catch (err) {
      setError(describeError(err))
      setSubmitting(false)
      setShowConfirmModal(false)
    }
  }

  const companyDisplayName = session?.companyName || attendant?.companyName || attendant?.companyShortCode || 'OMC'
  const stationDisplayName = session?.stationName || attendant?.stationName || (attendant?.stationId ? getStationName(attendant.stationId) : 'Station Forecourt')

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader
        title="Correct & Resubmit Shift"
        subtitle={`${companyDisplayName} · ${stationDisplayName} (${shift.number})`}
        onBack={onBack}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-lg w-full mx-auto pb-12">
        {/* Manager Rejection Feedback Box */}
        <div className="rounded-2xl border-2 border-rose-500/50 bg-gradient-to-b from-rose-950/70 to-slate-900/90 p-4 shadow-lg shadow-rose-950/40 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-400 font-extrabold text-xs uppercase tracking-wide">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Manager Discrepancy Reason</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Shift {shift.number}
            </span>
          </div>

          {shift.reviewerNotes ? (
            <div className="rounded-xl bg-slate-950/80 border border-rose-500/30 p-3">
              <p className="text-xs text-rose-100 italic leading-relaxed font-medium">
                "{shift.reviewerNotes}"
              </p>
              {shift.reviewedBy && (
                <p className="text-[10px] text-rose-300/80 mt-1.5 font-semibold">
                  Reviewed by {shift.reviewedBy} {shift.reviewedAt ? `· ${formatDateTime(shift.reviewedAt)}` : ''}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-rose-200">
              Shift entries were rejected by supervisor. Please correct your pump/nozzle readings and cash figures below.
            </p>
          )}

          {/* Previous Submission Figures */}
          <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5 flex items-center justify-between text-center">
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-400">Previous Expected</p>
              <p className="text-xs font-black text-white mt-0.5">
                {formatGHS(shift.expectedTotal || shift.salesTotal)}
              </p>
            </div>
            <div className="w-px h-6 bg-slate-800" />
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-400">Previous Remitted</p>
              <p className="text-xs font-black text-amber-300 mt-0.5">
                {formatGHS(shift.actualTotal)}
              </p>
            </div>
            <div className="w-px h-6 bg-slate-800" />
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-400">Discrepancy</p>
              <p className={`text-xs font-black mt-0.5 ${shift.variance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatGHS(shift.variance)}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-300 leading-snug">
            You can re-select your pump dispenser, select operating nozzles, adjust opening/closing figures, and enter your corrected sales breakdown.
          </p>
        </div>

        {/* STEP 1: Dispenser Pump Selection */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col gap-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Fuel className="w-4 h-4 text-orange-400" /> 1. Dispenser Pump
            </span>
            {loadingPumps && <RefreshCw className="w-3.5 h-3.5 text-orange-400 animate-spin" />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {pumps.map(p => {
              const active = p.id === selectedPumpId
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPumpId(p.id)}
                  type="button"
                  className={`py-2.5 px-3 rounded-xl border text-left transition flex items-center justify-between ${
                    active
                      ? 'border-orange-500 bg-orange-500/15 text-white ring-1 ring-orange-500/30'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold truncate">{p.name}</span>
                  {active && <Check className="w-4 h-4 text-orange-400 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* STEP 2: Assigned Nozzles Selection */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col gap-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Droplets className="w-4 h-4 text-amber-400" /> 2. Operating Nozzles
            </span>
            <span className="text-[10px] text-slate-500">Pick operated nozzle(s)</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {availableNozzles.map(n => {
              const active = selectedNozzleIndices.includes(n.nozzleIndex)
              const fuelMeta = FUEL_META[n.fuelCode] || { color: '#F97316', label: n.fuelCode }
              return (
                <button
                  key={n.nozzleIndex}
                  onClick={() => toggleNozzle(n.nozzleIndex)}
                  type="button"
                  className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                    active
                      ? 'border-orange-500 bg-orange-500/10 text-white shadow-sm ring-1 ring-orange-500/20'
                      : 'border-slate-800/80 bg-slate-950/40 text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: fuelMeta.color }}
                    />
                    <div>
                      <p className="text-xs font-extrabold text-white leading-tight">{n.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-mono">{n.fuelCode}</p>
                    </div>
                  </div>
                  {active ? (
                    <CheckCircle2 className="w-4 h-4 text-orange-400 shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border border-slate-700" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* STEP 3: Meter Readings (Opening & Closing) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-orange-400" /> 3. Correct Meter Readings
            </span>
            <span className="text-[10px] text-slate-500">Opening & Closing</span>
          </div>

          {calculations.perNozzle.map(nozzle => {
            const fuelMeta = FUEL_META[nozzle.fuelCode] || { color: '#F97316', label: nozzle.fuelCode }
            return (
              <div
                key={nozzle.key}
                className={`rounded-2xl bg-slate-900 border p-4 transition shadow-md ${
                  nozzle.validationError
                    ? 'border-slate-800'
                    : 'border-orange-500/40 ring-1 ring-orange-500/15'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-black text-white uppercase tracking-wider"
                      style={{ backgroundColor: fuelMeta.color }}
                    >
                      {nozzle.fuelCode}
                    </span>
                    <span className="text-xs font-bold text-white">{nozzle.label}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-orange-400">
                    {formatGHS(nozzle.unitPrice)}/L
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                      Opening Meter
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={openingValues[nozzle.key] ?? ''}
                      onChange={e => setOpeningValues(prev => ({ ...prev, [nozzle.key]: e.target.value }))}
                      placeholder="0.00"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono font-bold text-white focus:border-orange-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-orange-400 uppercase tracking-wide mb-1">
                      Closing Meter *
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={closingValues[nozzle.key] ?? ''}
                      onChange={e => setClosingValues(prev => ({ ...prev, [nozzle.key]: e.target.value }))}
                      placeholder="0.00"
                      className="w-full rounded-xl bg-slate-950 border border-orange-500/50 px-3 py-2 text-sm font-mono font-bold text-white focus:border-orange-500 outline-none"
                    />
                  </div>
                </div>

                {nozzle.validationError ? (
                  <p className="text-[11px] text-amber-400 font-medium">{nozzle.validationError}</p>
                ) : (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                    <span className="text-slate-400">
                      Volume: <span className="text-white font-mono font-bold">{formatLitres(nozzle.litresSold)} L</span>
                    </span>
                    <span className="text-slate-400">
                      Sales: <span className="text-orange-400 font-mono font-bold">{formatGHS(nozzle.productSales)}</span>
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* STEP 4: Payment Figures & Reconciliation */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col gap-3 shadow-md">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" /> 4. Correct Payment Remittance
          </span>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cash at Hand (GHS)</label>
              <input
                type="number"
                step="any"
                value={cashRemit}
                onChange={e => setCashRemit(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono font-bold text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mobile Money (GHS)</label>
              <input
                type="number"
                step="any"
                value={momoRemit}
                onChange={e => setMomoRemit(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono font-bold text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">POS / Card (GHS)</label>
              <input
                type="number"
                step="any"
                value={cardRemit}
                onChange={e => setCardRemit(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono font-bold text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Credit / Vouchers (GHS)</label>
              <input
                type="number"
                step="any"
                value={creditRemit}
                onChange={e => setCreditRemit(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm font-mono font-bold text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Attendant Correction Note (for Supervisor)
            </label>
            <textarea
              rows={2}
              value={attendantNotes}
              onChange={e => setAttendantNotes(e.target.value)}
              placeholder="Explain correction (e.g. corrected closing meter on Nozzle 2, cash shortage resolved)"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none"
            />
          </div>

          {/* Variance KPI Banner */}
          <div className="rounded-xl bg-slate-950 p-3.5 border border-slate-800 flex items-center justify-between mt-1">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Expected Fuel Sales</p>
              <p className="text-base font-black text-white">{formatGHS(calculations.totalExpectedCash)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Total Remitted</p>
              <p className="text-base font-black text-emerald-400">{formatGHS(calculations.totalRemitted)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-400 font-medium">Reconciliation Variance:</span>
            <span
              className={`font-mono font-extrabold text-sm ${
                calculations.variance === 0
                  ? 'text-emerald-400'
                  : calculations.variance > 0
                  ? 'text-emerald-300'
                  : 'text-rose-400'
              }`}
            >
              {calculations.variance === 0
                ? 'Balanced (0.00)'
                : `${calculations.variance > 0 ? '+' : ''}${formatGHS(calculations.variance)} (${
                    calculations.variance > 0 ? 'Overage' : 'Shortage'
                  })`}
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-950/80 border border-rose-600/50 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <button
          onClick={() => {
            if (!calculations.allValid) {
              setError('Please enter valid closing readings for all nozzles.')
              return
            }
            setShowConfirmModal(true)
          }}
          disabled={submitting}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-950/50 transition active:scale-[0.99]"
        >
          <RotateCcw className="w-4 h-4" /> Review & Resubmit Shift
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-white">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <h3 className="text-base font-extrabold">Confirm Shift Resubmission</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are about to resubmit <span className="font-bold text-white">{shift.number}</span> on{' '}
              <span className="font-bold text-white">{currentPump?.name}</span> with{' '}
              <span className="font-bold text-white">{formatLitres(calculations.totalLitres)} L</span> sold and{' '}
              <span className="font-bold text-emerald-400">{formatGHS(calculations.totalRemitted)}</span> total remitted.
            </p>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleResubmit()}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-orange-950/40"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Submitting…
                  </>
                ) : (
                  'Confirm & Send'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
