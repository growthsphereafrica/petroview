/**
 * Supervisor shift register — filterable by status AND station across the
 * enterprise network.
 */

import React, { useMemo, useState } from 'react'
import { ClipboardCheck, Fuel, Gauge, User, ChevronRight } from 'lucide-react'
import { useSupervisorData, useSupervisorSession } from '../providers'
import { Badge, Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { shiftStatusLabel, shiftStatusTone } from '../util'
import { PRODUCTION_STATIONS, getStationById, getStationName, formatShiftNozzles } from '../../../core/domain/config'
import { formatGHS, formatTimeOnly } from '../../../utils/currencyFormatter'
import type { ShiftStatus } from '../../../core/domain/types'

type StatusFilter = 'ALL' | ShiftStatus
type StationFilter = 'ALL' | string

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CLOSED', label: 'To Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'OPEN', label: 'Open' },
]

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

  const filtered = useMemo(() => {
    const rows = shifts.filter(s => {
      const matchStatus = statusFilter === 'ALL' || s.status === statusFilter
      const matchStation = isHQ
        ? stationFilter === 'ALL' || s.stationId === stationFilter
        : !stationId || s.stationId === stationId
      return matchStatus && matchStation
    })
    return [...rows].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  }, [shifts, statusFilter, stationFilter, isHQ, stationId])

  const pendingCount = useMemo(() => filtered.filter(s => s.status === 'CLOSED').length, [filtered])

  const chipClass = (active: boolean) =>
    active
      ? 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/50 text-white shadow-sm ring-1 ring-orange-400/30'
      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader
        title="Shift Register"
        subtitle={`${pendingCount} awaiting review · ${isHQ ? 'all stations' : stationName}`}
        onBack={onBack}
        right={
          <button
            onClick={() => void refresh()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-orange-400 transition"
            title="Refresh register"
          >
            <ClipboardCheck className="w-4 h-4" />
          </button>
        }
      />

      {/* Status filter */}
      <div className="shrink-0 px-4 pt-2.5 flex gap-2 overflow-x-auto">
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
        <div className="shrink-0 px-4 pt-2 pb-2.5 flex gap-2 overflow-x-auto">
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
            <p className="text-[11px] text-slate-600 mt-1">Try a different status or station filter.</p>
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
    </div>
  )
}