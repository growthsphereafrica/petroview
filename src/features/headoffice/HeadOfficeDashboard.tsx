/**
 * Production Head Office dashboard — live enterprise rollup computed from
 * the production database across all stations. Supports date-range filtering,
 * CSV export and a printable report view.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Clock3, DollarSign, Download, Flame, MapPin, Layers, Printer, RefreshCw, Users } from 'lucide-react'
import { rollupService, type HeadOfficeSummary } from '../../core/services/rollupService'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { shiftStatusLabel, shiftStatusTone } from '../supervisor/util'
import { Badge, Card, StatusBar } from '../shared/ui'
import { formatDateTime, formatGHS, formatLitres } from '../../utils/currencyFormatter'

type RangeDays = 1 | 7 | 30 | null

const RANGES: { key: RangeDays; label: string }[] = [
  { key: 1, label: 'Today' },
  { key: 7, label: '7 Days' },
  { key: 30, label: '30 Days' },
  { key: null, label: 'All Time' },
]

const Splash: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center bg-[#090d16] gap-3">
    <span className="w-10 h-10 border-4 border-slate-800 border-t-orange-500 rounded-full animate-spin" />
    <p className="text-xs font-mono text-slate-400">Computing PetroView enterprise rollup…</p>
  </div>
)

function toCsv(summary: HeadOfficeSummary): string {
  const header = 'Station,Shifts,Shares,Litres,Sales,Variance,Review Status'
  const rows = summary.stations.map(st =>
    [st.name, st.shiftCount, st.region, st.litresToday, st.salesToday, st.netVariance].join(','),
  )
  const leader = summary.attendants.map(a => [a.employeeCode, a.name, a.stationName, a.shiftsClosed, a.litres, a.sales, a.variance].join(','))
  return [header, ...rows, '', 'Attendant,Name,Station,Shifts,Litres,Sales,Variance', ...leader].join('\n')
}

export const ProductionHeadOfficeDashboard: React.FC = () => {
  const [summary, setSummary] = useState<HeadOfficeSummary | null>(null)
  const [range, setRange] = useState<RangeDays>(1)
  const [refreshing, setRefreshing] = useState(false)

  const load = useMemo(
    () => async () => {
      setRefreshing(true)
      try {
        setSummary(await rollupService.summary(range === null ? undefined : { days: range }))
      } finally {
        setRefreshing(false)
      }
    },
    [range],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Live replication: a new shift or review elsewhere refreshes the rollup.
  useLiveChanges(
    useMemo(() => () => { void load() }, [load]),
  )

  const topStations = useMemo(() => {
    if (!summary) return []
    return [...summary.stations].sort((a, b) => b.salesToday - a.salesToday)
  }, [summary])

  const downloadCsv = () => {
    if (!summary) return
    const blob = new Blob([toCsv(summary)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `petroview-report-${range ?? 'all'}-days.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => window.print()

  if (!summary) return <Splash />

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto print:bg-white print:text-black">
      <StatusBar online />
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800/80 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-950/40 border border-orange-400/30">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-white flex items-center gap-1.5">
              Head Office Rollup <Flame className="w-3.5 h-3.5 text-orange-400" />
            </p>
            <p className="text-[10px] font-mono text-slate-400">PetroView Enterprise · {summary.stationCount} stations · {summary.currency}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={downloadCsv}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={printReport}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Print / Share report"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => void load()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Date range filter */}
      <div className="shrink-0 px-4 py-2 flex gap-2 overflow-x-auto print:hidden">
        {RANGES.map(r => (
          <button
            key={String(r.key)}
            onClick={() => setRange(r.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
              range === r.key
                ? 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/50 text-white shadow-sm ring-1 ring-orange-400/30'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono text-slate-500 self-center">
          {summary.rangeDays ? `last ${summary.rangeDays} day(s)` : 'all time'} · {summary.totalShifts} shifts
        </span>
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-lg w-full mx-auto">
        {/* Overall KPIs */}
        <div className="grid grid-cols-2 gap-3 print:grid-cols-2">
          <Card className="p-4 border-orange-500/20 bg-slate-900/90 shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-orange-400" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Revenue in period</p>
            </div>
            <p className="text-xl font-black text-orange-400">{formatGHS(summary.salesToday, { noPrefix: true })}</p>
            <p className="text-[10px] text-slate-500">{formatLitres(summary.litresToday)} litres across {summary.shiftsToday} closing shifts</p>
          </Card>
          <Card className="p-4 bg-slate-900/90 shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Net variance</p>
            </div>
            <p className={`text-xl font-black ${Math.abs(summary.netVariance) < 5 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatGHS(summary.netVariance, { noPrefix: true, showSign: true })}
            </p>
            <p className="text-[10px] text-slate-500">across closed shifts in period</p>
          </Card>
        </div>

        <div className="grid grid-cols-4 gap-3 print:grid-cols-4">
          <Card className="p-3 text-center">
            <p className="text-sm font-black text-white">{summary.totalShifts}</p>
            <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Shifts</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-sm font-black text-amber-400">{summary.pendingReview}</p>
            <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">To review</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-sm font-black text-orange-400">{summary.syncCompliancePct}%</p>
            <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Sync</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-sm font-black text-amber-400">{summary.pendingSync}</p>
            <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Queued</p>
          </Card>
        </div>

        {/* Decision health */}
        <Card className="p-4 print:hidden">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-orange-400" /> Review health
          </h4>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden flex">
            <div className="bg-orange-500 h-full" style={{ width: `${pct(summary.approved, summary.approved + summary.rejected)}%` }} />
            <div className="bg-rose-500 h-full" style={{ width: `${pct(summary.rejected, summary.approved + summary.rejected)}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px]">
            <span className="text-orange-400 font-bold">{summary.approved} approved</span>
            <span className="text-rose-400 font-bold">{summary.rejected} rejected</span>
          </div>
          {summary.pendingReview > 0 && (
            <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {summary.pendingReview} shift{summary.pendingReview === 1 ? '' : 's'} across the network still await review.
            </div>
          )}
        </Card>

        {/* Per-station table */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Stations</h4>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[9px] uppercase font-bold text-slate-500">
              <span>Station</span>
              <span className="text-right">Litres</span>
              <span className="text-right">Sales</span>
              <span className="text-right">Var</span>
            </div>
            {topStations.map(st => (
              <div key={st.stationId} className="px-4 py-3 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">{st.name}</p>
                  <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-orange-400" /> {st.region} {st.pendingReview > 0 && `· ${st.pendingReview} to review`}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-300 text-right">{Math.round(st.litresToday)}L</span>
                <span className="text-[11px] font-mono text-white font-bold text-right">{formatGHS(st.salesToday, { noPrefix: true })}</span>
                <span className={`text-[10px] font-mono font-black text-right ${Math.abs(st.netVariance) < 5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatGHS(st.netVariance, { noPrefix: true, showSign: true })}
                </span>
              </div>
            ))}
          </Card>
        </div>

        {/* Attendant leaderboard */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-orange-400" /> Attendant leaderboard
          </h4>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {summary.attendants.slice(0, 6).map((a, i) => (
              <div key={a.employeeCode} className="px-4 py-2.5 flex items-center gap-3">
                <span className="w-5 text-center text-[10px] font-black text-orange-400">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">{a.name}</p>
                  <p className="text-[10px] font-mono text-slate-500">{a.employeeCode} · {a.stationName}</p>
                </div>
                <span className="text-[10px] text-slate-500">{a.shiftsClosed} shifts</span>
                <span className="text-[11px] font-mono text-white font-bold">{formatGHS(a.sales, { noPrefix: true })}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Recent activity */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5 text-orange-400" /> Recent shift activity
          </h4>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {summary.recentShifts.length === 0 ? (
              <p className="px-4 py-5 text-xs text-slate-500 text-center">No shifts in this period.</p>
            ) : (
              summary.recentShifts.map(s => (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white truncate">{s.attendantName} · {s.number}</p>
                    <p className="text-[10px] text-slate-500">{s.stationName} · {formatDateTime(s.closedAt ?? s.openedAt)}</p>
                  </div>
                  <span className="text-[11px] font-mono text-white font-bold">{formatGHS(s.actualTotal)}</span>
                  <Badge tone={shiftStatusTone(s.status)}>{shiftStatusLabel(s.status)}</Badge>
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="pb-4 text-center text-[10px] text-slate-500">
          Rollup generated {formatDateTime(summary.generatedAt)} · PetroView Forecourt Operating System
        </div>
      </div>
    </div>
  )
}

function pct(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 1000) / 10
}