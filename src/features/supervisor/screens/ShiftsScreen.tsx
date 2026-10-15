/**
 * Supervisor Shift Register & Daily Forecourt Reconciliation Screen
 * Comprehensive transaction history by date, attendant, and status,
 * complete with Daily Sales Report (DSR) reconciliation summaries and print capabilities.
 */

import React, { useMemo, useState } from 'react'
import {
  ClipboardCheck,
  Fuel,
  Gauge,
  User,
  ChevronRight,
  Calendar,
  DollarSign,
  Printer,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { useSupervisorData, useSupervisorSession } from '../providers'
import { Badge, Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { shiftStatusLabel, shiftStatusTone } from '../util'
import { PRODUCTION_STATIONS, getStationById, getStationName, formatShiftNozzles, extractShiftNozzlesList } from '../../../core/domain/config'
import { formatDateTime, formatGHS, formatTimeOnly } from '../../../utils/currencyFormatter'
import type { Shift, ShiftStatus } from '../../../core/domain/types'

type StatusFilter = 'ALL' | ShiftStatus
type StationFilter = 'ALL' | string
type DateFilter = 'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All Status' },
  { key: 'CLOSED', label: 'To Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'OPEN', label: 'Open' },
]

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'ALL', label: 'All Time' },
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'WEEK', label: 'Last 7 Days' },
  { key: 'MONTH', label: 'This Month' },
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

