/**
 * Supervisor login — employee code + 4-digit PIN.
 * Reuses the same hardened auth path as the attendant console.
 */

import React, { useRef, useState } from 'react'
import { Flame, KeyRound, ShieldCheck, UserCog } from 'lucide-react'
import { useSupervisorSession } from '../providers'
import { describeError } from '../../../core/domain/errors'
import { MVPLogo } from '../../../components/common/MVPLogo'

export const SupervisorLoginScreen: React.FC = () => {
  const { signIn, signingIn } = useSupervisorSession()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pinRef = useRef<HTMLInputElement>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await signIn(employeeCode, pin)
    } catch (err) {
      setError(describeError(err))
      setPin('')
      pinRef.current?.focus()
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto relative">
      <div className="shrink-0 glass-panel-dark border-b border-slate-800/80 px-4 py-6 flex flex-col items-center gap-3">
        <MVPLogo size="lg" showText tagline animated />
        <p className="text-[11px] font-mono text-slate-400">PetroView · Supervisor Operations Console</p>
      </div>

      <div className="flex-1 px-5 py-6 max-w-sm w-full mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
          <span className="text-xs font-bold text-slate-300">Supervisor access portal</span>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
              Employee Code
            </label>
            <input
              value={employeeCode}
              onChange={e => setEmployeeCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUP1001"
              className="w-full rounded-xl bg-slate-900/90 border border-slate-800 px-4 py-3 text-sm font-mono text-white placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition"
              autoCapitalize="characters"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
              PIN <span className="text-slate-600">(4 digits)</span>
            </label>
            <input
              ref={pinRef}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              className="w-full rounded-xl bg-slate-900/90 border border-slate-800 px-4 py-3 text-xl font-mono tracking-[0.5em] text-white placeholder:text-slate-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition text-center"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-[11px] font-semibold text-rose-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={signingIn || employeeCode.length < 4 || pin.length !== 4}
            className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3.5 text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-lg shadow-orange-950/60 border border-orange-400/30 disabled:opacity-40 disabled:cursor-not-allowed mt-1 active:scale-[0.98]"
          >
            {signingIn && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            <KeyRound className="w-4 h-4" />
            {signingIn ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}