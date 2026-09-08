/**
 * Attendant dashboard — home screen showing active shift status,
 * quick actions and today's numbers.
 */

import React from 'react'
import { CalendarClock, Flame, LogOut, PlusCircle, RefreshCw, Settings, Wifi } from 'lucide-react'
import { useAttendantSession, useShift } from '../providers'
import { Badge, Card, StatusBar, TappableRow } from '../ui'
import { formatGHS, formatTimeOnly } from '../../../utils/currencyFormatter'

export const DashboardScreen: React.FC<{
  onGoToStartShift: () => void
  onGoToTransactions: () => void
  onGoToClose: () => void
  onGoToSync: () => void
  onGoToSettings: () => void
}> = ({ onGoToStartShift, onGoToTransactions, onGoToClose, onGoToSync, onGoToSettings }) => {
  const { attendant, signOut } = useAttendantSession()
  const { activeShift, shifts, pendingCount, loading } = useShift()

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-orange-950/40 border border-orange-400/30">
            {attendant?.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase">{attendant?.employeeCode}</p>
            <p className="text-sm font-extrabold text-white">{attendant?.fullName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onGoToSync}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition relative"
            title="Sync"
          >
            <Wifi className="w-4 h-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-slate-950 text-[9px] font-black flex items-center justify-center animate-pulse">
                {pendingCount}
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
            <div className="grid grid-cols-3 divide-x divide-slate-800 bg-slate-900/90">
              <div className="px-3 py-3 text-center">
                <p className="text-[9px] uppercase text-slate-500 font-bold">Collected</p>
                <p className="text-sm font-black text-orange-400">{formatGHS(activeShift.actualTotal, { noPrefix: true })}</p>
              </div>
              <div className="px-3 py-3 text-center">
                <p className="text-[9px] uppercase text-slate-500 font-bold">Transactions</p>
                <p className="text-sm font-black text-white">{activeShift.sales.reduce((a, s) => a + s.litres, 0).toFixed(2)}L</p>
              </div>
              <div className="px-3 py-3 text-center">
                <p className="text-[9px] uppercase text-slate-500 font-bold">Variance</p>
                <p className="text-sm font-black text-amber-400">{formatGHS(activeShift.variance, { noPrefix: true })}</p>
              </div>
            </div>
            <button
              onClick={onGoToTransactions}
              className="w-full px-4 py-3 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-md"
            >
              <PlusCircle className="w-4 h-4" /> Record Sale
            </button>
            <button
              onClick={onGoToClose}
              className="w-full px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center gap-2 transition border-t border-slate-800"
            >
              Close Shift & End
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
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your Shifts</h4>
            <button onClick={onGoToSync} className="text-[11px] text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1 transition">
              <RefreshCw className="w-3 h-3" /> Sync
            </button>
          </div>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {shifts.length === 0 ? (
              <p className="px-4 py-5 text-xs text-slate-500 text-center">No shifts yet. Start your first one.</p>
            ) : (
              shifts.slice(0, 4).map(s => (
                <TappableRow
                  key={s.id}
                  title={s.number}
                  subtitle={`${s.pumpName} · ${formatTimeOnly(s.openedAt)}`}
                  value={formatGHS(s.actualTotal)}
                  accent={s.status === 'OPEN' ? '#F97316' : '#6366f1'}
                  icon={<CalendarClock className="w-4 h-4" />}
                />
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}