export const SupervisorShiftsScreen: React.FC<{
  onBack: () => void
  onOpenShift: (shiftId: string) => void
}> = ({ onBack, onOpenShift }) => {
  const { shifts, loading, refresh } = useSupervisorData()
  const { supervisor } = useSupervisorSession()
  const isHQ = !!supervisor?.isHeadOffice
  const stationId = supervisor?.stationId
  const stationName = stationId ? getStationName(stationId) : 'Station Forecourt'

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [stationFilter, setStationFilter] = useState<StationFilter>(isHQ ? 'ALL' : stationId || 'ALL')
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL')
  const [attendantFilter, setAttendantFilter] = useState<string>('ALL')
  const [showPrintModal, setShowPrintModal] = useState(false)

  // Unique list of attendants with shifts in memory
  const attendantsList = useMemo(() => {
    const map = new Map<string, string>()
    shifts.forEach(s => {
      if (s.attendantId && s.attendantName) {
        map.set(s.attendantId, s.attendantName)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [shifts])

  const filtered = useMemo(() => {
    const rows = shifts.filter(s => {
      const matchStatus = statusFilter === 'ALL' || s.status === statusFilter
      const matchStation = isHQ
        ? stationFilter === 'ALL' || s.stationId === stationFilter
        : !stationId || s.stationId === stationId

      const matchAttendant = attendantFilter === 'ALL' || s.attendantId === attendantFilter

      const date = s.closedAt || s.openedAt
      let matchDate = true
      if (dateFilter === 'TODAY') matchDate = isToday(date)
      else if (dateFilter === 'YESTERDAY') matchDate = isYesterday(date)
      else if (dateFilter === 'WEEK') matchDate = isWithinDays(date, 7)
      else if (dateFilter === 'MONTH') matchDate = isSameMonth(date)

      return matchStatus && matchStation && matchAttendant && matchDate
    })
    return [...rows].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  }, [shifts, statusFilter, stationFilter, isHQ, stationId, attendantFilter, dateFilter])

  // Station Daily Reconciliation Aggregates for filtered view
  const reconciliation = useMemo(() => {
    let expectedTotal = 0
    let actualTotal = 0
    let cashTotal = 0
    let momoTotal = 0
    let posTotal = 0
    let creditTotal = 0
    let totalLitres = 0
    let approvedCount = 0
    let pendingCount = 0
    let rejectedCount = 0

    for (const s of filtered) {
      expectedTotal += s.salesTotal || 0
      actualTotal += s.actualTotal || 0
      cashTotal += s.payments?.CASH || 0
      momoTotal += s.payments?.MOMO || 0
      posTotal += s.payments?.VOUCHER || 0
      creditTotal += s.payments?.CREDIT || 0

      if (s.status === 'APPROVED') approvedCount++
      else if (s.status === 'CLOSED') pendingCount++
      else if (s.status === 'REJECTED') rejectedCount++

      if (Array.isArray(s.sales)) {
        for (const sale of s.sales) {
          totalLitres += Number(sale.litres || 0)
        }
      }
    }

    const netVariance = actualTotal - expectedTotal

    return {
      count: filtered.length,
      expectedTotal,
      actualTotal,
      cashTotal,
      momoTotal,
      posTotal,
      creditTotal,
      totalLitres,
      netVariance,
      approvedCount,
      pendingCount,
      rejectedCount,
    }
  }, [filtered])

  const pendingCount = reconciliation.pendingCount

  const chipClass = (active: boolean) =>
    active
      ? 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/50 text-white shadow-sm ring-1 ring-orange-400/30'
      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader
        title="Shift & Reconciliation Register"
        subtitle={`${pendingCount} awaiting review · ${isHQ ? 'all stations' : stationName}`}
        onBack={onBack}
        right={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowPrintModal(true)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-orange-400 transition"
              title="Print Daily Sales Reconciliation Report"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={() => void refresh()}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-orange-400 transition"
              title="Refresh register"
            >
              <ClipboardCheck className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* Date Filters Bar */}
      <div className="shrink-0 px-4 pt-3 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          <Calendar className="w-4 h-4 text-orange-400 mr-1" />
          {DATE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${chipClass(dateFilter === f.key)}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Attendant Picker */}
        <div className="shrink-0 flex items-center gap-1 text-xs">
          <span className="text-slate-400 font-bold hidden sm:inline">Staff:</span>
          <select
            value={attendantFilter}
            onChange={e => setAttendantFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
          >
            <option value="ALL">All Attendants</option>
            {attendantsList.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status filter */}
      <div className="shrink-0 px-4 pt-2.5 flex gap-2 overflow-x-auto no-scrollbar">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${chipClass(statusFilter === f.key)}`}
          >
            {f.label}
            {f.key === 'CLOSED' && pendingCount > 0 ? <span className="ml-1 text-amber-200">({pendingCount})</span> : null}
          </button>
        ))}
      </div>

      {/* Station filter (Only for Head Office with multi-station fleet access) */}
      {isHQ && (
        <div className="shrink-0 px-4 pt-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setStationFilter('ALL')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${chipClass(stationFilter === 'ALL')}`}
          >
            All stations
          </button>
          {PRODUCTION_STATIONS.map(st => (
            <button
              key={st.id}
              onClick={() => setStationFilter(stationFilter === st.id ? 'ALL' : st.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${chipClass(stationFilter === st.id)}`}
            >
              {st.name}
            </button>
          ))}
        </div>
      )}

      {/* Station Daily Reconciliation Summary Card (DSR) */}
      <div className="shrink-0 px-4 pt-3 max-w-4xl w-full mx-auto">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Daily Forecourt Reconciliation ({DATE_FILTERS.find(d => d.key === dateFilter)?.label})
              </span>
              <div className="flex items-baseline gap-3 mt-0.5">
                <span className="text-2xl font-black text-white font-mono">
                  {formatGHS(reconciliation.actualTotal)}
                </span>
                <span className="text-xs text-slate-400">
                  Total Remitted ({reconciliation.count} shifts)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPrintModal(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition border border-slate-700"
              >
                <Printer className="w-3.5 h-3.5 text-orange-400" />
                <span>Export Report</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-xs">
            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold block">💵 Total Cash</span>
              <span className="font-mono font-bold text-white mt-1 block">
                {formatGHS(reconciliation.cashTotal)}
              </span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-sky-400 font-bold block">📱 MoMo / POS</span>
              <span className="font-mono font-bold text-sky-300 mt-1 block">
                {formatGHS(reconciliation.momoTotal + reconciliation.posTotal)}
              </span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold block">⛽ Pump Expected</span>
              <span className="font-mono font-bold text-slate-300 mt-1 block">
                {formatGHS(reconciliation.expectedTotal)}
              </span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold block">⚖️ Station Variance</span>
              <span
                className={`font-mono font-black mt-1 block ${
                  reconciliation.netVariance === 0
                    ? 'text-emerald-400'
                    : reconciliation.netVariance > 0
                    ? 'text-sky-400'
                    : 'text-rose-400'
                }`}
              >
                {reconciliation.netVariance === 0
                  ? 'Balanced'
                  : formatGHS(reconciliation.netVariance, { showSign: true })}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
            <div>
              <span>Volume Pumped: </span>
              <strong className="text-orange-400 font-mono">{reconciliation.totalLitres.toFixed(1)} Litres</strong>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-bold">✓ {reconciliation.approvedCount} Approved</span>
              <span className="text-amber-400 font-bold">⏳ {reconciliation.pendingCount} To Review</span>
              {reconciliation.rejectedCount > 0 && (
                <span className="text-rose-400 font-bold">✗ {reconciliation.rejectedCount} Rejected</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 max-w-4xl w-full mx-auto">
        {loading ? (
          <Card className="p-5 flex items-center gap-3">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-orange-500 rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Loading shifts…</span>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-6 text-center">
            <ClipboardCheck className="w-6 h-6 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-400">No shifts in this view</p>
            <p className="text-[11px] text-slate-600 mt-1">Try selecting a different date range or status filter.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {filtered.map(s => (
              <div
                key={s.id}
                onClick={() => onOpenShift(s.id)}
                className="p-3.5 sm:p-4 hover:bg-slate-800/40 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-white">{s.number}</span>
                      <Badge tone={shiftStatusTone(s.status)}>{shiftStatusLabel(s.status)}</Badge>
                      {s.notes && s.notes.includes('Resubmitted') && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          🔄 Resubmitted
                        </span>
                      )}
                    </div>

                    {/* Attendant & Dispenser Pump & Nozzle Details */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
                      <span className="inline-flex items-center gap-1 text-slate-200 font-bold bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                        <User className="w-3 h-3 text-orange-400" />
                        <span>Attendant: {s.attendantName}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-800/40">
                        <Fuel className="w-3 h-3 text-emerald-400" />
                        <span>{s.pumpName || 'Pump'}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-sky-300 font-semibold bg-sky-950/40 px-2 py-0.5 rounded-md border border-sky-800/40">
                        <Gauge className="w-3 h-3 text-sky-400" />
                        <span>Nozzles: {formatShiftNozzles(s)}</span>
                      </span>
                    </div>

                    {/* Remittance preview tags */}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                      <span>Cash: <strong className="text-white font-mono">{formatGHS(s.payments?.CASH ?? 0)}</strong></span>
                      <span>·</span>
                      <span>MoMo: <strong className="text-sky-300 font-mono">{formatGHS(s.payments?.MOMO ?? 0)}</strong></span>
                      <span>·</span>
                      <span>Exp: <strong className="text-slate-300 font-mono">{formatGHS(s.salesTotal)}</strong></span>
                    </div>

                    <p className="text-[10px] text-slate-500 mt-1">
                      {getStationById(s.stationId).name} · Opened {formatTimeOnly(s.openedAt)}
                      {s.closedAt ? ` · Closed ${formatTimeOnly(s.closedAt)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center shrink-0">
                  <div className="text-right">
                    <span className="block text-sm font-black text-white font-mono">{formatGHS(s.actualTotal)}</span>
                    <span className={`block text-[10px] font-mono font-bold ${s.variance === 0 ? 'text-emerald-400' : Math.abs(s.variance) < 5 ? 'text-amber-400' : 'text-rose-400'}`}>
                      Var: {formatGHS(s.variance, { showSign: true })}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Daily Reconciliation Print / Export Modal */}
      {showPrintModal && (
        <DailyReportModal
          shifts={filtered}
          stationName={stationName}
          dateLabel={DATE_FILTERS.find(d => d.key === dateFilter)?.label || 'Selected Period'}
          reconciliation={reconciliation}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  )
}

/**
 * Printable Daily Sales Reconciliation Report Modal
 */
const DailyReportModal: React.FC<{
  shifts: Shift[]
  stationName: string
  dateLabel: string
  reconciliation: {
    count: number
    expectedTotal: number
    actualTotal: number
    cashTotal: number
    momoTotal: number
    posTotal: number
    creditTotal: number
    totalLitres: number
    netVariance: number
  }
  onClose: () => void
}> = ({ shifts, stationName, dateLabel, reconciliation, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Modal Toolbar (hidden when printing) */}
        <div className="print:hidden p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-400" />
            <h3 className="text-sm font-extrabold">Station Daily Reconciliation Report</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Sheet Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-900 bg-white">
          <div className="border-b-2 border-slate-900 pb-3">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black uppercase tracking-tight text-slate-950">
                  {stationName}
                </h1>
                <p className="text-xs font-bold text-slate-600">Daily Shift Sales & Remittance Reconciliation</p>
              </div>
              <div className="text-right text-xs">
                <span className="font-bold text-slate-800 block">Period: {dateLabel}</span>
                <span className="text-slate-500 text-[10px]">Printed: {new Date().toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Key Totals Box */}
          <div className="grid grid-cols-4 gap-2 bg-slate-100 p-3 rounded-xl border border-slate-300 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-600 block uppercase">Total Pump Sales</span>
              <span className="text-sm font-black font-mono">{formatGHS(reconciliation.expectedTotal)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-600 block uppercase">Total Handed Over</span>
              <span className="text-sm font-black font-mono text-emerald-700">{formatGHS(reconciliation.actualTotal)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-600 block uppercase">Cash / MoMo</span>
              <span className="text-xs font-bold font-mono">
                {formatGHS(reconciliation.cashTotal)} / {formatGHS(reconciliation.momoTotal)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-600 block uppercase">Station Variance</span>
              <span className={`text-sm font-black font-mono ${reconciliation.netVariance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {reconciliation.netVariance === 0 ? 'Balanced' : formatGHS(reconciliation.netVariance, { showSign: true })}
              </span>
            </div>
          </div>

          {/* Table of Shifts */}
          <div>
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-200 text-slate-800 uppercase font-bold text-[10px] border-b border-slate-300">
                <tr>
                  <th className="p-2">Shift #</th>
                  <th className="p-2">Attendant</th>
                  <th className="p-2">Pump</th>
                  <th className="p-2 text-right">Expected</th>
                  <th className="p-2 text-right">Cash</th>
                  <th className="p-2 text-right">MoMo</th>
                  <th className="p-2 text-right">Declared</th>
                  <th className="p-2 text-right">Variance</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px] font-mono">
                {shifts.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-2 font-bold">{s.number}</td>
                    <td className="p-2 font-sans font-semibold">{s.attendantName}</td>
                    <td className="p-2 font-sans">{s.pumpName || 'Pump'}</td>
                    <td className="p-2 text-right">{formatGHS(s.salesTotal)}</td>
                    <td className="p-2 text-right">{formatGHS(s.payments?.CASH ?? 0)}</td>
                    <td className="p-2 text-right">{formatGHS(s.payments?.MOMO ?? 0)}</td>
                    <td className="p-2 text-right font-bold text-slate-950">{formatGHS(s.actualTotal)}</td>
                    <td className={`p-2 text-right font-bold ${s.variance < 0 ? 'text-rose-600' : s.variance > 0 ? 'text-blue-600' : 'text-slate-800'}`}>
                      {formatGHS(s.variance, { showSign: true })}
                    </td>
                    <td className="p-2 text-center font-sans font-bold text-[10px] uppercase">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signoff section */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-xs text-slate-700">
            <div className="border-t border-slate-400 pt-1">
              <p className="font-bold">Station Supervisor Signature</p>
              <p className="text-[10px] text-slate-500 mt-1">Date: __________________________</p>
            </div>
            <div className="border-t border-slate-400 pt-1">
              <p className="font-bold">Head Office / Auditor Verification</p>
              <p className="text-[10px] text-slate-500 mt-1">Date: __________________________</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}