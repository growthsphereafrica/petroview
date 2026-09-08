/**
 * Closing Readings & End Shift — capture closing meter figures,
 * add notes, and lock the shift for supervisor review.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { MeterReadingsScreen } from './MeterReadingsScreen'
import { useShift } from '../providers'
import { computeFuelSales, sumSales } from '../../../core/domain/rules'
import { productService } from '../../../core/services/productService'
import { formatGHS } from '../../../utils/currencyFormatter'
import { describeError } from '../../../core/domain/errors'
import type { MeterReading } from '../../../core/domain/types'

export const ClosingReadingsScreen: React.FC<{ onBack: () => void; onClosed: () => void }> = ({ onBack, onClosed }) => {
  const { activeShift, closeShift } = useShift()
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState<MeterReading[] | null>(null)
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    productService.getFuelPriceMap().then(setFuelPrices).catch(() => {})
  }, [])

  const { variance, expectedTotal } = useMemo(() => {
    if (!activeShift || !closing) return { variance: 0, expectedTotal: 0 }
    const sales = computeFuelSales(activeShift.openingReadings, closing, fuelPrices as any)
    const expected = sumSales(sales)
    return { variance: Math.round((activeShift.actualTotal - expected) * 100) / 100, expectedTotal: expected }
  }, [activeShift, closing, fuelPrices])

  if (!activeShift) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 px-6 text-center">
        <p className="text-sm font-bold text-white">No open shift</p>
        <p className="text-xs text-slate-500 mt-1">Start a shift before closing.</p>
        <button onClick={onBack} className="mt-4 text-emerald-400 text-xs font-bold">Back to dashboard</button>
      </div>
    )
  }

  // Step 1: closing meter readings.
  if (!closing) {
    return <MeterReadingsScreen pumpId={activeShift.pumpId} mode="closing" onBack={onBack} onSave={setClosing} />
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await closeShift({ closingReadings: closing, notes: notes || undefined })
      onClosed()
    } catch (err) {
      setError(describeError(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4 max-w-md w-full mx-auto">
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Shift variance check</p>
          <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${variance === 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
            <span className="text-xs font-bold text-slate-300">
              {variance === 0 ? 'Reconciled — no variance' : 'Variance — review below'}
            </span>
            <span className={`text-xl font-black ${variance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {formatGHS(variance)}
            </span>
          </div>
          {variance !== 0 && (
            <p className="text-[11px] text-slate-400 mt-2 leading-snug flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              Metered sales {formatGHS(expectedTotal)} but {formatGHS(activeShift.actualTotal)} was collected.
              Add a note explaining the difference.
            </p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">Closing note (optional)</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. GHS 20 not counted — evidence attached to shift"
            className="w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500 outline-none transition resize-none"
          />
        </div>

        {error && <p className="text-xs font-bold text-rose-400">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={submitting}
          className="w-full rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 py-4 text-sm font-black flex items-center justify-center gap-2 transition active:scale-[0.98]"
        >
          {submitting ? <span className="w-4 h-4 border-2 border-slate-900/40 border-t-slate-900 rounded-full animate-spin" /> : <Lock className="w-5 h-5" />}
          {submitting ? 'Locking shift…' : 'Lock Shift & Close'}
        </button>
      </div>
    </div>
  )
}