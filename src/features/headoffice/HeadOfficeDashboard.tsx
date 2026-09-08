/**
 * Production Head Office Dashboard & Company HQ Portal.
 * - Live enterprise financial rollup computed from production DB
 * - Staff Onboarding & Approval Queue scoped to Company (Approve / Reject Attendants & Managers)
 * - Multi-station Staff Roster & Access Management
 * - Multi-Tenant company context awareness
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Clock3,
  DollarSign,
  Download,
  Flame,
  KeyRound,
  Layers,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  Zap,
} from 'lucide-react'
import { rollupService, type HeadOfficeSummary } from '../../core/services/rollupService'
import { supervisorService } from '../../core/services/supervisorService'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { shiftStatusLabel, shiftStatusTone } from '../supervisor/util'
import { Badge, Card, StatusBar } from '../shared/ui'
import { formatDateTime, formatGHS, formatLitres } from '../../utils/currencyFormatter'
import { PRODUCTION_STATIONS, getStationName } from '../../core/domain/config'
import { loadUnifiedSession, type UnifiedSession } from '../unified/UnifiedLoginScreen'
import type { Attendant, Supervisor } from '../../core/domain/types'

type RangeDays = 1 | 7 | 30 | null
type HQTab = 'overview' | 'approvals' | 'staff'

const RANGES: { key: RangeDays; label: string }[] = [
  { key: 1, label: 'Today' },
  { key: 7, label: '7 Days' },
  { key: 30, label: '30 Days' },
  { key: null, label: 'All Time' },
]

const Splash: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center bg-[#090d16] gap-3">
    <span className="w-10 h-10 border-4 border-slate-800 border-t-orange-500 rounded-full animate-spin" />
    <p className="text-xs font-mono text-slate-400">Computing enterprise rollup…</p>
  </div>
)

function toCsv(summary: HeadOfficeSummary): string {
  const header = 'Station,Shifts,Shares,Litres,Sales,Variance,Review Status'
  const rows = summary.stations.map(st =>
    [st.name, st.shiftCount, st.region, st.litresToday, st.salesToday, st.netVariance].join(','),
  )
  const leader = summary.attendants.map(a =>
    [a.employeeCode, a.name, a.stationName, a.shiftsClosed, a.litres, a.sales, a.variance].join(','),
  )
  return [header, ...rows, '', 'Attendant,Name,Station,Shifts,Litres,Sales,Variance', ...leader].join('\n')
}

export const ProductionHeadOfficeDashboard: React.FC<{ session?: UnifiedSession }> = ({ session: propsSession }) => {
  const activeSession = propsSession || loadUnifiedSession()
  const companyId = activeSession?.companyId
  const companyName = activeSession?.companyName || 'PetroView'
  const companyShortCode = activeSession?.companyShortCode || 'PV'

  const [activeTab, setActiveTab] = useState<HQTab>('overview')
  const [summary, setSummary] = useState<HeadOfficeSummary | null>(null)
  const [range, setRange] = useState<RangeDays>(1)
  const [refreshing, setRefreshing] = useState(false)

  // Staff & Approvals State (scoped to company)
  const [pendingStaff, setPendingStaff] = useState<{ attendants: Attendant[]; supervisors: Supervisor[] }>({
    attendants: [],
    supervisors: [],
  })
  const [allStaff, setAllStaff] = useState<{ attendants: Attendant[]; supervisors: Supervisor[] }>({
    attendants: [],
    supervisors: [],
  })
  const [staffSearch, setStaffSearch] = useState('')
  const [stationFilter, setStationFilter] = useState('ALL')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const loadData = useMemo(
    () => async () => {
      setRefreshing(true)
      try {
        const [sum, pending, all] = await Promise.all([
          rollupService.summary(range === null ? undefined : { days: range }),
          supervisorService.listPendingStaff(companyId),
          supervisorService.listAllStaff(companyId),
        ])
        setSummary(sum)
        setPendingStaff(pending)
        setAllStaff(all)
      } finally {
        setRefreshing(false)
      }
    },
    [range, companyId],
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Live replication: database changes trigger rollup & approval refresh
  useLiveChanges(
    useMemo(
      () => () => {
        void loadData()
      },
      [loadData],
    ),
  )

  const topStations = useMemo(() => {
    if (!summary) return []
    return [...summary.stations].sort((a, b) => b.salesToday - a.salesToday)
  }, [summary])

  const totalPendingCount = pendingStaff.attendants.length + pendingStaff.supervisors.length

  const handleApprove = async (id: string, role: 'attendant' | 'supervisor', name: string, code: string) => {
    setApprovingId(id)
    try {
      const approverTitle = `${companyName} HQ Admin`
      await supervisorService.approveStaff(id, role, approverTitle)
      setActionMessage({ text: `Successfully approved & activated ${name} (${code}).`, type: 'success' })
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch {
      setActionMessage({ text: `Failed to approve ${name}.`, type: 'error' })
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (id: string, role: 'attendant' | 'supervisor', name: string) => {
    if (!window.confirm(`Are you sure you want to reject registration for ${name}?`)) return
    setApprovingId(id)
    try {
      const approverTitle = `${companyName} HQ Admin`
      await supervisorService.rejectStaff(id, role, approverTitle, `Application rejected by ${companyName} HQ Administrator`)
      setActionMessage({ text: `Registration for ${name} has been rejected.`, type: 'success' })
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch {
      setActionMessage({ text: `Failed to reject ${name}.`, type: 'error' })
    } finally {
      setApprovingId(null)
    }
  }

  const downloadCsv = () => {
    if (!summary) return
    const blob = new Blob([toCsv(summary)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `petroview-${companyShortCode.toLowerCase()}-report-${range ?? 'all'}-days.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => window.print()

  if (!summary) return <Splash />

  // Filtered list of all staff
  const combinedStaff = [
    ...allStaff.supervisors.map(s => ({ ...s, staffType: 'supervisor' as const })),
    ...allStaff.attendants.map(a => ({ ...a, staffType: 'attendant' as const })),
  ].filter(s => {
    const matchStation = stationFilter === 'ALL' || s.stationId === stationFilter
    const matchSearch =
      !staffSearch.trim() ||
      s.fullName.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.employeeCode.toLowerCase().includes(staffSearch.toLowerCase())
    return matchStation && matchSearch
  })

  return (
    <div className="h-full flex flex-col bg-[#080c14] overflow-y-auto print:bg-white print:text-black">
      <StatusBar online />

      {/* Enterprise Navigation Header */}
      <div className="shrink-0 flex flex-wrap items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800/80 gap-3 print:hidden sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-950/40 border border-orange-400/30 font-black text-white text-xs">
            {companyShortCode}
          </div>
          <div>
            <p className="text-sm font-extrabold text-white flex items-center gap-1.5">
              <span>{companyName} HQ Console</span> <Flame className="w-3.5 h-3.5 text-orange-400" />
            </p>
            <p className="text-[10px] font-mono text-slate-400">
              Tier 2 Company Head Office · {summary.stationCount} Station Branches · {activeSession?.employeeCode || 'HQ Admin'}
            </p>
          </div>
        </div>

        {/* Action Buttons & Tabs */}
        <div className="flex items-center gap-2">
          {/* Main HQ Tabs */}
          <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition relative ${
                activeTab === 'approvals'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Pending Approvals</span>
              {totalPendingCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center animate-pulse">
                  {totalPendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('staff')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'staff'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff Roster</span>
            </button>
          </div>

          <button
            onClick={downloadCsv}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition"
            title="Export CSV Rollup"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={printReport}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Print Enterprise Report"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => void loadData()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Action Notification */}
      {actionMessage && (
        <div className="px-4 py-2 bg-emerald-950 border-b border-emerald-600/50 flex items-center justify-center gap-2 text-xs font-bold text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* ----------------- TAB 1: ENTERPRISE OVERVIEW ----------------- */}
      {activeTab === 'overview' && (
        <>
          {/* Date range filter */}
          <div className="shrink-0 px-4 py-2 flex gap-2 overflow-x-auto print:hidden border-b border-slate-900">
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

          <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-5xl w-full mx-auto">
            {/* Overall KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="p-4 border-orange-500/20 bg-slate-900/90 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-orange-400" />
                  <p className="text-[9px] uppercase font-bold text-slate-500">Revenue in period</p>
                </div>
                <p className="text-2xl font-black text-orange-400">{formatGHS(summary.salesToday, { noPrefix: true })}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {formatLitres(summary.litresToday)} litres across {summary.shiftsToday} closing shifts
                </p>
              </Card>

              <Card className="p-4 bg-slate-900/90 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <p className="text-[9px] uppercase font-bold text-slate-500">Net variance</p>
                </div>
                <p
                  className={`text-2xl font-black ${
                    Math.abs(summary.netVariance) < 5 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formatGHS(summary.netVariance, { noPrefix: true, showSign: true })}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">across closed shifts in period</p>
              </Card>

              <Card className="p-4 bg-slate-900/90 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <p className="text-[9px] uppercase font-bold text-slate-500">Pending Approvals</p>
                </div>
                <p className={`text-2xl font-black ${totalPendingCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {totalPendingCount}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {totalPendingCount > 0 ? (
                    <button
                      onClick={() => setActiveTab('approvals')}
                      className="text-amber-400 font-bold hover:underline"
                    >
                      Review pending staff queue →
                    </button>
                  ) : (
                    'All registrations approved'
                  )}
                </p>
              </Card>

              <Card className="p-4 bg-slate-900/90 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <p className="text-[9px] uppercase font-bold text-slate-500">Network Compliance</p>
                </div>
                <p className="text-2xl font-black text-cyan-400">{summary.syncCompliancePct}%</p>
                <p className="text-[10px] text-slate-500 mt-1">{summary.pendingSync} transactions queued in mesh</p>
              </Card>
            </div>

            {/* Stations & Leaderboards side-by-side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Per-station table */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-400" /> Stations Performance
                </h4>
                <Card className="divide-y divide-slate-800/70 overflow-hidden">
                  <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[9px] uppercase font-bold text-slate-500 bg-slate-950/60">
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
                          <MapPin className="w-3 h-3 text-orange-400" /> {st.region}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-slate-300 text-right">{Math.round(st.litresToday)}L</span>
                      <span className="text-[11px] font-mono text-white font-bold text-right">
                        {formatGHS(st.salesToday, { noPrefix: true })}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-black text-right ${
                          Math.abs(st.netVariance) < 5 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatGHS(st.netVariance, { noPrefix: true, showSign: true })}
                      </span>
                    </div>
                  ))}
                </Card>
              </div>

              {/* Attendant leaderboard */}
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-orange-400" /> Attendant Leaderboard
                </h4>
                <Card className="divide-y divide-slate-800/70 overflow-hidden">
                  {summary.attendants.slice(0, 5).map((a, i) => (
                    <div key={a.employeeCode} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-5 text-center text-[10px] font-black text-orange-400">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{a.name}</p>
                        <p className="text-[10px] font-mono text-slate-500">
                          {a.employeeCode} · {a.stationName}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-500">{a.shiftsClosed} shifts</span>
                      <span className="text-[11px] font-mono text-white font-bold">{formatGHS(a.sales, { noPrefix: true })}</span>
                    </div>
                  ))}
                </Card>
              </div>
            </div>

            {/* Recent shift activity */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5 text-orange-400" /> Recent Network Shifts
              </h4>
              <Card className="divide-y divide-slate-800/70 overflow-hidden">
                {summary.recentShifts.length === 0 ? (
                  <p className="px-4 py-5 text-xs text-slate-500 text-center">No shifts in this period.</p>
                ) : (
                  summary.recentShifts.slice(0, 6).map(s => (
                    <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">
                          {s.attendantName} · {s.number}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {s.stationName} · {formatDateTime(s.closedAt ?? s.openedAt)}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-white font-bold">{formatGHS(s.actualTotal)}</span>
                      <Badge tone={shiftStatusTone(s.status)}>{shiftStatusLabel(s.status)}</Badge>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ----------------- TAB 2: PENDING ONBOARDING APPROVALS ----------------- */}
      {activeTab === 'approvals' && (
        <div className="flex-1 px-4 py-6 max-w-4xl w-full mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-orange-400" />
                <span>{companyName} Staff Approvals Queue</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Review and authorize self-registered Attendants and Station Managers under {companyName}.
              </p>
            </div>
            <span className="text-xs font-mono px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              {totalPendingCount} Pending
            </span>
          </div>

          {totalPendingCount === 0 ? (
            <Card className="p-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">All Clear — No Pending Approvals</h4>
              <p className="text-xs text-slate-500 max-w-sm">
                Every registered attendant and station manager for {companyName} has been authorized.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Pending Attendants */}
              {pendingStaff.attendants.map(att => (
                <Card
                  key={att.id}
                  className="p-4 border-amber-500/30 bg-slate-900/90 shadow-lg flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{att.fullName}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono font-black text-emerald-400">{att.employeeCode}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                            Attendant
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Pending
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-400" />
                      <span>{getStationName(att.stationId)}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{att.phone || 'No phone provided'}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <Clock className="w-3 h-3" />
                      <span>Applied: {formatDateTime(att.createdAt)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(att.id, 'attendant', att.fullName, att.employeeCode)}
                      disabled={approvingId === att.id}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve & Activate</span>
                    </button>

                    <button
                      onClick={() => handleReject(att.id, 'attendant', att.fullName)}
                      disabled={approvingId === att.id}
                      className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-rose-400 text-xs font-bold transition"
                    >
                      Reject
                    </button>
                  </div>
                </Card>
              ))}

              {/* Pending Supervisors/Managers */}
              {pendingStaff.supervisors.map(sup => (
                <Card
                  key={sup.id}
                  className="p-4 border-amber-500/30 bg-slate-900/90 shadow-lg flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                        <UserCog className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{sup.fullName}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono font-black text-amber-400">{sup.employeeCode}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                            Manager
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Pending
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-400" />
                      <span>{getStationName(sup.stationId)}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{sup.phone || 'No phone provided'}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <Clock className="w-3 h-3" />
                      <span>Applied: {formatDateTime(sup.createdAt)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(sup.id, 'supervisor', sup.fullName, sup.employeeCode)}
                      disabled={approvingId === sup.id}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve & Activate</span>
                    </button>

                    <button
                      onClick={() => handleReject(sup.id, 'supervisor', sup.fullName)}
                      disabled={approvingId === sup.id}
                      className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-rose-400 text-xs font-bold transition"
                    >
                      Reject
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------- TAB 3: ENTERPRISE STAFF ROSTER ----------------- */}
      {activeTab === 'staff' && (
        <div className="flex-1 px-4 py-6 max-w-5xl w-full mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-400" />
                <span>{companyName} Staff Roster</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage all authorized attendants and station managers under {companyName}.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={staffSearch}
                  onChange={e => setStaffSearch(e.target.value)}
                  placeholder="Search name or ID…"
                  className="rounded-xl bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none"
                />
              </div>

              <select
                value={stationFilter}
                onChange={e => setStationFilter(e.target.value)}
                className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
              >
                <option value="ALL">All Stations</option>
                {PRODUCTION_STATIONS.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {combinedStaff.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-500">No staff found matching filters.</p>
            ) : (
              combinedStaff.map(staff => (
                <div key={staff.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        staff.staffType === 'supervisor'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {staff.staffType === 'supervisor' ? <UserCog className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white truncate">{staff.fullName}</p>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                            staff.staffType === 'supervisor'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {staff.staffType}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-bold text-slate-300">{staff.employeeCode}</span>
                        <span>·</span>
                        <span>{getStationName(staff.stationId)}</span>
                        {staff.phone && (
                          <>
                            <span>·</span>
                            <span>{staff.phone}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={staff.active ? 'success' : staff.approvalStatus === 'PENDING' ? 'warning' : 'danger'}>
                      {staff.active ? 'Active' : staff.approvalStatus}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      )}
    </div>
  )
}