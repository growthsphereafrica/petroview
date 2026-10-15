/**
 * Attendant dashboard — home screen showing active shift status,
 * quick actions and today's numbers.
 */

import React from 'react'
import { AlertOctagon, CalendarClock, Flame, History, LogOut, MessageSquare, PlusCircle, RefreshCw, RotateCcw, Settings, Wifi } from 'lucide-react'
import { useAttendantSession, useShift } from '../providers'
import { Badge, Card, StatusBar, TappableRow } from '../ui'
import { formatDateTime, formatGHS, formatTimeOnly } from '../../../utils/currencyFormatter'
import { getStationName } from '../../../core/domain/config'
import type { Shift } from '../../../core/domain/types'

export const DashboardScreen: React.FC<{
  onGoToStartShift: () => void
  onGoToTransactions: () => void
  onGoToClose: () => void
  onGoToCorrectShift?: (shift: Shift) => void
  onGoToHistory?: () => void
  onGoToSync?: () => void
  onGoToSettings: () => void
}> = ({ onGoToStartShift, onGoToTransactions, onGoToClose, onGoToCorrectShift, onGoToHistory, onGoToSync, onGoToSettings }) => {
  const { attendant, session, signOut } = useAttendantSession()
  const { activeShift, shifts, pendingCount, loading } = useShift()
  const rejectedShift = shifts.find(s => s.status === 'REJECTED')

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-orange-950/40 border border-orange-400/30">
            {attendant?.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
                {session?.companyName || attendant?.companyName || attendant?.companyShortCode || 'OMC'}
              </span>
              <span className="text-[10px] text-slate-300 font-semibold truncate max-w-[160px]">
                {session?.stationName || attendant?.stationName || (attendant?.stationId ? getStationName(attendant.stationId) : 'Forecourt')}
              </span>
            </div>
            <p className="text-sm font-extrabold text-white mt-0.5 leading-tight">{attendant?.fullName}</p>
            <p className="text-[10px] font-mono text-slate-500 uppercase">{attendant?.employeeCode} · Forecourt Attendant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onGoToHistory && (
            <button
              onClick={onGoToHistory}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-orange-400 transition flex items-center gap-1.5 text-xs font-bold"
              title="Shift & Submission History"
            >
              <History className="w-4 h-4 text-orange-400" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
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
        {/* Manager Rejection Feedback Alert Card */}
        {rejectedShift && (
          <div className="rounded-2xl border-2 border-rose-500/60 bg-gradient-to-b from-rose-950/70 to-slate-900/95 p-4 shadow-xl shadow-rose-950/60 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertOctagon className="w-5 h-5 text-rose-400" />
                </span>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wide text-rose-400">
                    Shift Sales Rejected by Manager
                  </h3>
                  <p className="text-[11px] font-bold text-white mt-0.5">
                    {rejectedShift.number} · {rejectedShift.pumpName}
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/30 text-rose-200 border border-rose-500/40 animate-pulse">
                Action Required
              </span>
            </div>

            {/* Manager Feedback */}
            <div className="rounded-xl bg-slate-950/80 border border-rose-500/30 p-3">
              <p className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1 mb-1">
                <MessageSquare className="w-3.5 h-3.5" /> Manager Feedback / Reason:
              </p>
              <p className="text-xs text-rose-100 font-medium italic leading-relaxed">
                "{rejectedShift.reviewerNotes || 'Manager rejected your sales submission. Please review your meter readings and cash entries.'}"
              </p>
              {rejectedShift.reviewedBy && (
                <p className="text-[10px] text-rose-300/80 mt-1.5">
                  Reviewed by {rejectedShift.reviewedBy} {rejectedShift.reviewedAt ? `· ${formatDateTime(rejectedShift.reviewedAt)}` : ''}
                </p>
              )}
            </div>

            {/* Previous Submission Figures */}
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-2.5 flex items-center justify-between text-center">
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400">Expected</p>
                <p className="text-xs font-black text-white mt-0.5">
                  {formatGHS(rejectedShift.expectedTotal || rejectedShift.salesTotal)}
                </p>
              </div>
              <div className="w-px h-6 bg-slate-800" />
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400">Remitted</p>
                <p className="text-xs font-black text-amber-300 mt-0.5">
                  {formatGHS(rejectedShift.actualTotal)}
                </p>
              </div>
              <div className="w-px h-6 bg-slate-800" />
              <div>
                <p className="text-[9px] uppercase font-bold text-slate-400">Discrepancy</p>
                <p className={`text-xs font-black mt-0.5 ${rejectedShift.variance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {formatGHS(rejectedShift.variance)}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-snug">
              Your sales entries for this shift were rejected. You cannot start a new shift until you correct your pump/nozzles, meter readings, and cash figures and resubmit.
            </p>

            <button
              onClick={() => onGoToCorrectShift ? onGoToCorrectShift(rejectedShift) : onGoToClose()}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 transition active:scale-[0.99]"
            >
              <RotateCcw className="w-4 h-4" /> Correct Entries & Resubmit Closing Sales
            </button>
          </div>
        )}
        {/* Active shift banner */}
        {loading ? (
          <Card className="p-5 flex items-center gap-3">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-orange-500 rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Loading your shift…</span>
          </Card>
        ) : activeShift ? (
          <Card className="overflow-hidden border-orange-500/20 shadow-lg shadow-orange-950/20">
            <div className="bg-gradient-to-br from-orange-600 via-orange-500 to-amber-600 px-4 py-3.5 text-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase text-orange-100 flex items-center gap-1 font-bold">
                  <Flame className="w-3 h-3 text-amber-200" /> Active Shift
                </p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-black/30 text-white backdrop-blur-sm border border-white/20">
                  OPEN
                </span>
              </div>
              <p className="text-lg font-black text-white mt-1 truncate">{activeShift.number}</p>
              <p className="text-[11px] text-orange-100 mt-0.5 font-medium">
                {activeShift.pumpName} · started {formatTimeOnly(activeShift.openedAt)}
              </p>
            </div>
            <div className="p-4 bg-slate-900/95 flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2.5">
                <span className="text-slate-400 font-medium">Assigned Nozzles:</span>
                <span className="font-mono font-bold text-white uppercase tracking-wider">
                  {activeShift.openingReadings.map(o => o.nozzleLabel || o.fuelCode).join(' · ')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Shift currently active. Dispense fuel to vehicles, then enter your closing pump readings to calculate total litres and cash at hand.
              </p>
            </div>
            <button
              onClick={onGoToClose}
              className="w-full px-4 py-3.5 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-black flex items-center justify-center gap-2 transition shadow-lg active:scale-[0.99]"
            >
              <Flame className="w-4 h-4 text-amber-200" /> End Shift & Enter Closing Meters
            </button>
          </Card>
        ) : rejectedShift ? (
          <Card className="p-5 border-rose-500/30 bg-gradient-to-b from-rose-950/30 to-slate-900/90 shadow-lg shadow-rose-950/20">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-white">New Shift Blocked</h3>
                <p className="text-[11px] text-slate-400 leading-snug mt-1">
                  You have a rejected shift ({rejectedShift.number}) awaiting your corrections. You must correct and resubmit it before starting any new shift.
                </p>
              </div>
            </div>
            <button
              onClick={() => onGoToCorrectShift ? onGoToCorrectShift(rejectedShift) : onGoToClose()}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white py-3 text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-lg shadow-rose-950/50 border border-rose-400/30 active:scale-[0.98]"
            >
              <RotateCcw className="w-4 h-4" /> Resolve Shift #{rejectedShift.number} First
            </button>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                <CalendarClock className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-white">No active shift</h3>
                <p className="text-[11px] text-slate-500 leading-snug mt-1">
                  Start a new shift to record opening meter readings and begin selling.
                </p>
              </div>
            </div>
            <button
              onClick={onGoToStartShift}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3 text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-lg shadow-orange-950/50 border border-orange-400/30 active:scale-[0.98]"
            >
              <PlusCircle className="w-4 h-4" /> Start New Shift
            </button>
          </Card>
        )}

        {/* Recent shifts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Recent Shift Submissions</h4>
            {onGoToHistory && (
              <button
                onClick={onGoToHistory}
                className="text-[11px] text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1 transition"
              >
                <span>View All History</span>
                <History className="w-3 h-3" />
              </button>
            )}
          </div>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {shifts.filter(s => s.status !== 'OPEN').length === 0 ? (
              <p className="px-4 py-5 text-xs text-slate-500 text-center">No past shift submissions yet.</p>
            ) : (
              shifts.filter(s => s.status !== 'OPEN').slice(0, 4).map(s => (
                <div key={s.id} onClick={onGoToHistory} className="cursor-pointer">
                  <TappableRow
                    title={s.number}
                    subtitle={`${s.pumpName} · ${formatTimeOnly(s.closedAt || s.openedAt)}`}
                    value={formatGHS(s.actualTotal)}
                    accent={s.status === 'REJECTED' ? '#f43f5e' : s.status === 'APPROVED' ? '#10b981' : '#6366f1'}
                    icon={<CalendarClock className="w-4 h-4" />}
                  />
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}