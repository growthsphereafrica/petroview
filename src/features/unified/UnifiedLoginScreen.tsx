/**
 * Unified login — single sign-in gate for the whole production suite.
 * Detects the operator role from the employee code prefix
 * (SUP → supervisor, ATT → attendant) and routes to the right portal.
 */

import React, { useRef, useState } from 'react'
import { Flame, KeyRound, ShieldCheck, UserCog, Zap } from 'lucide-react'
import { describeError } from '../../core/domain/errors'
import { MVPLogo } from '../../components/common/MVPLogo'
import { SEED_ATTENDANTS, SEED_SUPERVISORS, seedProductionData } from '../../core/infra/db'
import { authService } from '../../core/services/authService'
import { supervisorService } from '../../core/services/supervisorService'

export type UnifiedRole = 'attendant' | 'supervisor'

export interface UnifiedSession {
  role: UnifiedRole
  fullName: string
  employeeCode: string
}

export const SESSION_KEY = 'mvp_active_session'

export function saveUnifiedSession(session: UnifiedSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadUnifiedSession(): UnifiedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<UnifiedSession>
    if (!parsed.role || !parsed.fullName || !parsed.employeeCode) return null
    return parsed as UnifiedSession
  } catch {
    return null
  }
}

export function clearUnifiedSession(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('mvp_prod_session_token')
  localStorage.removeItem('mvp_prod_supervisor_token')
}

function detectRole(code: string): UnifiedRole {
  return code.startsWith('SUP') ? 'supervisor' : 'attendant'
}

export const UnifiedLoginScreen: React.FC<{
  onAuthenticated: (session: UnifiedSession) => void
}> = ({ onAuthenticated }) => {
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSigningIn(true)
    try {
      await seedProductionData()
      const code = employeeCode.toUpperCase()
      const role = detectRole(code)
      if (role === 'supervisor') {
        const { supervisor, session } = await supervisorService.authenticate(code, pin)
        localStorage.setItem('mvp_prod_supervisor_token', session.token)
        onAuthenticated({ role, fullName: supervisor.fullName, employeeCode: code })
      } else {
        const { attendant, session } = await authService.authenticate(code, pin)
        localStorage.setItem('mvp_prod_session_token', session.token)
        onAuthenticated({ role, fullName: attendant.fullName, employeeCode: code })
      }
    } catch (err) {
      setError(describeError(err))
      setPin('')
      pinRef.current?.focus()
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] overflow-y-auto relative">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="shrink-0 glass-panel-dark border-b border-slate-800/80 px-4 py-8 flex flex-col items-center gap-3 relative z-10">
        <MVPLogo size="lg" showText tagline animated />
        <p className="text-[11px] font-mono text-slate-400">PetroView · Unified Forecourt Sign-In</p>
      </div>

      <div className="flex-1 px-5 py-6 max-w-sm w-full mx-auto relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
          <span className="text-xs font-bold text-slate-300">One secure sign-in for every role</span>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
              Employee Code
            </label>
            <input
              value={employeeCode}
              onChange={e => setEmployeeCode(e.target.value.toUpperCase())}
              placeholder="ATT1001 or SUP1001"
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

          {employeeCode.toUpperCase().startsWith('SUP') ? (
            <p className="text-[11px] text-orange-300/90 flex items-center gap-1.5">
              <UserCog className="w-3.5 h-3.5 text-orange-400" /> Supervisor console detected — you'll land in the operations hub.
            </p>
          ) : (
            employeeCode.length >= 3 && (
              <p className="text-[11px] text-amber-300/90 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Attendant terminal detected — you'll land in the forecourt app.
              </p>
            )
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

        <div className="mt-6 rounded-xl bg-slate-900/80 border border-slate-800/80 p-3.5 shadow-inner">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Demo accounts</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-amber-400 uppercase mb-1 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> Attendants
              </p>
              <ul className="flex flex-col gap-1.5">
                {SEED_ATTENDANTS.slice(0, 4).map(a => (
                  <li key={a.employeeCode} className="flex flex-col items-start gap-1 text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeeCode(a.employeeCode)
                        setPin(a.pin)
                        setError(null)
                        pinRef.current?.focus()
                      }}
                      className="w-full text-left px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-amber-500/40 transition"
                    >
                      <span className="text-amber-400 font-bold">{a.employeeCode}</span> · PIN {a.pin}
                      <span className="block text-[9px] text-slate-500 truncate">{a.fullName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[9px] font-bold text-orange-400 uppercase mb-1 flex items-center gap-1">
                <UserCog className="w-2.5 h-2.5" /> Supervisors
              </p>
              <ul className="flex flex-col gap-1.5">
                {SEED_SUPERVISORS.map(a => (
                  <li key={a.employeeCode} className="flex flex-col items-start gap-1 text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeeCode(a.employeeCode)
                        setPin(a.pin)
                        setError(null)
                        pinRef.current?.focus()
                      }}
                      className="w-full text-left px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-orange-500/40 transition"
                    >
                      <span className="text-orange-400 font-bold">{a.employeeCode}</span> · PIN {a.pin}
                      <span className="block text-[9px] text-slate-500 truncate">{a.fullName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}