/**
 * Supervisor shift detail — full audit trail of a production shift with
 * meter readings, sales, payment breakdown, variance and the review
 * decision (approve / reject with required note).
 */

import React, { useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { useSupervisorData } from '../providers'
import { Badge, BigActionButton, Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { shiftStatusLabel, shiftStatusTone } from '../util'
import { getStationById, FUEL_META, PAYMENT_META } from '../../../core/domain/config'
import { describeError } from '../../../core/domain/errors'
import { formatDateTime, formatGHS, formatLitres } from '../../../utils/currencyFormatter'

export const SupervisorShiftDetailScreen: React.FC<{
  shiftId: string
  onBack: () => void
  onToast: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void
}> = ({ shiftId, onBack, onToast }) => {
  const { shifts, reviewShift, auditLog } = useSupervisorData()
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shift = shifts.find(s => s.id === shiftId)
  if (!shift) {
    return (
      <div className="h-full flex flex-col bg-slate-950">
        <StatusBar online />
        <ScreenHeader title="Shift not found" onBack={onBack} />
        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">This shift is no longer available.</div>
      </div>
    )
  }

  const reviewable = shift.status === 'CLOSED'
  const station = getStationById(shift.stationId)
  const reviews = auditLog.filter(a => a.targetId === shift.id && (a.action === 'REVIEW_APPROVED' || a.action === 'REJECTED'))

  const submitReview = async (verdict: 'APPROVED' | 'REJECTED') => {
    setError(null)
    setBusy(true)
    try {
      await reviewShift(shift.id, verdict, note)
      onToast(verdict === 'APPROVED' ? `${shift.number} approved.` : `${shift.number} rejected.`, verdict === 'APPROVED' ? 'success' : 'warning')
      setMode('idle')
      setNote('')
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-y-auto">
      <StatusBar online />
      <ScreenHeader title={`Shift ${shift.number}`} subtitle={`${station.name} · ${shift.pumpName}`} onBack={onBack} />

      <div className="flex-1 px-4 py-4 max-w-4xl w-full mx-auto flex flex-col gap-4">
        {/* Status + meta */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge tone={shiftStatusTone(shift.status)}>{shiftStatusLabel(shift.status)}</Badge>
              {shift.syncStatus === 'SYNCED' && <Badge tone="info">Synced</Badge>}
              {shift.syncStatus === 'PENDING' && <Badge tone="warning">Pending sync</Badge>}
            </div>
            <p className="text-[10px] font-mono text-slate-500">{shift.attendantName}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <dt className="text-slate-500 uppercase text-[9px] font-bold">Attendant</dt>
              <dd className="text-white font-bold">{shift.attendantName}</dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase text-[9px] font-bold">Employee</dt>
              <dd className="text-slate-300 font-mono">{shortAttendant(shift.attendantId)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase text-[9px] font-bold">Opened</dt>
              <dd className="text-slate-300">{formatDateTime(shift.openedAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 uppercase text-[9px] font-bold">Closed</dt>
              <dd className="text-slate-300">{formatDateTime(shift.closedAt ?? shift.updatedAt)}</dd>
            </div>
          </dl>
          {shift.notes && (
            <div className="mt-3 rounded-xl bg-slate-800/60 px-3 py-2 text-[11px] text-slate-300">
              <span className="font-bold text-slate-500 uppercase text-[9px] block mb-1">Attendant note</span>
              {shift.notes}
            </div>
          )}
          {shift.reviewerNotes && (
            <div className="mt-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-3 py-2 text-[11px] text-violet-200">
              <span className="font-bold text-violet-400 uppercase text-[9px] block mb-1">Reviewer note</span>
              {shift.reviewerNotes}
            </div>
          )}
          {reviews.map(r => (
            <div key={r.id} className="mt-2 rounded-xl bg-slate-800/60 px-3 py-2 text-[11px] text-slate-400">
              <span className="font-bold uppercase text-[9px] text-slate-500 block mb-1">
                {r.action === 'REVIEW_APPROVED' ? 'Approved' : 'Rejected'} by {r.actorName}
              </span>
              <span className="text-slate-300">{formatDateTime(r.timestamp)}</span>
              {r.notes && <span className="block mt-0.5 text-slate-400">{r.notes}</span>}
            </div>
          ))}
        </Card>

        {/* Sales breakdown */}
        <Card className="p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">Sales by product</h4>
          <div className="flex flex-col gap-2">
            {shift.sales.map(s => (
              <div key={s.fuelCode} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black"
                    style={{ backgroundColor: FUEL_META[s.fuelCode]?.color ?? '#334155' }}>
                    {s.fuelCode}
                  </span>
                  <span className="text-slate-300 font-bold">{FUEL_META[s.fuelCode]?.label ?? s.fuelCode}</span>
                </span>
                <span className="text-right">
                  <span className="block text-white font-mono font-bold">{formatLitres(s.litres)} L</span>
                  <span className="block text-[10px] text-slate-500">{formatGHS(s.amount)} @ {s.unitPrice}/L</span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Payments */}
        <Card className="p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">Payments</h4>
          <div className="flex flex-col gap-1.5">
            {(['CASH', 'MOMO', 'VOUCHER', 'CREDIT'] as const).map(m => (
              <div key={m} className="flex items-center justify-between text-[12px]">
                <span className="text-slate-400">{PAYMENT_META[m]?.label ?? m}</span>
                <span className="font-mono text-white font-bold">{formatGHS(shift.payments[m])}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-slate-500 text-[11px] font-bold uppercase">Expected total</span>
            <span className="font-mono text-white font-black">{formatGHS(shift.expectedTotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-bold uppercase">Variance</span>
            <span className={`font-mono font-black ${shift.variance === 0 ? 'text-emerald-400' : Math.abs(shift.variance) < 5 ? 'text-amber-400' : 'text-rose-400'}`}>
              {formatGHS(shift.variance, { noPrefix: true, showSign: true })}
            </span>
          </div>
        </Card>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-[11px] font-semibold text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Review actions */}
        {reviewable && (
          <Card className="p-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Review decision
            </h4>
            {mode === 'idle' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('approve')}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={() => setMode('reject')}
                  className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            )}
            {mode === 'approve' && (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] text-slate-400">
                  Confirm approval of <span className="font-bold text-white">{shift.number}</span> for{' '}
                  <span className="font-bold text-white">{formatGHS(shift.actualTotal)}</span> collected.
                </p>
                <BigActionButton
                  variant="primary"
                  loading={busy}
                  onClick={() => void submitReview('APPROVED')}
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirm Approval
                </BigActionButton>
                <button
                  onClick={() => { setMode('idle'); setError(null); }}
                  className="text-[11px] text-slate-500 font-bold hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            )}
            {mode === 'reject' && (
              <div className="flex flex-col gap-3">
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Required — explain the discrepancy (e.g. cash shortage of GHS 12.50)"
                  rows={3}
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none transition"
                />
                <BigActionButton
                  variant="secondary"
                  loading={busy}
                  disabled={note.trim().length < 4}
                  onClick={() => void submitReview('REJECTED')}
                >
                  <XCircle className="w-4 h-4 text-rose-400" /> Reject Shift
                </BigActionButton>
                <button
                  onClick={() => { setMode('idle'); setNote(''); setError(null); }}
                  className="text-[11px] text-slate-500 font-bold hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </Card>
        )}

        {!reviewable && (
          <p className="text-center text-[11px] text-slate-600">
            {shift.status === 'OPEN' ? 'This shift is still open on the forecourt.' : 'This shift has already been reviewed.'}
          </p>
        )}
      </div>
    </div>
  )
}

function shortAttendant(attendantId: string): string {
  return attendantId.replace(/^att-/, '').toUpperCase().slice(0, 8)
}