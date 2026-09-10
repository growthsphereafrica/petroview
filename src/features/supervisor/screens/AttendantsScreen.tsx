/**
 * Production Station Manager / Supervisor Attendant Management & Performance Portal.
 * - Live attendant shift summaries by date period (Today, 7 Days, 30 Days, Custom Range)
 * - Fuel dispensing volume, revenue sales, cash/momo/credit collections, and variances
 * - Full attendant lifecycle: Register, Edit Profile, Reset 4-digit PIN, Deactivate/Activate
 * - Export station performance report to Excel (CSV) and Print-Ready PDF
 */

import React, { useEffect, useState, useMemo } from 'react'
import {
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
  Edit2,
  Flame,
  KeyRound,
  Layers,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  X,
  Zap,
} from 'lucide-react'
import { useSupervisorData, useSupervisorSession } from '../providers'
import { Badge, Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { PRODUCTION_PUMPS, getStationName } from '../../../core/domain/config'
import { rollupService, type HeadOfficeSummary, type AttendantRollup } from '../../../core/services/rollupService'
import { supervisorService } from '../../../core/services/supervisorService'
import { describeError } from '../../../core/domain/errors'
import { formatDateTime, formatGHS, formatLitres } from '../../../utils/currencyFormatter'
import type { Attendant } from '../../../core/domain/types'

type RangePreset = 'today' | '7days' | '30days' | 'all' | 'custom'
type SupervisorTab = 'summaries' | 'roster'

export const SupervisorAttendantsScreen: React.FC<{
  onBack: () => void
  onToast: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void
}> = ({ onBack, onToast }) => {
  const { attendants, registerAttendant, deactivateAttendant, resetPin } = useSupervisorData()
  const { supervisor } = useSupervisorSession()

  const [activeTab, setActiveTab] = useState<SupervisorTab>('summaries')
  const [rangePreset, setRangePreset] = useState<RangePreset>('today')
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [summaryData, setSummaryData] = useState<HeadOfficeSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Modals state
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [regFullName, setRegFullName] = useState('')
  const [regEmployeeCode, setRegEmployeeCode] = useState('')
  const [regPin, setRegPin] = useState('')
  const [regPumpId, setRegPumpId] = useState('')
  const [regBusy, setRegBusy] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)

  // PIN reset modal
  const [resetModalTarget, setResetModalTarget] = useState<{ id: string; name: string; code: string } | null>(null)
  const [newPinVal, setNewPinVal] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  // Edit attendant modal
  const [editModalTarget, setEditModalTarget] = useState<{
    id: string
    fullName: string
    employeeCode: string
    phone: string
    pumpId: string
    active: boolean
  } | null>(null)
  const [editBusy, setEditBusy] = useState(false)

  const stationId = supervisor?.stationId || 'STN-GV-042'
  const stationName = supervisor ? getStationName(supervisor.stationId) : 'Station Forecourt'

  // Fetch summary data for this station
  const loadStationSummary = useMemo(
    () => async () => {
      setLoadingSummary(true)
      try {
        let daysArg: number | null | undefined = undefined
        let startArg: string | undefined = undefined
        let endArg: string | undefined = undefined

        if (rangePreset === 'today') daysArg = 1
        else if (rangePreset === '7days') daysArg = 7
        else if (rangePreset === '30days') daysArg = 30
        else if (rangePreset === 'all') daysArg = null
        else if (rangePreset === 'custom') {
          startArg = customStartDate
          endArg = customEndDate
        }

        const sum = await rollupService.summary({
          days: daysArg,
          stationId,
          companyId: supervisor?.companyId,
          startDate: startArg,
          endDate: endArg,
        })
        setSummaryData(sum)
      } catch (err) {
        console.error('Failed to load station summaries', err)
      } finally {
        setLoadingSummary(false)
      }
    },
    [rangePreset, customStartDate, customEndDate, stationId, supervisor?.companyId],
  )

  useEffect(() => {
    void loadStationSummary()
  }, [loadStationSummary])

  // Register attendant submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)
    setRegBusy(true)
    try {
      await registerAttendant({
        fullName: regFullName,
        employeeCode: regEmployeeCode,
        pin: regPin,
        pumpId: regPumpId,
      })
      onToast(`Attendant ${regEmployeeCode.toUpperCase()} registered at ${stationName}.`, 'success')
      setRegFullName('')
      setRegEmployeeCode('')
      setRegPin('')
      setRegPumpId('')
      setShowRegisterForm(false)
      void loadStationSummary()
    } catch (err) {
      setRegError(describeError(err))
    } finally {
      setRegBusy(false)
    }
  }

  // Execute PIN reset
  const handleConfirmResetPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetModalTarget || newPinVal.length !== 4) return
    setResetBusy(true)
    try {
      await supervisorService.resetStaffPin(
        resetModalTarget.id,
        'attendant',
        newPinVal,
        supervisor?.fullName || 'Station Manager',
      )
      onToast(`PIN reset successfully for ${resetModalTarget.name} (${resetModalTarget.code}) to ${newPinVal}`, 'success')
      setResetModalTarget(null)
      setNewPinVal('')
    } catch (err) {
      onToast(describeError(err), 'error')
    } finally {
      setResetBusy(false)
    }
  }

  // Save Edit Attendant
  const handleSaveEditProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editModalTarget) return
    setEditBusy(true)
    try {
      await supervisorService.updateStaff(
        editModalTarget.id,
        'attendant',
        {
          fullName: editModalTarget.fullName,
          phone: editModalTarget.phone,
          active: editModalTarget.active,
        },
        supervisor?.fullName || 'Station Manager',
      )
      onToast(`Updated attendant profile for ${editModalTarget.fullName}`, 'success')
      setEditModalTarget(null)
      void loadStationSummary()
    } catch (err) {
      onToast(describeError(err), 'error')
    } finally {
      setEditBusy(false)
    }
  }

  // Export Station Report to CSV (Excel)
  const exportStationCsv = () => {
    if (!summaryData) return
    const periodLabel =
      rangePreset === 'custom' ? `${customStartDate}_to_${customEndDate}` : rangePreset

    const header = [
      'Attendant Code',
      'Attendant Name',
      'Phone',
      'Shifts Closed',
      'Volume Dispensed (L)',
      'Total Sales Revenue (GHS)',
      'Cash (GHS)',
      'Mobile Money (GHS)',
      'Credit (GHS)',
      'Net Variance (GHS)',
      'Approved Shifts',
      'Avg Shift Sales (GHS)',
      'Status',
    ]

    const rows = summaryData.attendants.map(a => [
      a.employeeCode,
      a.name,
      a.phone || 'N/A',
      a.shiftsClosed,
      a.litres.toFixed(2),
      a.sales.toFixed(2),
      (a.cashTotal || 0).toFixed(2),
      (a.momoTotal || 0).toFixed(2),
      (a.creditTotal || 0).toFixed(2),
      a.variance.toFixed(2),
      a.approved,
      a.avgShiftSales.toFixed(2),
      a.active ? 'ACTIVE' : a.approvalStatus,
    ])

    const csvContent = [
      [`${stationName} - Attendant Sales & Performance Summary Report`],
      [`Period: ${periodLabel} | Generated: ${formatDateTime(summaryData.generatedAt)}`],
      [`Supervisor / Manager: ${supervisor?.fullName || 'Manager'} (${supervisor?.employeeCode || 'SUP'})`],
      [''],
      [
        `Total Station Sales: GHS ${summaryData.salesToday.toFixed(2)}`,
        `Total Volume: ${summaryData.litresToday.toFixed(2)} L`,
        `Total Shifts: ${summaryData.totalShifts}`,
        `Net Variance: GHS ${summaryData.netVariance.toFixed(2)}`,
      ],
      [''],
      header,
      ...rows,
    ]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `station-attendants-${periodLabel}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Print PDF
  const printReport = () => window.print()

  // Filtered list of attendants
  const filteredRoster = attendants.filter(
    a =>
      !searchQuery.trim() ||
      a.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const filteredSummaries = (summaryData?.attendants || []).filter(
    a =>
      !searchQuery.trim() ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto print:bg-white print:text-black">
      <StatusBar online />
      <ScreenHeader
        title="Attendant Operations"
        subtitle={stationName}
        onBack={onBack}
        right={
          <div className="flex items-center gap-1.5 print:hidden">
            <button
              onClick={exportStationCsv}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 transition"
              title="Export CSV / Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={printReport}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
              title="Print PDF Report"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowRegisterForm(v => !v)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-orange-400 transition"
              title="Register attendant"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 px-4 py-3 max-w-5xl w-full mx-auto flex flex-col gap-3">
        {/* Navigation Tabs (Summaries vs Roster) */}
        <div className="flex items-center justify-between gap-2 print:hidden">
          <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('summaries')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'summaries'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Date Summaries</span>
            </button>

            <button
              onClick={() => setActiveTab('roster')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'roster'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Attendants Roster ({attendants.length})</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search code/name…"
              className="w-36 sm:w-48 pl-8 pr-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:border-orange-500 outline-none"
            />
          </div>
        </div>

        {/* ----------------- TAB 1: DATE SUMMARIES ----------------- */}
        {activeTab === 'summaries' && (
          <div className="flex flex-col gap-3">
            {/* Date Range Toolbar */}
            <div className="px-3 py-2 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setRangePreset('today')}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                    rangePreset === 'today'
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setRangePreset('7days')}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                    rangePreset === '7days'
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => setRangePreset('30days')}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                    rangePreset === '30days'
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  30 Days
                </button>
                <button
                  onClick={() => setRangePreset('all')}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                    rangePreset === 'all'
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  All Time
                </button>
                <button
                  onClick={() => setRangePreset('custom')}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                    rangePreset === 'custom'
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Custom
                </button>
              </div>

              {rangePreset === 'custom' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white outline-none"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-white outline-none"
                  />
                </div>
              )}
            </div>

            {/* Station Summary KPIs in period */}
            {summaryData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Card className="p-3 bg-slate-900/90 border-orange-500/20 shadow-md">
                  <p className="text-[9px] uppercase font-bold text-slate-500">Station Revenue</p>
                  <p className="text-base sm:text-lg font-black text-orange-400 mt-0.5">
                    {formatGHS(summaryData.salesToday, { noPrefix: true })}
                  </p>
                  <p className="text-[10px] text-slate-500">{formatLitres(summaryData.litresToday)}</p>
                </Card>

                <Card className="p-3 bg-slate-900/90 shadow-md">
                  <p className="text-[9px] uppercase font-bold text-slate-500">Closed Shifts</p>
                  <p className="text-base sm:text-lg font-black text-white mt-0.5">
                    {summaryData.totalShifts}
                  </p>
                  <p className="text-[10px] text-emerald-400">{summaryData.approved} approved</p>
                </Card>

                <Card className="p-3 bg-slate-900/90 shadow-md">
                  <p className="text-[9px] uppercase font-bold text-slate-500">Cash vs MoMo</p>
                  <p className="text-xs font-mono font-bold text-slate-200 mt-0.5">
                    Cash: {formatGHS(summaryData.paymentTotals?.cash || 0, { noPrefix: true })}
                  </p>
                  <p className="text-[10px] font-mono text-emerald-400">
                    MoMo: {formatGHS(summaryData.paymentTotals?.momo || 0, { noPrefix: true })}
                  </p>
                </Card>

                <Card className="p-3 bg-slate-900/90 shadow-md">
                  <p className="text-[9px] uppercase font-bold text-slate-500">Net Variance</p>
                  <p
                    className={`text-base sm:text-lg font-black mt-0.5 ${
                      Math.abs(summaryData.netVariance) < 5 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatGHS(summaryData.netVariance, { noPrefix: true, showSign: true })}
                  </p>
                  <p className="text-[10px] text-slate-500">across closed shifts</p>
                </Card>
              </div>
            )}

            {/* Attendants Performance Table */}
            <Card className="divide-y divide-slate-800/70 overflow-hidden shadow-lg">
              <div className="px-4 py-2 bg-slate-950/80 grid grid-cols-[1.5fr_0.8fr_1fr_1.2fr_1fr] gap-2 text-[9px] uppercase font-bold text-slate-500">
                <span>Attendant</span>
                <span className="text-center">Shifts</span>
                <span className="text-right">Litres (L)</span>
                <span className="text-right">Sales</span>
                <span className="text-right">Variance</span>
              </div>

              {loadingSummary ? (
                <p className="px-4 py-8 text-center text-xs text-slate-500">Loading period summaries…</p>
              ) : filteredSummaries.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-500">
                  No attendant shift records found at this station for the selected date period.
                </p>
              ) : (
                filteredSummaries.map(a => (
                  <div
                    key={a.employeeCode}
                    className="px-4 py-3 grid grid-cols-[1.5fr_0.8fr_1fr_1.2fr_1fr] gap-2 items-center hover:bg-slate-800/40 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{a.name}</p>
                      <p className="text-[10px] font-mono text-orange-400 font-bold">{a.employeeCode}</p>
                    </div>

                    <span className="text-xs font-mono text-center text-slate-300">{a.shiftsClosed}</span>

                    <span className="text-xs font-mono text-right text-slate-300">{Math.round(a.litres)} L</span>

                    <span className="text-xs font-mono font-bold text-right text-emerald-400">
                      {formatGHS(a.sales, { noPrefix: true })}
                    </span>

                    <span
                      className={`text-xs font-mono font-black text-right ${
                        Math.abs(a.variance) < 5 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatGHS(a.variance, { noPrefix: true, showSign: true })}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}

        {/* ----------------- TAB 2: ATTENDANTS ROSTER & CRUD ----------------- */}
        {activeTab === 'roster' && (
          <div className="flex flex-col gap-3">
            {showRegisterForm && (
              <Card className="p-4 border-orange-500/30 bg-slate-900/90 shadow-md animate-in fade-in duration-150">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-extrabold text-white flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-orange-400" /> Register Attendant at {stationName}
                  </h4>
                  <button onClick={() => setShowRegisterForm(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
                  <input
                    value={regFullName}
                    onChange={e => setRegFullName(e.target.value)}
                    placeholder="Full Name (e.g. Kwame Mensah)"
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={regEmployeeCode}
                      onChange={e => setRegEmployeeCode(e.target.value.toUpperCase().replace(/\D/g, '').slice(0, 6))}
                      placeholder="Code e.g. 1005"
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
                    />
                    <input
                      value={regPin}
                      onChange={e => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="PIN 4 digits"
                      inputMode="numeric"
                      className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
                    />
                  </div>
                  <select
                    value={regPumpId}
                    onChange={e => setRegPumpId(e.target.value)}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white focus:border-orange-500 outline-none transition"
                  >
                    <option value="">Assign Pump (Optional)…</option>
                    {PRODUCTION_PUMPS.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {regError && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-[11px] font-semibold text-rose-300">
                      {regError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={regBusy || !regFullName.trim() || regEmployeeCode.length !== 4 || regPin.length !== 4}
                    className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md"
                  >
                    {regBusy ? 'Registering…' : 'Save & Register Attendant'}
                  </button>
                </form>
              </Card>
            )}

            <Card className="divide-y divide-slate-800/70 overflow-hidden shadow-lg">
              {filteredRoster.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-500">No attendants found.</p>
              ) : (
                filteredRoster.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                        a.active
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {a.fullName
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white truncate">{a.fullName}</p>
                        <Badge tone={a.active ? 'success' : 'danger'}>{a.active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">
                        {a.employeeCode} · {a.phone || '024 000 0000'} · Pump: {a.pumpId || 'Any'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Reset PIN Button */}
                      <button
                        onClick={() => {
                          setResetModalTarget({ id: a.id, name: a.fullName, code: a.employeeCode })
                          setNewPinVal('')
                        }}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 transition"
                        title="Reset 4-digit PIN"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>

                      {/* Edit Profile Button */}
                      <button
                        onClick={() =>
                          setEditModalTarget({
                            id: a.id,
                            fullName: a.fullName,
                            employeeCode: a.employeeCode,
                            phone: a.phone || '',
                            pumpId: a.pumpId || '',
                            active: a.active,
                          })
                        }
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition"
                        title="Edit Profile"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Toggle Deactivate / Activate */}
                      <button
                        onClick={() =>
                          void deactivateAttendant(a.id).then(() =>
                            onToast(`${a.fullName} status toggled.`, 'warning'),
                          )
                        }
                        className={`p-1.5 rounded-lg border transition ${
                          a.active
                            ? 'bg-slate-900 border-slate-800 text-rose-400 hover:bg-rose-500/10'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        }`}
                        title={a.active ? 'Deactivate' : 'Activate'}
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}
      </div>

      {/* ----------------- MODAL: RESET ATTENDANT PIN ----------------- */}
      {resetModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Reset Attendant PIN</h4>
                  <p className="text-[10px] text-slate-400">
                    {resetModalTarget.name} ({resetModalTarget.code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setResetModalTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetPin} className="flex flex-col gap-3">
              <p className="text-xs text-slate-400">
                Enter a new 4-digit PIN for {resetModalTarget.name}. The attendant can immediately use this PIN to log in.
              </p>
              <input
                type="text"
                value={newPinVal}
                onChange={e => setNewPinVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="New 4-digit PIN e.g. 1234"
                maxLength={4}
                inputMode="numeric"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-amber-500/40 text-center text-lg font-mono tracking-widest text-amber-400 placeholder:text-slate-700 outline-none"
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setResetModalTarget(null)}
                  className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetBusy || newPinVal.length !== 4}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50 transition"
                >
                  {resetBusy ? 'Resetting…' : 'Confirm PIN Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: EDIT ATTENDANT PROFILE ----------------- */}
      {editModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Edit Attendant Profile</h4>
                  <p className="text-[10px] text-slate-400">{editModalTarget.employeeCode}</p>
                </div>
              </div>
              <button onClick={() => setEditModalTarget(null)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProfile} className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editModalTarget.fullName}
                  onChange={e => setEditModalTarget({ ...editModalTarget, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editModalTarget.phone}
                  onChange={e => setEditModalTarget({ ...editModalTarget, phone: e.target.value })}
                  placeholder="024 000 0000"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-300 font-bold">Active Account Status</span>
                <input
                  type="checkbox"
                  checked={editModalTarget.active}
                  onChange={e => setEditModalTarget({ ...editModalTarget, active: e.target.checked })}
                  className="w-4 h-4 accent-orange-500 rounded"
                />
              </div>

              <div className="flex items-center gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setEditModalTarget(null)}
                  className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editBusy || !editModalTarget.fullName.trim()}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs disabled:opacity-50 transition"
                >
                  {editBusy ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}