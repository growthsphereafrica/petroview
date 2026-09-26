/**
 * Attendant settings — profile info, session controls and a
 * guarded data reset (re-seeds the production database).
 */

import React, { useState } from 'react'
import { Database, LogOut, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react'
import { useAttendantSession } from '../providers'
import { Card, ScreenHeader } from '../ui'
import { resetProductionData } from '../../../core/infra/db'
import { syncQueueRepo } from '../../../core/infra/repositories'
import { PRODUCTION_STATION } from '../../../core/domain/config'

export const SettingsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { attendant, signOut } = useAttendantSession()
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [unuploaded, setUnuploaded] = useState<number | null>(null)

  const revealReset = async () => {
    if (confirmReset) {
      setConfirmReset(false)
      return
    }
    setResetError(null)
    // Surface the number of records that exist only on this device, so the
    // operator can see what a reset would destroy before confirming.
    setUnuploaded(await syncQueueRepo.getCount())
    setConfirmReset(true)
  }

  const reset = async () => {
    const typed = window.prompt('Type RESET to confirm erasing all local forecourt data:')
    if (typed !== 'RESET') return
    setResetting(true)
    setResetError(null)
    try {
      await resetProductionData()
      await signOut()
      window.location.reload()
    } catch (err) {
      // No catch existed here before, so a failed reset signed the attendant
      // out anyway and looked like it had succeeded.
      setResetting(false)
      setResetError(err instanceof Error ? err.message : 'Reset failed. Local data was not cleared.')
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <ScreenHeader title="Settings" subtitle="Session & device" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
        <Card className="p-4 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center text-white font-black text-sm">
            {attendant?.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </span>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-white">{attendant?.fullName}</p>
            <p className="text-[11px] text-slate-500 font-mono">{attendant?.employeeCode}</p>
          </div>
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
        </Card>

        <Card className="p-4">
          <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Station</p>
          <p className="text-sm font-bold text-white">{PRODUCTION_STATION.name}</p>
          <p className="text-[11px] text-slate-500">{PRODUCTION_STATION.location}</p>
          <p className="text-[10px] text-slate-600 mt-1 font-mono">Code {PRODUCTION_STATION.code}</p>
        </Card>

        <button
          onClick={() => void signOut()}
          className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-white py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>

        <div className="mt-2 flex flex-col gap-2">
          <button
            onClick={() => void revealReset()}
            className="w-full rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-rose-400 py-3 text-xs font-bold flex items-center justify-center gap-2 transition"
          >
            <Database className="w-4 h-4" /> Erase local forecourt data
          </button>
          {resetError && (
            <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2.5 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-200">{resetError}</p>
            </div>
          )}
          {confirmReset && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-3.5 flex flex-col gap-2.5">
              <p className="text-[11px] text-rose-200 leading-snug flex items-start gap-2">
                <UserRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                This clears every shift, sale and receipt on this device, deletes the local audit log, and signs
                you out.
              </p>
              {(unuploaded ?? 0) > 0 && (
                <p className="text-[11px] font-bold text-rose-300">
                  {unuploaded} record(s) have not reached the server yet. They exist only on this device and will
                  be lost.
                </p>
              )}
              <button
                onClick={() => void reset()}
                disabled={resetting}
                className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 text-white py-2.5 text-xs font-black transition disabled:opacity-50"
              >
                {resetting ? 'Erasing…' : 'Yes, erase everything'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}