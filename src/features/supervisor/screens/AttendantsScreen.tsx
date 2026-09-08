/**
 * Attendant management — register new attendants at the supervisor's
 * station, view the roster, or deactivate a bad-actor account.
 */

import React, { useState } from 'react'
import { Flame, KeyRound, ShieldCheck, UserPlus, UserX } from 'lucide-react'
import { useSupervisorData, useSupervisorSession } from '../providers'
import { Badge, Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { PRODUCTION_PUMPS, getStationName } from '../../../core/domain/config'
import { describeError } from '../../../core/domain/errors'

export const SupervisorAttendantsScreen: React.FC<{
  onBack: () => void
  onToast: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void
}> = ({ onBack, onToast }) => {
  const { attendants, registerAttendant, deactivateAttendant, resetPin } = useSupervisorData()
  const { supervisor } = useSupervisorSession()

  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [pumpId, setPumpId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // PIN reset state
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [resetPinVal, setResetPinVal] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await registerAttendant({ fullName, employeeCode, pin, pumpId })
      onToast(`Attendant ${employeeCode.toUpperCase()} registered at ${supervisor ? getStationName(supervisor.stationId) : 'Green Valley Main'}.`, 'success')
      setFullName('')
      setEmployeeCode('')
      setPin('')
      setPumpId('')
      setShowForm(false)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const handleResetPin = async (attendantId: string) => {
    if (!/^\d{4}$/.test(resetPinVal)) return
    setResetBusy(true)
    try {
      await resetPin(attendantId, resetPinVal)
      onToast('PIN reset successfully.', 'success')
      setResetTarget(null)
      setResetPinVal('')
    } catch (err) {
      onToast(describeError(err), 'error')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader
        title="Attendants"
        subtitle={supervisor ? getStationName(supervisor.stationId) : 'PetroView Forecourt'}
        onBack={onBack}
        right={
          <button
            onClick={() => setShowForm(v => !v)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-orange-400 transition"
            title="Register attendant"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        }
      />

      <div className="flex-1 px-4 py-4 max-w-md w-full mx-auto flex flex-col gap-4">
        {showForm && (
          <Card className="p-4 border-orange-500/30 bg-slate-900/90 shadow-md">
            <h4 className="text-xs font-extrabold text-white mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-orange-400" /> Register new attendant
            </h4>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={employeeCode}
                  onChange={e => setEmployeeCode(e.target.value.toUpperCase().replace(/\D/g, '').slice(0, 6))}
                  placeholder="Code e.g. 1005"
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
                />
                <input
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="PIN 4 digits"
                  inputMode="numeric"
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs font-mono text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
                />
              </div>
              <select
                value={pumpId}
                onChange={e => setPumpId(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white focus:border-orange-500 outline-none transition"
              >
                <option value="">Assign pump…</option>
                {PRODUCTION_PUMPS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {error && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-[11px] font-semibold text-rose-300">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || !fullName.trim() || employeeCode.length !== 4 || pin.length !== 4}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3 text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-orange-950/40 border border-orange-400/30"
              >
                {busy && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                <UserPlus className="w-4 h-4" />
                {busy ? 'Registering…' : 'Register Attendant'}
              </button>
            </form>
          </Card>
        )}

        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          {attendants.map(a => (
            <React.Fragment key={a.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${a.active ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' : 'bg-slate-800 text-slate-500'}`}>
                  {a.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">{a.fullName}</p>
                  <p className="text-[10px] font-mono text-slate-500 uppercase">{a.employeeCode} · {getStationName(a.stationId)} · {a.pumpId ?? 'Unassigned'}</p>
                </div>
                {a.active ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setResetTarget(resetTarget === a.id ? null : a.id); setResetPinVal(''); }}
                      className={`p-2 rounded-lg border transition ${resetTarget === a.id ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400'}`}
                      title="Reset PIN"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => void deactivateAttendant(a.id).then(() => onToast(`${a.fullName} deactivated.`, 'warning'))}
                      className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-rose-400 hover:bg-rose-500/10 transition"
                      title="Deactivate"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <Badge tone="danger">Inactive</Badge>
                )}
              </div>
              {resetTarget === a.id && (
                <div className="px-4 py-3 bg-amber-500/5 border-t border-amber-500/20 flex items-center gap-2">
                  <input
                    value={resetPinVal}
                    onChange={e => setResetPinVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="New 4-digit PIN"
                    inputMode="numeric"
                    className="flex-1 rounded-lg bg-slate-900 border border-amber-500/30 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-amber-400 outline-none transition"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') void handleResetPin(a.id); }}
                  />
                  <button
                    onClick={() => void handleResetPin(a.id)}
                    disabled={resetBusy || resetPinVal.length !== 4}
                    className="shrink-0 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold transition disabled:opacity-40"
                  >
                    {resetBusy ? 'Saving…' : 'Reset'}
                  </button>
                </div>
              )}
            </React.Fragment>
          ))}
        </Card>

        <p className="text-center text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
          New attendants are pinned to the supervisor's home station.
        </p>
      </div>
    </div>
  )
}