/**
 * Supervisor login screen — employee code + 4-digit PIN.
 * Supports seamless universal login for all roles (Super Admin, HQ, Manager, Attendant).
 */

import React, { useRef, useState } from 'react'
import { ArrowLeft, Flame, KeyRound, ShieldAlert, UserCog } from 'lucide-react'
import { useSupervisorSession } from '../providers'
import { describeError } from '../../../core/domain/errors'
import { MVPLogo } from '../../../components/common/MVPLogo'
import { supervisorRepo, attendantRepo } from '../../../core/infra/repositories'
import { supervisorService } from '../../../core/services/supervisorService'
import { authService } from '../../../core/services/authService'
import { companyService } from '../../../core/services/companyService'
import { getStationName } from '../../../core/domain/config'
import { seedProductionData } from '../../../core/infra/db'
import { clearUnifiedSession, saveUnifiedSession } from '../../unified/UnifiedLoginScreen'
import type { UnifiedRole } from '../../../core/domain/types'

export const SupervisorLoginScreen: React.FC = () => {
  const { signIn, signingIn } = useSupervisorSession()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  const handleReturnToGateway = () => {
    clearUnifiedSession()
    window.location.reload()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await seedProductionData()
      const rawCode = employeeCode.trim()
      const rawPin = pin.trim()

      if (!rawCode) throw new Error('Please enter your Staff / Admin Code.')
      if (rawPin.length !== 4) throw new Error('PIN must be 4 digits.')

      const code =
        rawCode.toUpperCase() === 'SUPERADMIN' || rawCode.toUpperCase() === 'SUPER ADMIN'
          ? 'SUPER-ADMIN'
          : rawCode.toUpperCase()

      // 1. Check Supervisors / Super-Admin / HQ table
      const supervisorMatch = await supervisorRepo.findByEmployeeCode(code)
      if (supervisorMatch) {
        const { supervisor, session } = await supervisorService.authenticate(supervisorMatch.employeeCode, rawPin)
        localStorage.setItem('mvp_prod_supervisor_token', session.token)

        const isSuperAdmin =
          supervisor.isSuperAdmin ||
          supervisor.employeeCode === 'SUPER-ADMIN' ||
          supervisor.employeeCode === 'PETRO-MASTER'
        const isHQ =
          isSuperAdmin ||
          supervisor.isHeadOffice ||
          supervisor.employeeCode.includes('HQ') ||
          supervisor.employeeCode === 'HQ-ADMIN'

        const finalRole: UnifiedRole = isSuperAdmin
          ? 'superadmin'
          : isHQ
          ? 'headoffice'
          : 'supervisor'

        const comp = supervisor.companyId ? await companyService.getCompany(supervisor.companyId) : null

        saveUnifiedSession({
          role: finalRole,
          fullName: supervisor.fullName || (isSuperAdmin ? 'Platform Master Super Super Admin' : 'Supervisor'),
          employeeCode: supervisor.employeeCode,
          stationId: supervisor.stationId,
          stationName: supervisor.stationId ? getStationName(supervisor.stationId) : 'Global Enterprise Network',
          companyId: supervisor.companyId || comp?.id,
          companyName: comp?.name || (isSuperAdmin ? 'PetroView Platform Owner' : 'PetroView Downstream'),
          companyShortCode: supervisor.companyShortCode || comp?.shortCode,
        })

        window.location.reload()
        return
      }

      // 2. Otherwise check Attendants table
      const attendantMatch = await attendantRepo.findByEmployeeCode(code)
      if (attendantMatch) {
        const { attendant, session } = await authService.authenticate(attendantMatch.employeeCode, rawPin)
        localStorage.setItem('mvp_prod_session_token', session.token)
        const comp = attendantMatch.companyId ? await companyService.getCompany(attendantMatch.companyId) : null

        saveUnifiedSession({
          role: 'attendant',
          fullName: attendant.fullName,
          employeeCode: attendant.employeeCode,
          stationId: attendant.stationId,
          stationName: getStationName(attendant.stationId),
          companyId: attendant.companyId || comp?.id,
          companyName: comp?.name || 'PetroView Downstream',
          companyShortCode: attendant.companyShortCode || comp?.shortCode,
        })
        window.location.reload()
        return
      }

      throw new Error(`Account with code "${code}" not found. Please verify your ID or create an account.`)
    } catch (err) {
      setError(describeError(err))
      setPin('')
      pinRef.current?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto relative">
      <div className="shrink-0 glass-panel-dark border-b border-slate-800/80 px-4 py-6 flex flex-col items-center gap-3">
        <MVPLogo size="lg" showText tagline animated />
        <p className="text-[11px] font-mono text-slate-400">PetroView · Unified Access Portal</p>
      </div>

      <div className="flex-1 px-5 py-6 max-w-sm w-full mx-auto flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-300">Operations Access</span>
            </div>
            <button
              onClick={handleReturnToGateway}
              className="text-[11px] font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Main Gateway</span>
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center justify-between">
                <span>Employee / Admin Code</span>
                <span className="text-[10px] text-slate-500 font-normal lowercase">e.g. SUPER-ADMIN</span>
              </label>
              <input
                value={employeeCode}
                onChange={e => setEmployeeCode(e.target.value.toUpperCase())}
                placeholder="SUPER-ADMIN"
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
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || signingIn || employeeCode.length < 3 || pin.length !== 4}
              className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3.5 text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-lg shadow-orange-950/60 border border-orange-400/30 disabled:opacity-40 disabled:cursor-not-allowed mt-1 active:scale-[0.98]"
            >
              {(isSubmitting || signingIn) && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              <KeyRound className="w-4 h-4" />
              {isSubmitting || signingIn ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="pt-6 border-t border-slate-900 flex justify-center">
          <button
            onClick={handleReturnToGateway}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <span>Return to Unified Multi-Tenant Gateway</span>
          </button>
        </div>
      </div>
    </div>
  )
}