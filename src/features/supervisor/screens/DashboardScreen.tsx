/**
 * Supervisor dashboard — enterprise overview across all stations with
 * review queue, today's numbers and recent shift activity.
 */

import React, { useEffect, useState } from 'react'
import { Building2, ClipboardCheck, DollarSign, Droplets, Flame, History, LogOut, RefreshCw, Settings, ShieldAlert, Users, Wifi } from 'lucide-react'
import { useSupervisorData, useSupervisorSession } from '../providers'
import { getStationName, PRODUCTION_STATIONS, getStationById } from '../../../core/domain/config'
import { Badge, Card, StatusBar, TappableRow } from '../../shared/ui'
import { formatGHS, formatLitres, formatTimeOnly } from '../../../utils/currencyFormatter'
import { backendRecordTankReadings, backendGetTankReadings } from '../../../services/backendApiService'

export const SupervisorDashboardScreen: React.FC<{
  onGoToShifts: () => void
  onGoToAttendants: () => void
  onGoToSync: () => void
  onGoToSettings: () => void
  onGoToAudit: () => void
  onGoToTankReadings: () => void
  onOpenShift: (shiftId: string) => void
}> = ({ onGoToShifts, onGoToAttendants, onGoToSync, onGoToSettings, onGoToAudit, onGoToTankReadings, onOpenShift }) => {
  const { supervisor, signOut } = useSupervisorSession()
  const { shifts, stats, pendingSync, loading, pushSync } = useSupervisorData()
  const [tankReadingCount, setTankReadingCount] = useState(0)

  const pendingReview = stats?.pendingReviews ?? 0

  useEffect(() => {
    void (async () => {
      try {
        const result = await backendGetTankReadings(supervisor?.stationId, 1)
        setTankReadingCount(result.count)
      } catch { /* */ }
    })()
  }, [supervisor?.stationId])

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-orange-950/40 border border-orange-400/30">
            {supervisor?.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase">{supervisor?.employeeCode}</p>
            <p className="text-sm font-extrabold text-white">{supervisor?.fullName}</p>
            <p className="text-[10px] text-orange-400 font-medium">
              {supervisor ? getStationName(supervisor.stationId) : ''} · Supervisor Hub
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void pushSync()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition relative"
            title="Sync now"
          >
            <Wifi className="w-4 h-4" />
            {pendingSync > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-slate-950 text-[9px] font-black flex items-center justify-center animate-pulse">
                {pendingSync}
              </span>
            )}
          </button>
          <button
            onClick={onGoToSettings}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => void signOut()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 transition"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
        {/* Alert: pending reviews */}
        {pendingReview > 0 && (
          <button
            onClick={onGoToShifts}
            className="rounded-2xl bg-orange-500/10 border border-orange-500/30 px-4 py-3 flex items-center gap-3 text-left hover:bg-orange-500/15 transition shadow-md shadow-orange-950/20"
          >
            <ShieldAlert className="w-5 h-5 text-orange-400 shrink-0" />
            <span className="flex-1">
              <span className="block text-xs font-extrabold text-orange-300">
                {pendingReview} shift{pendingReview === 1 ? '' : 's'} awaiting review
              </span>
              <span className="block text-[11px] text-orange-400/80">Tap to open the review queue</span>
            </span>
          </button>
        )}

        {/* Live stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 border-orange-500/20 bg-slate-900/90 shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-orange-400" />
              <p className="text-[9px] uppercase font-bold text-slate-500 flex items-center gap-1">
                <Flame className="w-2.5 h-2.5 text-orange-400" /> Sales today
              </p>
            </div>
            <p className="text-lg font-black text-orange-400">{formatGHS(stats?.salesToday ?? 0, { noPrefix: true })}</p>
            <p className="text-[10px] text-slate-500">all station pumps</p>
          </Card>
          <Card className="p-4 bg-slate-900/90 shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Shifts today</p>
            </div>
            <p className="text-lg font-black text-white">{stats?.shiftsToday ?? 0}</p>
            <p className="text-[10px] text-slate-500">{formatLitres(stats?.litresToday ?? 0)} litres</p>
          </Card>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <p className="text-sm font-black text-amber-400">{stats?.pendingReviews ?? 0}</p>
            <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Pending review</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-sm font-black text-orange-400">{stats?.approved ?? 0}</p>
            <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Approved</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-sm font-black text-rose-400">{stats?.rejected ?? 0}</p>
            <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">Rejected</p>
          </Card>
        </div>

        {/* Cars served today */}
        <Card className="p-4 bg-slate-900/90 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-emerald-400" />
              <p className="text-[9px] uppercase font-bold text-slate-500">Cars Served Today</p>
            </div>
            <span className="text-[10px] font-mono text-slate-500">{tankReadingCount} tank reading{tankReadingCount === 1 ? '' : 's'}</span>
          </div>
          <p className="text-lg font-black text-emerald-400 mt-1">
            {stats?.carsServedToday ?? 0}
          </p>
          <p className="text-[10px] text-slate-500">transactions from closed shifts today</p>
        </Card>

        {/* Quick actions */}
        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          <TappableRow
            icon={<ClipboardCheck className="w-4 h-4" />}
            title="Review Shifts"
            subtitle="Approve or reject closed shifts across stations"
            value={pendingReview ? `${pendingReview} pending` : 'All reviewed'}
            onClick={onGoToShifts}
            accent="#F97316"
          />
          <TappableRow
            icon={<Users className="w-4 h-4" />}
            title="Manage Attendants"
            subtitle={`${stats?.activeAttendants ?? 0} active · register or deactivate`}
            onClick={onGoToAttendants}
            accent="#F59E0B"
          />
          <TappableRow
            icon={<RefreshCw className="w-4 h-4" />}
            title="Sync Center"
            subtitle={pendingSync ? `${pendingSync} records queued` : 'All records synced'}
            onClick={onGoToSync}
            accent="#FF6B00"
          />
          <TappableRow
            icon={<Droplets className="w-4 h-4" />}
            title="Tank Readings"
            subtitle={`${tankReadingCount} reading${tankReadingCount === 1 ? '' : 's'} this period`}
            onClick={onGoToTankReadings}
            accent="#10B981"
          />
          <TappableRow
            icon={<History className="w-4 h-4" />}
            title="Audit Trail"
            subtitle="Review log, PIN resets, registrations"
            onClick={onGoToAudit}
            accent="#8b5cf6"
          />
        </Card>

        {/* Stations */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            {supervisor ? getStationName(supervisor.stationId) : 'Station Branch'}
          </h4>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {(() => {
              const currentStationId = supervisor?.stationId || 'STN-GV-042'
              const currentStation = getStationById(currentStationId)
              const stationShifts = shifts.filter(s => s.stationId === currentStationId)
              const sitePending = stationShifts.filter(s => s.status === 'CLOSED').length
              return (
                <div key={currentStation.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black bg-slate-800 text-orange-400 border border-orange-500/20">
                    {currentStation.code.split('-').pop()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-white truncate">{currentStation.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{currentStation.region} · {currentStation.location}</p>
                  </div>
                  {sitePending > 0 && <Badge tone="warning">{sitePending} to review</Badge>}
                </div>
              )
            })()}
          </Card>
        </div>

        {/* Recent shifts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Recent Shifts</h4>
            <button onClick={onGoToShifts} className="text-[11px] text-orange-400 hover:text-orange-300 font-bold transition">
              See all →
            </button>
          </div>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {loading ? (
              <p className="px-4 py-5 text-xs text-slate-500 text-center">Loading…</p>
            ) : shifts.length === 0 ? (
              <p className="px-4 py-5 text-xs text-slate-500 text-center">No shifts recorded yet.</p>
            ) : (
              shifts.slice(0, 5).map(s => (
                <TappableRow
                  key={s.id}
                  icon={<ClipboardCheck className="w-4 h-4" />}
                  title={`${s.number} · ${s.attendantName}`}
                  subtitle={`${getStationById(s.stationId).name} · ${s.pumpName} · ${formatTimeOnly(s.openedAt)}`}
                  value={formatGHS(s.actualTotal)}
                  onClick={() => onOpenShift(s.id)}
                  accent="#F97316"
                />
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}