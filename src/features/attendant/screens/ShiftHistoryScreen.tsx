/**
 * Attendant Shift & Submissions History Screen
 * Provides date-filtered submission logs, aggregate remittances (cash vs digital),
 * nozzle litres, variance tracking, and digital shift handover receipts.
 */

import React, { useMemo, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Droplet,
  Fuel,
  Info,
  Layers,
  Printer,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  AlertOctagon,
} from 'lucide-react'
import { useShift, useAttendantSession } from '../providers'
import { Badge, Card, ScreenHeader, StatusBar } from '../ui'
import { formatDateTime, formatGHS, formatTimeOnly } from '../../../utils/currencyFormatter'
import { formatShiftNozzles, extractShiftNozzlesList } from '../../../core/domain/config'
import type { Shift, ShiftStatus } from '../../../core/domain/types'

type DateFilter = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'ALL'

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'WEEK', label: 'Last 7 Days' },
  { key: 'MONTH', label: 'This Month' },
  { key: 'ALL', label: 'All History' },
]

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const today = new Date()
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

function isYesterday(iso: string): boolean {
  const d = new Date(iso)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
}

function isWithinDays(iso: string, days: number): boolean {
  const d = new Date(iso).getTime()
  const now = Date.now()
  return now - d <= days * 24 * 60 * 60 * 1000
}

function isSameMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export const ShiftHistoryScreen: React.FC<{
  onBack: () => void
  onCorrectShift?: (shift: Shift) => void
}> = ({ onBack, onCorrectShift }) => {
  const { shifts, loading } = useShift()
  const { attendant } = useAttendantSession()
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL')
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)

  const filteredShifts = useMemo(() => {
    return shifts.filter(s => {
      const date = s.closedAt || s.openedAt
      if (dateFilter === 'TODAY') return isToday(date)
      if (dateFilter === 'YESTERDAY') return isYesterday(date)
      if (dateFilter === 'WEEK') return isWithinDays(date, 7)
      if (dateFilter === 'MONTH') return isSameMonth(date)
      return true
    })
  }, [shifts, dateFilter])

  // Aggregate metrics over the selected period
  const aggregates = useMemo(() => {
    let totalExpected = 0
    let totalSubmitted = 0
    let totalCash = 0
    let totalMomo = 0
    let totalPos = 0
    let totalCredit = 0
    let totalLitres = 0

    for (const s of filteredShifts) {
      totalExpected += s.salesTotal || 0
      totalSubmitted += s.actualTotal || 0
      totalCash += s.payments?.CASH || 0
      totalMomo += s.payments?.MOMO || 0
      totalPos += s.payments?.VOUCHER || 0
      totalCredit += s.payments?.CREDIT || 0

      if (Array.isArray(s.sales)) {
        for (const sale of s.sales) {
          totalLitres += Number(sale.litres || 0)
        }
      }
    }

    const netVariance = totalSubmitted - totalExpected

    return {
      count: filteredShifts.length,
      totalExpected,
      totalSubmitted,
      totalCash,
      totalMomo,
      totalPos,
      totalCredit,
      totalLitres,
      netVariance,
    }
  }, [filteredShifts])

  const statusTone = (status: ShiftStatus): 'success' | 'danger' | 'warning' | 'info' | 'default' => {
    switch (status) {
      case 'APPROVED':
        return 'success'
      case 'REJECTED':
        return 'danger'
      case 'CLOSED':
        return 'warning'
      case 'OPEN':
        return 'info'
      default:
        return 'default'
    }
  }

  const statusLabel = (status: ShiftStatus) => {
    switch (status) {
      case 'APPROVED':
        return 'Approved'
      case 'REJECTED':
        return 'Rejected'
      case 'CLOSED':
        return 'Awaiting Review'
      case 'OPEN':
        return 'Active'
      default:
        return status
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader
        title="Shift & Submission History"
        subtitle={`${attendant?.fullName || 'Attendant'} · ${aggregates.count} shifts in period`}
        onBack={onBack}
      />

      <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto flex flex-col gap-4">
        {/* Date Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {DATE_FILTERS.map(f => {
            const active = dateFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setDateFilter(f.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                  active
                    ? 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/50 text-white shadow-sm ring-1 ring-orange-400/30'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Cumulative Submissions Summary KPI Card */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Total Remitted Over Period
              </p>
              <h2 className="text-2xl font-black text-white font-mono mt-0.5">
                {formatGHS(aggregates.totalSubmitted)}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Fuel Volume</p>
              <p className="text-sm font-extrabold text-orange-400 font-mono mt-0.5">
                {aggregates.totalLitres.toFixed(1)} L
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold block">💵 Cash at Hand</span>
              <span className="font-mono font-bold text-white mt-1 block">
                {formatGHS(aggregates.totalCash)}
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
              <span className="text-[10px] text-sky-400 font-bold block">📱 MoMo / POS</span>
              <span className="font-mono font-bold text-sky-300 mt-1 block">
                {formatGHS(aggregates.totalMomo + aggregates.totalPos)}
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold block">⛽ Expected Sales</span>
              <span className="font-mono font-bold text-slate-300 mt-1 block">
                {formatGHS(aggregates.totalExpected)}
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold block">⚖️ Net Variance</span>
              <span
                className={`font-mono font-black mt-1 block ${
                  aggregates.netVariance === 0
                    ? 'text-emerald-400'
                    : aggregates.netVariance > 0
                    ? 'text-sky-400'
                    : 'text-rose-400'
                }`}
              >
                {aggregates.netVariance === 0
                  ? 'Balanced'
                  : formatGHS(aggregates.netVariance, { showSign: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Shifts List */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
            Historical Submissions ({filteredShifts.length})
          </h3>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Loading shift records…</div>
          ) : filteredShifts.length === 0 ? (
            <Card className="p-8 text-center">
              <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-400">No shifts in this period</p>
              <p className="text-[11px] text-slate-600 mt-1">Try selecting a broader date filter above.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredShifts.map(s => {
                const isRejected = s.status === 'REJECTED'
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedShift(s)}
                    className={`rounded-2xl border transition p-4 cursor-pointer hover:border-slate-600 ${
                      isRejected
                        ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                        : 'bg-slate-900/80 border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-white">{s.number}</span>
                          <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
                          {s.notes && s.notes.includes('Resubmitted') && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              🔄 Resubmitted
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-300 mt-1">
                          {s.pumpName || 'Pump'} · <span className="text-slate-400">Nozzles: {formatShiftNozzles(s)}</span>
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                          {formatDateTime(s.openedAt)}
                          {s.closedAt ? ` → ${formatTimeOnly(s.closedAt)}` : ' (Ongoing)'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold uppercase text-slate-500">Declared</p>
                        <p className="text-sm font-black text-white font-mono mt-0.5">
                          {formatGHS(s.actualTotal)}
                        </p>
                        <p
                          className={`text-[10px] font-mono font-bold mt-0.5 ${
                            s.variance === 0
                              ? 'text-emerald-400'
                              : Math.abs(s.variance) < 5
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          Var: {formatGHS(s.variance, { showSign: true })}
                        </p>
                      </div>
                    </div>

                    {/* Quick payment tags & Rejection warning */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">
                          Cash: <strong className="text-white font-mono">{formatGHS(s.payments?.CASH ?? 0)}</strong>
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400">
                          MoMo: <strong className="text-sky-300 font-mono">{formatGHS(s.payments?.MOMO ?? 0)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-orange-400 font-bold hover:text-orange-300">
                        <span>View Handover Receipt</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {isRejected && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-[11px] text-rose-200 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
                          <span className="truncate font-semibold">{s.reviewerNotes || 'Manager rejected figures.'}</span>
                        </div>
                        {onCorrectShift && (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              onCorrectShift(s)
                            }}
                            className="shrink-0 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] rounded-lg transition"
                          >
                            Correct Now
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Handover Receipt Modal */}
      {selectedShift && (
        <ShiftReceiptModal
          shift={selectedShift}
          onClose={() => setSelectedShift(null)}
          onCorrectShift={onCorrectShift}
        />
      )}
    </div>
  )
}

/**
 * Detailed Shift Handover Receipt Modal
 */
const ShiftReceiptModal: React.FC<{
  shift: Shift
  onClose: () => void
  onCorrectShift?: (shift: Shift) => void
}> = ({ shift, onClose, onCorrectShift }) => {
  const nozzles = extractShiftNozzlesList(shift)

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <span>Shift Handover Receipt</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-orange-400 font-mono">
                {shift.number}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {shift.stationName || 'Forecourt'} · {shift.pumpName || 'Pump'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Timing & Attendant */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Forecourt Attendant:</span>
              <span className="font-extrabold text-white">{shift.attendantName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Opened At:</span>
              <span className="font-mono text-slate-300">{formatDateTime(shift.openedAt)}</span>
            </div>
            {shift.closedAt && (
              <div className="flex justify-between">
                <span className="text-slate-400">Closed At:</span>
                <span className="font-mono text-slate-300">{formatDateTime(shift.closedAt)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400">Review Status:</span>
              <span className="font-black uppercase text-orange-400">{shift.status}</span>
            </div>
          </div>

          {/* Meter Readings & Volume Breakdown */}
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Pump Meter Readings & Volumes
            </h4>
            <div className="space-y-2">
              {nozzles.map((nz, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-black text-white">{nz.nozzleLabel || `Nozzle ${nz.nozzleIndex || i + 1}`}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                      {nz.fuelCode}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
                    <div>
                      <span className="text-[9px] block text-slate-500 uppercase">Open</span>
                      <span className="text-slate-200">{nz.openingValue.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500 uppercase">Close</span>
                      <span className="text-slate-200">{nz.closingValue > 0 ? nz.closingValue.toFixed(2) : '—'}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] block text-slate-500 uppercase">Litres</span>
                      <span className="text-emerald-400 font-bold">{nz.litres.toFixed(2)} L</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remittance Breakdown */}
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
              Payment Remittance Handed Over
            </h4>
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">💵 Cash at Hand:</span>
                <span className="font-mono font-bold text-white">{formatGHS(shift.payments?.CASH ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">📱 Mobile Money (MoMo):</span>
                <span className="font-mono font-bold text-sky-400">{formatGHS(shift.payments?.MOMO ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">💳 POS / Vouchers:</span>
                <span className="font-mono font-bold text-purple-400">{formatGHS(shift.payments?.VOUCHER ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">📑 Credit Sales:</span>
                <span className="font-mono font-bold text-amber-400">{formatGHS(shift.payments?.CREDIT ?? 0)}</span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between font-black text-sm">
                <span className="text-white">Total Declared Takings:</span>
                <span className="text-orange-400 font-mono">{formatGHS(shift.actualTotal)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-slate-800/60">
                <span className="text-slate-400">Expected (From Meters):</span>
                <span className="text-slate-300 font-mono">{formatGHS(shift.salesTotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Reconciliation Variance:</span>
                <span
                  className={`font-mono font-extrabold ${
                    shift.variance === 0
                      ? 'text-emerald-400'
                      : shift.variance > 0
                      ? 'text-sky-400'
                      : 'text-rose-400'
                  }`}
                >
                  {shift.variance === 0 ? '0.00 (Balanced)' : formatGHS(shift.variance, { showSign: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Supervisor Decision & Notes */}
          {shift.reviewerNotes && (
            <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/30">
              <span className="text-[10px] font-black uppercase text-amber-400 block mb-1">
                Supervisor Feedback
              </span>
              <p className="text-xs text-amber-200 leading-snug">{shift.reviewerNotes}</p>
            </div>
          )}

          {shift.notes && (
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                Attendant Handover Note
              </span>
              <p className="text-xs text-slate-300 leading-snug">{shift.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2 transition"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            <span>Print Receipt</span>
          </button>

          {shift.status === 'REJECTED' && onCorrectShift ? (
            <button
              onClick={() => {
                onClose()
                onCorrectShift(shift)
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-extrabold text-xs flex items-center gap-2 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Correct & Resubmit</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs transition"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
