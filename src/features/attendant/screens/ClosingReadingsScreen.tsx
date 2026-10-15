/**
 * Closing Readings & Shift Accounting Screen
 * Attendant enters closing meter readings for each assigned nozzle.
 * The system calculates:
 * 1. Litres Sold = Closing Reading - Opening Reading
 * 2. Cash to Have at Hand = Litres Sold * Unit Price (set by HQ & Manager)
 * 3. Remittance breakdown (Cash, MoMo, Card, Credit) and Shift Variance
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  DollarSign,
  Fuel,
  Gauge,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { ScreenHeader } from '../ui'
import { useShift } from '../providers'
import { FUEL_META } from '../../../core/domain/config'
import { resolveUnitPrice, roundLitres, roundMoney, saleAmount } from '../../../core/domain/rules'
import { productService } from '../../../core/services/productService'
import { formatGHS, formatLitres } from '../../../utils/currencyFormatter'
import { describeError } from '../../../core/domain/errors'
import type { FuelCode, MeterReading, PaymentsBreakdown } from '../../../core/domain/types'

export const ClosingReadingsScreen: React.FC<{ onBack: () => void; onClosed: () => void }> = ({
  onBack,
  onClosed,
}) => {
  const { activeShift, closeShift } = useShift()
  const [closingValues, setClosingValues] = useState<Record<string, string>>({})
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [cashRemit, setCashRemit] = useState<string>('')
  const [momoRemit, setMomoRemit] = useState<string>('')
  const [cardRemit, setCardRemit] = useState<string>('')
  const [creditRemit, setCreditRemit] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Load latest prices set by HQ/Manager for this company
  useEffect(() => {
    if (activeShift?.companyId) {
      productService
        .getFuelPriceMap(activeShift.companyId)
        .then(setFuelPrices)
        .catch(() => {})
    } else {
      productService
        .getFuelPriceMap()
        .then(setFuelPrices)
        .catch(() => {})
    }
  }, [activeShift?.companyId])

  // Get assigned opening readings for this shift
  const openings = useMemo(() => activeShift?.openingReadings ?? [], [activeShift?.openingReadings])

  // Parse input helper
  const parseNum = (v: string): number => {
    const clean = v.replace(/,/g, '').trim()
    const n = parseFloat(clean)
    return Number.isFinite(n) ? n : 0
  }

  // Calculate live per-nozzle sales and total litres / cash at hand
  const nozzleCalculations = useMemo(() => {
    let totalLitres = 0
    let totalCashExpected = 0
    let allValid = openings.length > 0
    const perNozzle = openings.map((open, idx) => {
      const fuelCode = open.fuelCode as FuelCode
      const key = open.nozzleIndex ? `nozzle_${open.nozzleIndex}` : `nozzle_${idx}`
      const rawClosing = closingValues[key] ?? ''
      const hasInput = rawClosing.trim().length > 0
      const closingVal = parseNum(rawClosing)
      const unitPrice = fuelPrices[fuelCode] ?? resolveUnitPrice([], fuelCode)

      let validationError: string | null = null
      if (!hasInput) {
        validationError = 'Closing meter required'
        allValid = false
      } else if (closingVal < open.value) {
        validationError = `Must be ≥ opening (${open.value.toLocaleString('en-US', { minimumFractionDigits: 2 })})`
        allValid = false
      }

      const litresSold = hasInput && closingVal >= open.value ? roundLitres(closingVal - open.value) : 0
      const productSales = saleAmount(litresSold, unitPrice)

      if (hasInput && !validationError) {
        totalLitres += litresSold
        totalCashExpected += productSales
      }

      const sideLabel = open.nozzleLabel || (openings.length === 2 ? (idx === 0 ? 'Side 1' : 'Side 2') : `Nozzle ${open.nozzleIndex || idx + 1}`)

      return {
        key,
        index: idx,
        nozzleIndex: open.nozzleIndex || (idx + 1),
        sideLabel,
        fuelCode,
        openingReading: open.value,
        closingReading: closingVal,
        rawInput: rawClosing,
        hasInput,
        validationError,
        litresSold,
        unitPrice,
        productSales,
      }
    })

    return {
      perNozzle,
      totalLitres: roundLitres(totalLitres),
      totalCashExpected: roundMoney(totalCashExpected),
      allValid,
    }
  }, [openings, closingValues, fuelPrices])

  // Calculate remittance and variance
  const cashNum = parseNum(cashRemit)
  const momoNum = parseNum(momoRemit)
  const cardNum = parseNum(cardRemit)
  const creditNum = parseNum(creditRemit)
  const totalRemitted = roundMoney(cashNum + momoNum + cardNum + creditNum)
  const variance = roundMoney(totalRemitted - nozzleCalculations.totalCashExpected)

  // Auto-fill cash button helper
  const handleQuickMatchCash = () => {
    setCashRemit(nozzleCalculations.totalCashExpected.toFixed(2))
    setMomoRemit('')
    setCardRemit('')
    setCreditRemit('')
  }

  if (!activeShift) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#090d16] px-6 text-center">
        <p className="text-sm font-bold text-white">No active shift</p>
        <p className="text-xs text-slate-500 mt-1">Start a shift before entering closing readings.</p>
        <button onClick={onBack} className="mt-4 text-orange-400 text-xs font-bold">
          Back to Dashboard
        </button>
      </div>
    )
  }

  const handleOpenConfirm = () => {
    setError(null)
    if (!nozzleCalculations.allValid) {
      setError('Please enter valid closing readings for all assigned pump nozzles.')
      return
    }
    setShowConfirmModal(true)
  }

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const closings: MeterReading[] = openings.map((open, idx) => {
        const key = open.nozzleIndex ? `nozzle_${open.nozzleIndex}` : `nozzle_${idx}`
        return {
          fuelCode: open.fuelCode,
          value: parseNum(closingValues[key] || '0'),
          nozzleIndex: open.nozzleIndex || (idx + 1),
          nozzleLabel: open.nozzleLabel || `Nozzle ${idx + 1} (${open.fuelCode})`,
        }
      })

      const remittance: Partial<PaymentsBreakdown> = {
        CASH: cashNum,
        MOMO: momoNum,
        VOUCHER: cardNum, // VOUCHER/POS
        CREDIT: creditNum,
      }

      await closeShift({
        closingReadings: closings,
        notes: notes.trim() || undefined,
        remittance,
      })

      setShowConfirmModal(false)
      onClosed()
    } catch (err) {
      setError(describeError(err))
      setSubmitting(false)
      setShowConfirmModal(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader
        title="End Shift & Closing Meters"
        subtitle={`${activeShift.pumpName} · ${activeShift.number}`}
        onBack={onBack}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-lg w-full mx-auto pb-10">
        {/* Banner with instruction */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3.5 flex items-start gap-3 shadow-md">
          <Gauge className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-white">Enter Closing Pump Meter Readings</p>
            <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
              Read the cumulative meter on your dispenser nozzles. The system will immediately compute your total
              litres sold and the exact cash you must have at hand.
            </p>
          </div>
        </div>

        {/* Closing meters per nozzle */}
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Dispensers / Nozzles</span>
            <span className="text-[10px] text-slate-500 font-normal">Prices fixed by Station Manager & HQ</span>
          </p>

          {nozzleCalculations.perNozzle.map(nozzle => {
            const fuelMeta = FUEL_META[nozzle.fuelCode] || { color: '#F97316', label: nozzle.fuelCode }
            return (
              <div
                key={nozzle.key}
                className={`rounded-2xl bg-slate-900 border p-4 transition shadow-md ${
                  nozzle.validationError
                    ? 'border-slate-800'
                    : 'border-orange-500/40 ring-1 ring-orange-500/10'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-black text-white uppercase tracking-wider shadow-sm"
                      style={{ backgroundColor: fuelMeta.color }}
                    >
                      {nozzle.fuelCode}
                    </span>
                    <div>
                      <span className="text-xs font-extrabold text-white block">{fuelMeta.label}</span>
                      <span className="text-[10px] font-mono font-bold text-orange-400 block">{nozzle.sideLabel}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Unit Rate</span>
                    <span className="text-xs font-mono font-extrabold text-amber-400">
                      GHS {nozzle.unitPrice.toFixed(2)} / L
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Opening Meter</span>
                    <span className="text-sm font-mono font-black text-slate-200">
                      {nozzle.openingReading.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Closing Meter <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={nozzle.rawInput}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '')
                        setClosingValues(prev => ({ ...prev, [nozzle.key]: val }))
                      }}
                      placeholder={nozzle.openingReading.toFixed(2)}
                      className={`w-full rounded-xl bg-slate-950 border px-3 py-2 text-right font-mono text-sm font-bold text-white placeholder:text-slate-700 outline-none transition ${
                        nozzle.validationError
                          ? 'border-rose-500/80 focus:border-rose-400'
                          : 'border-slate-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                      }`}
                    />
                  </div>
                </div>

                {nozzle.validationError && nozzle.rawInput.trim().length > 0 && (
                  <p className="text-[11px] font-bold text-rose-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {nozzle.validationError}
                  </p>
                )}

                {/* Live calculation for this nozzle */}
                {nozzle.hasInput && !nozzle.validationError && (
                  <div className="mt-3 pt-3 border-t border-slate-800/70 flex items-center justify-between text-xs bg-slate-950/40 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Sold Volume</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {formatLitres(nozzle.litresSold)} L
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-600" />
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-medium">Expected Sales</span>
                      <span className="font-mono font-black text-white">
                        {formatGHS(nozzle.productSales)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── KEY HIGHLIGHT CARD: Litres Sold & Cash to Have at Hand ── */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border-2 border-orange-500/50 p-4 shadow-xl shadow-orange-950/30">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-5 h-5 text-orange-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-orange-400">
              Shift Sales Calculation
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3">
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Litres Sold</p>
              <p className="text-2xl font-black text-white font-mono mt-0.5">
                {nozzleCalculations.totalLitres.toFixed(2)}
                <span className="text-xs font-normal text-slate-400 ml-1">L</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-1">all pump nozzles</p>
            </div>

            <div className="bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/40 rounded-xl p-3">
              <p className="text-[10px] uppercase font-bold text-amber-300">Cash to Have at Hand</p>
              <p className="text-2xl font-black text-orange-400 font-mono mt-0.5">
                {formatGHS(nozzleCalculations.totalCashExpected)}
              </p>
              <p className="text-[10px] text-orange-300/80 mt-1 font-semibold">expected revenue</p>
            </div>
          </div>

          <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-orange-400 shrink-0" />
            <p className="text-[11px] text-orange-200 leading-snug">
              Based on closing meters, you must account for{' '}
              <span className="font-extrabold text-white">{formatGHS(nozzleCalculations.totalCashExpected)}</span>{' '}
              at hand.
            </p>
          </div>
        </div>

        {/* ── Payment Remittance & Handover ── */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-md flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-white">
                Payment Handover Remittance
              </h4>
              <p className="text-[11px] text-slate-400">Enter the actual cash & electronic payments you are remitting</p>
            </div>
            {nozzleCalculations.totalCashExpected > 0 && (
              <button
                type="button"
                onClick={handleQuickMatchCash}
                className="px-2.5 py-1 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[10px] font-black hover:bg-orange-500/30 transition"
              >
                All in Cash
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Cash at Hand (GHS)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cashRemit}
                onChange={e => setCashRemit(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 focus:border-orange-500 px-3 py-2.5 text-right font-mono text-sm font-bold text-white placeholder:text-slate-700 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Mobile Money / MoMo (GHS)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={momoRemit}
                onChange={e => setMomoRemit(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 focus:border-orange-500 px-3 py-2.5 text-right font-mono text-sm font-bold text-white placeholder:text-slate-700 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Card / POS (GHS)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cardRemit}
                onChange={e => setCardRemit(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 focus:border-orange-500 px-3 py-2.5 text-right font-mono text-sm font-bold text-white placeholder:text-slate-700 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Credit / Debt (GHS)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={creditRemit}
                onChange={e => setCreditRemit(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0.00"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 focus:border-orange-500 px-3 py-2.5 text-right font-mono text-sm font-bold text-white placeholder:text-slate-700 outline-none"
              />
            </div>
          </div>

          {/* Variance Status Box */}
          <div
            className={`rounded-xl p-3 flex items-center justify-between border ${
              variance === 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : variance > 0
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div>
              <p className="text-[10px] uppercase font-black tracking-wider opacity-80">
                {variance === 0
                  ? 'Balanced — Exact Handover'
                  : variance > 0
                  ? 'Overage (Extra Cash)'
                  : 'Shortage (Under Remittance)'}
              </p>
              <p className="text-xs font-medium text-slate-300 mt-0.5">
                Total Remitted: <span className="font-bold text-white font-mono">{formatGHS(totalRemitted)}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold block opacity-70">Variance</span>
              <span className="text-lg font-black font-mono">
                {variance > 0 ? `+${formatGHS(variance)}` : formatGHS(variance)}
              </span>
            </div>
          </div>

          {variance < 0 && (
            <p className="text-[11px] text-amber-300 flex items-center gap-1.5 leading-snug">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              You are remitting {formatGHS(Math.abs(variance))} less than expected. Please explain below in the
              closing note.
            </p>
          )}
        </div>

        {/* Closing Note */}
        <div>
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-2">
            Closing Shift Note (Optional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Pump calibration dispense 5L, or discrepancy explanation..."
            className="w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition resize-none"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs font-bold text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleOpenConfirm}
          disabled={!nozzleCalculations.allValid}
          className="sticky bottom-4 w-full rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 text-sm font-black flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-xl shadow-orange-950/60 border border-orange-400/30"
        >
          <Lock className="w-5 h-5" />
          Review & Lock Shift
        </button>
      </div>

      {/* ── Confirmation Modal ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Lock Shift Confirmation</h3>
                <p className="text-[11px] text-slate-400">{activeShift.pumpName} · {activeShift.number}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 border border-slate-800 p-3 flex flex-col gap-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Total Litres Sold:</span>
                <span className="font-mono font-bold text-white">
                  {nozzleCalculations.totalLitres.toFixed(2)} L
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Expected Cash at Hand:</span>
                <span className="font-mono font-black text-amber-400">
                  {formatGHS(nozzleCalculations.totalCashExpected)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Total Handover Remitted:</span>
                <span className="font-mono font-bold text-white">{formatGHS(totalRemitted)}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-bold">
                <span className="text-slate-300">Variance:</span>
                <span
                  className={`font-mono font-black ${
                    variance === 0 ? 'text-emerald-400' : variance > 0 ? 'text-blue-400' : 'text-rose-400'
                  }`}
                >
                  {formatGHS(variance)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-snug">
              Once submitted, meter figures and payments are locked and queued for supervisor review and sync.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                onClick={() => void handleFinalSubmit()}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-lg shadow-orange-950/50"
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {submitting ? 'Locking…' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}