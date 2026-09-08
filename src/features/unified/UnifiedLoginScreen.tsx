/**
 * Unified Authentication & Multi-Tenant Self-Registration Gateway.
 * - 3-Tier Multi-Tenant architecture:
 *   1. Tier 1: Platform Master Super Super Admin (SUPER-ADMIN · PIN 7256)
 *   2. Tier 2: Company HQ Admin (e.g. GOIL-HQ01, PV-HQ01, TOT-HQ01 · PIN 9999)
 *   3. Tier 3: Station Managers & Fuel Attendants with company-scoped sequential IDs
 * - Dynamic OMC selection and company-scoped station branches
 * - Automatic company-prefixed sequential staff codes (e.g. GOIL001A, GOIL002M, PV001A)
 * - Pending HQ Approval verification before forecourt access
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Flame,
  KeyRound,
  Lock,
  MapPin,
  Phone,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  UserCog,
  UserPlus,
  Zap,
} from 'lucide-react'
import { describeError } from '../../core/domain/errors'
import { MVPLogo } from '../../components/common/MVPLogo'
import { PRODUCTION_PUMPS, PRODUCTION_STATIONS, getStationName } from '../../core/domain/config'
import { seedProductionData } from '../../core/infra/db'
import { authService } from '../../core/services/authService'
import { supervisorService } from '../../core/services/supervisorService'
import { companyService } from '../../core/services/companyService'
import { generateNextStaffCode, inferRoleFromCode } from '../../core/services/staffCodeService'
import { attendantRepo, supervisorRepo } from '../../core/infra/repositories'
import type { Company, CompanyStation, UnifiedRole } from '../../core/domain/types'

export interface UnifiedSession {
  role: UnifiedRole
  fullName: string
  employeeCode: string
  stationId?: string
  stationName?: string
  companyId?: string
  companyName?: string
  companyShortCode?: string
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

export const UnifiedLoginScreen: React.FC<{
  onAuthenticated: (session: UnifiedSession) => void
}> = ({ onAuthenticated }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')

  // Available companies and stations
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyStations, setCompanyStations] = useState<CompanyStation[]>([])

  // Login form state
  const [loginCode, setLoginCode] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [showLoginPin, setShowLoginPin] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isPendingApproval, setIsPendingApproval] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Registration form state
  const [regCompanyId, setRegCompanyId] = useState<string>('')
  const [regRole, setRegRole] = useState<'attendant' | 'supervisor'>('attendant')
  const [regGeneratedCode, setRegGeneratedCode] = useState<string>('')
  const [regFullName, setRegFullName] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regStationId, setRegStationId] = useState('')
  const [regPumpId, setRegPumpId] = useState(PRODUCTION_PUMPS[0].id)
  const [regPin, setRegPin] = useState('')
  const [regConfirmPin, setRegConfirmPin] = useState('')
  const [regError, setRegError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [regSuccessData, setRegSuccessData] = useState<{
    employeeCode: string
    fullName: string
    role: 'attendant' | 'supervisor'
    companyName: string
  } | null>(null)

  // Load companies on mount
  useEffect(() => {
    void (async () => {
      await seedProductionData()
      const allComps = await companyService.listAllCompanies()
      setCompanies(allComps)
      if (allComps.length > 0 && !regCompanyId) {
        setRegCompanyId(allComps[0].id)
      }
    })()
  }, [])

  // Load company stations & calculate auto-generated staff code whenever company or role changes
  useEffect(() => {
    if (!regCompanyId && companies.length > 0) return
    const activeCompId = regCompanyId || companies[0]?.id
    if (!activeCompId) return

    const selectedComp = companies.find(c => c.id === activeCompId)
    const shortCode = selectedComp?.shortCode || 'PV'

    void (async () => {
      const stns = await companyService.listCompanyStations(activeCompId)
      setCompanyStations(stns)
      if (stns.length > 0) {
        setRegStationId(stns[0].id)
      } else {
        setRegStationId(PRODUCTION_STATIONS[0].id)
      }

      const nextCode = await generateNextStaffCode(regRole, shortCode)
      setRegGeneratedCode(nextCode)
    })()
  }, [regCompanyId, regRole, companies, activeTab])

  const selectedCompany = companies.find(c => c.id === regCompanyId) || companies[0]

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setIsPendingApproval(false)
    setSigningIn(true)
    try {
      await seedProductionData()
      const rawCode = loginCode.trim()
      const pin = loginPin.trim()

      if (!rawCode) {
        throw new Error('Please enter your Staff / Admin Code.')
      }
      if (pin.length !== 4) {
        throw new Error('PIN must be 4 digits.')
      }

      // Normalize SUPER-ADMIN variants
      const code =
        rawCode.toUpperCase() === 'SUPERADMIN' || rawCode.toUpperCase() === 'SUPER ADMIN'
          ? 'SUPER-ADMIN'
          : rawCode.toUpperCase()

      // 1. Check Supervisors / Admins table
      const supervisorMatch = await supervisorRepo.findByEmployeeCode(code)

      if (supervisorMatch) {
        const { supervisor, session } = await supervisorService.authenticate(supervisorMatch.employeeCode, pin)
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

        onAuthenticated({
          role: finalRole,
          fullName: supervisor.fullName || (isSuperAdmin ? 'Platform Master Super Super Admin' : 'Supervisor'),
          employeeCode: supervisor.employeeCode,
          stationId: supervisor.stationId,
          stationName: supervisor.stationId ? getStationName(supervisor.stationId) : 'Global Enterprise Network',
          companyId: supervisor.companyId || comp?.id,
          companyName: comp?.name || (isSuperAdmin ? 'PetroView Platform Owner' : 'PetroView Downstream'),
          companyShortCode: supervisor.companyShortCode || comp?.shortCode,
        })
        return
      }

      // 2. Check Attendants table
      const attendantMatch = await attendantRepo.findByEmployeeCode(code)

      if (attendantMatch) {
        const { attendant, session } = await authService.authenticate(attendantMatch.employeeCode, pin)
        localStorage.setItem('mvp_prod_session_token', session.token)
        const comp = attendant.companyId ? await companyService.getCompany(attendant.companyId) : null

        onAuthenticated({
          role: 'attendant',
          fullName: attendant.fullName,
          employeeCode: attendant.employeeCode,
          stationId: attendant.stationId,
          stationName: getStationName(attendant.stationId),
          companyId: attendant.companyId || comp?.id,
          companyName: comp?.name || 'PetroView Downstream',
          companyShortCode: attendant.companyShortCode || comp?.shortCode,
        })
        return
      }

      // If code not found in either table
      throw new Error(`Account with code "${code}" not found. Please verify your Staff ID or create an account.`)
    } catch (err) {
      const msg = describeError(err)
      setLoginError(msg)
      if (msg.toLowerCase().includes('pending hq approval') || msg.toLowerCase().includes('pending')) {
        setIsPendingApproval(true)
      }
      setLoginPin('')
      pinInputRef.current?.focus()
    } finally {
      setSigningIn(false)
    }
  }

  // Handle Self-Registration Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError(null)

    if (!regFullName.trim()) {
      setRegError('Please enter your full official name.')
      return
    }
    if (!regPhone.trim()) {
      setRegError('Please enter your phone number.')
      return
    }
    if (regPin.length !== 4) {
      setRegError('PIN must be exactly 4 numeric digits.')
      return
    }
    if (regPin !== regConfirmPin) {
      setRegError('PINs do not match. Please re-enter.')
      return
    }

    setRegistering(true)
    try {
      await seedProductionData()
      const targetCompany = selectedCompany || companies[0]

      const res = await supervisorService.registerSelf({
        role: regRole,
        fullName: regFullName.trim(),
        phone: regPhone.trim(),
        stationId: regStationId || PRODUCTION_STATIONS[0].id,
        companyId: targetCompany?.id || 'COMP-PV',
        companyShortCode: targetCompany?.shortCode || 'PV',
        pumpId: regRole === 'attendant' ? regPumpId : undefined,
        pin: regPin,
        employeeCode: regGeneratedCode,
      })

      setRegSuccessData({
        ...res,
        companyName: targetCompany?.name || 'PetroView',
      })
    } catch (err) {
      setRegError(describeError(err))
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#080c14] text-slate-100 overflow-y-auto relative selection:bg-orange-500/30">
      {/* Dynamic ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-b from-orange-600/15 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Top Brand Bar */}
      <div className="shrink-0 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-5 flex flex-col items-center gap-2 relative z-10">
        <MVPLogo size="lg" showText tagline animated />
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-400">
          <Radio className="w-3 h-3 text-orange-400 animate-pulse" />
          <span>PetroView Multi-Tenant Downstream Forecourt Platform</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 px-4 py-8 max-w-lg w-full mx-auto relative z-10 flex flex-col justify-center">
        {/* Navigation Tabs */}
        <div className="flex items-center p-1 bg-slate-950 rounded-2xl border border-slate-800/90 mb-6 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login')
              setLoginError(null)
              setIsPendingApproval(false)
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'login'
                ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/60 border border-orange-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('register')
              setRegError(null)
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'register'
                ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/60 border border-orange-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>

        {/* ----------------- TAB 1: SIGN IN ----------------- */}
        {activeTab === 'login' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-300">Unified Portal Authentication</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Auto-routes by Role</span>
            </div>

            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              {/* Employee Code */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center justify-between">
                  <span>Staff / Admin Code</span>
                  <span className="text-[10px] font-normal text-slate-500 lowercase">e.g. SUPER-ADMIN</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={loginCode}
                    onChange={e => setLoginCode(e.target.value.toUpperCase())}
                    placeholder="SUPER-ADMIN"
                    className="w-full rounded-xl bg-slate-900/90 border border-slate-800 pl-10 pr-4 py-3 text-sm font-mono text-white placeholder:text-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition"
                    autoCapitalize="characters"
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* 4-digit PIN */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center justify-between">
                  <span>4-Digit Security PIN</span>
                  <button
                    type="button"
                    onClick={() => setShowLoginPin(v => !v)}
                    className="text-[10px] font-bold text-orange-400 hover:text-orange-300 transition flex items-center gap-1"
                  >
                    {showLoginPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showLoginPin ? 'Hide' : 'Show'}
                  </button>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={pinInputRef}
                    value={loginPin}
                    onChange={e => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    type={showLoginPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="current-password"
                    className="w-full rounded-xl bg-slate-900/90 border border-slate-800 pl-10 pr-4 py-3 text-lg font-mono tracking-[0.4em] text-white placeholder:text-slate-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition text-center"
                  />
                </div>
              </div>

              {/* Pending Approval Banner */}
              {isPendingApproval && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/40 p-4 text-amber-200 flex flex-col gap-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                    <span>Account Pending Company HQ Approval</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-200/90">
                    Your registration has been submitted and is currently waiting in your <strong>Company HQ Approval Queue</strong>.
                    Once approved by your company administrator, you will be able to sign in immediately.
                  </p>
                </div>
              )}

              {/* General Error Banner */}
              {loginError && !isPendingApproval && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-[11px] font-semibold text-rose-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Dynamic Role Detected Indicator */}
              {loginCode.length >= 3 && (
                <div className="text-[11px] font-mono px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800/80 flex items-center gap-2">
                  {inferRoleFromCode(loginCode) === 'superadmin' ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-rose-300 font-bold">Tier 1: Platform Master Console (Super Super Admin)</span>
                    </>
                  ) : inferRoleFromCode(loginCode) === 'headoffice' ? (
                    <>
                      <Building2 className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-orange-300 font-bold">Tier 2: Company HQ Admin · Staff Approvals & Stations</span>
                    </>
                  ) : inferRoleFromCode(loginCode) === 'supervisor' ? (
                    <>
                      <UserCog className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-300 font-bold">Tier 3: Station Manager Portal · Shift Reviews</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300 font-bold">Tier 3: Attendant Forecourt OS · POS & Dispensing</span>
                    </>
                  )}
                </div>
              )}

              {/* Submit Sign In Button */}
              <button
                type="submit"
                disabled={signingIn || loginCode.length < 3 || loginPin.length !== 4}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3.5 text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-lg shadow-orange-950/60 border border-orange-400/30 disabled:opacity-40 disabled:cursor-not-allowed mt-1 active:scale-[0.98]"
              >
                {signingIn && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                <KeyRound className="w-4 h-4" />
                {signingIn ? 'Verifying & Authenticating…' : 'Sign In'}
              </button>
            </form>
          </div>
        )}

        {/* ----------------- TAB 2: SELF-REGISTRATION ----------------- */}
        {activeTab === 'register' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-bold text-slate-200">Staff Onboarding (Requires Company HQ Approval)</span>
              </div>
            </div>

            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3.5">
              {/* 1. Oil Marketing Company Selection (Populated by System) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center justify-between">
                  <span>1. Select Oil Marketing Company (OMC)</span>
                  <span className="text-[10px] font-normal text-slate-500">Official Registered OMCs</span>
                </label>
                <div className="relative">
                  <select
                    value={regCompanyId}
                    onChange={e => setRegCompanyId(e.target.value)}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3.5 py-2.5 text-xs text-white focus:border-orange-500 outline-none transition font-semibold"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.shortCode})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Role Switcher */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                  2. Select Operating Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRegRole('attendant')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      regRole === 'attendant'
                        ? 'bg-orange-500/15 border-orange-500 text-white shadow-md shadow-orange-950/40 ring-1 ring-orange-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-orange-400">
                      <Zap className="w-4 h-4" />
                      <span>Fuel Attendant</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Dispensing, meter reads, shift closing & POS
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegRole('supervisor')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition ${
                      regRole === 'supervisor'
                        ? 'bg-orange-500/15 border-orange-500 text-white shadow-md shadow-orange-950/40 ring-1 ring-orange-500/30'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-400">
                      <UserCog className="w-4 h-4" />
                      <span>Station Manager</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Shift approvals, dip charts, staff supervision
                    </p>
                  </button>
                </div>
              </div>

              {/* 3. Auto-Generated Code Highlight Badge */}
              <div className="rounded-2xl bg-gradient-to-r from-orange-950/70 via-slate-900 to-amber-950/70 border border-orange-500/40 p-3.5 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-md shrink-0"
                    style={{ backgroundColor: selectedCompany?.primaryColor || '#F97316' }}
                  >
                    {selectedCompany?.shortCode || 'PV'}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide block">
                      Auto-Assigned Staff ID ({selectedCompany?.name})
                    </span>
                    <span className="text-base font-mono font-black text-white tracking-wider">
                      {regGeneratedCode || 'Generating…'}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold">
                  {regRole === 'attendant' ? 'Suffix "A"' : 'Suffix "M"'}
                </span>
              </div>

              {/* 4. Full Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                  Full Name (Official)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={regFullName}
                    onChange={e => setRegFullName(e.target.value)}
                    placeholder="e.g. Kwesi Manu"
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
                    required
                  />
                </div>
              </div>

              {/* 5. Phone Number */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                  Mobile Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    placeholder="e.g. 024 123 4567"
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none transition"
                    required
                  />
                </div>
              </div>

              {/* 6. Station Selection (Scoped to Company) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                  Assigned Station Branch ({selectedCompany?.name})
                </label>
                <select
                  value={regStationId}
                  onChange={e => setRegStationId(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white focus:border-orange-500 outline-none transition"
                >
                  {companyStations.length > 0 ? (
                    companyStations.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.location})
                      </option>
                    ))
                  ) : (
                    PRODUCTION_STATIONS.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.location})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* 7. Pump Selection (if Attendant) */}
              {regRole === 'attendant' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                    Default Assigned Pump
                  </label>
                  <select
                    value={regPumpId}
                    onChange={e => setRegPumpId(e.target.value)}
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white focus:border-orange-500 outline-none transition"
                  >
                    {PRODUCTION_PUMPS.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} · ({p.fuels.join(', ')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 8. 4-digit PIN + Confirm */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                    Create 4-Digit PIN
                  </label>
                  <input
                    value={regPin}
                    onChange={e => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    type="password"
                    inputMode="numeric"
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-base font-mono tracking-widest text-center text-white placeholder:text-slate-700 focus:border-orange-500 outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                    Confirm PIN
                  </label>
                  <input
                    value={regConfirmPin}
                    onChange={e => setRegConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    type="password"
                    inputMode="numeric"
                    className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-base font-mono tracking-widest text-center text-white placeholder:text-slate-700 focus:border-orange-500 outline-none transition"
                    required
                  />
                </div>
              </div>

              {/* Error Message */}
              {regError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-[11px] font-semibold text-rose-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{regError}</span>
                </div>
              )}

              <p className="text-[10px] text-slate-500 flex items-center gap-1.5 leading-relaxed">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span>
                  All new staff accounts are created in <strong>Pending</strong> state and must be authorized in the{' '}
                  <strong className="text-white">{selectedCompany?.name || 'Company HQ'}</strong> Dashboard before operating.
                </span>
              </p>

              {/* Submit Registration Button */}
              <button
                type="submit"
                disabled={
                  registering ||
                  !regFullName.trim() ||
                  !regPhone.trim() ||
                  regPin.length !== 4 ||
                  regConfirmPin.length !== 4
                }
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3.5 text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-lg shadow-orange-950/60 border border-orange-400/30 disabled:opacity-40 disabled:cursor-not-allowed mt-1 active:scale-[0.98]"
              >
                {registering && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                <UserPlus className="w-4 h-4" />
                {registering ? 'Submitting to Company HQ…' : `Register Staff Account for ${selectedCompany?.shortCode || 'HQ'} Approval`}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Registration Success Modal */}
      {regSuccessData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="max-w-sm w-full rounded-3xl bg-slate-900 border border-orange-500/40 p-6 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-xl shadow-orange-950/60 border border-orange-400/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-white">Registration Submitted!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your profile has been created under <strong>{regSuccessData.companyName}</strong> and queued for HQ administrator authorization.
              </p>
            </div>

            <div className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-4 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Assigned Staff Code</span>
              <span className="text-2xl font-mono font-black text-orange-400 tracking-wider">
                {regSuccessData.employeeCode}
              </span>
              <span className="text-xs font-bold text-white">{regSuccessData.fullName}</span>
              <span className="text-[10px] font-mono text-slate-400 capitalize">
                Company: {regSuccessData.companyName} · Role: {regSuccessData.role === 'attendant' ? 'Fuel Attendant' : 'Station Manager'}
              </span>
            </div>

            <div className="w-full rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-left flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/90 leading-tight">
                <strong>Next Step:</strong> Contact your {regSuccessData.companyName} Head Office Administrator to approve ID{' '}
                <span className="font-mono font-bold text-white">{regSuccessData.employeeCode}</span> in the HQ Dashboard.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setLoginCode(regSuccessData.employeeCode)
                setLoginPin('')
                setRegSuccessData(null)
                setActiveTab('login')
              }}
              className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3 text-xs font-bold transition shadow-md shadow-orange-950/40"
            >
              Proceed to Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  )
}