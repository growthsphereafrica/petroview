/**
 * Supervisor shift register — filterable by status AND station across the
 * enterprise network.
 */

import React, { useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { useSupervisorData } from '../providers'
import { Card, ScreenHeader, StatusBar, TappableRow } from '../../shared/ui'
import { PRODUCTION_STATIONS, getStationById } from '../../../core/domain/config'
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [stationFilter, setStationFilter] = useState<StationFilter>('ALL')

  const filtered = useMemo(() => {
    const rows = shifts.filter(
      s =>
        (statusFilter === 'ALL' || s.status === statusFilter) &&
        (stationFilter === 'ALL' || s.stationId === stationFilter),
    )
    return [...rows].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  }, [shifts, statusFilter, stationFilter])

  const pendingCount = useMemo(() => shifts.filter(s => s.status === 'CLOSED').length, [shifts])

  const chipClass = (active: boolean) =>
    active
      ? 'bg-gradient-to-r from-orange-600 to-amber-500 border-orange-400/50 text-white shadow-sm ring-1 ring-orange-400/30'
      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader
        title="Shift Register"
        subtitle={`${pendingCount} awaiting review · all stations`}
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

      {/* Station filter */}
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

      <div className="flex-1 px-4 py-3 max-w-md w-full mx-auto">
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
              <TappableRow
                key={s.id}
                icon={<ClipboardCheck className="w-4 h-4" />}
                title={`${s.number} · ${s.attendantName}`}
                subtitle={`${getStationById(s.stationId).name} · ${s.pumpName} · ${formatTimeOnly(s.openedAt)}`}
                value={formatGHS(s.actualTotal)}
                onClick={() => onOpenShift(s.id)}
                accent="#F97316"
              />
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}