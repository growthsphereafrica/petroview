/**
 * Supervisor React providers: session provider (auth) + data provider
 * (shifts, review workflow, attendants, audit trail, live replication).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supervisorService, type SupervisorStats } from '../../core/services/supervisorService'
import { syncService, type SyncResult } from '../../core/services/syncService'
import { prodDb, seedProductionData } from '../../core/infra/db'
import { supervisorRepo } from '../../core/infra/repositories'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { loadUnifiedSession, clearUnifiedSession, type UnifiedSession } from '../unified/UnifiedLoginScreen'
import type { AuditEntry, Attendant, Shift, ShiftStatus, Supervisor } from '../../core/domain/types'

const SESSION_STORAGE_KEY = 'mvp_prod_supervisor_token'
const AUTO_SYNC_INTERVAL_MS = 15_000

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

interface SessionContextValue {
  ready: boolean
  supervisor: Supervisor | null
  signingIn: boolean
  signIn: (employeeCode: string, pin: string) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

export const SupervisorSessionProvider: React.FC<{ children: React.ReactNode; session?: UnifiedSession | null }> = ({
  children,
  session,
}) => {
  const [ready, setReady] = useState(false)
  const [supervisor, setSupervisor] = useState<Supervisor | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function restore() {
      await seedProductionData()
      const activeUni = session || loadUnifiedSession()
      if (activeUni && (activeUni.role === 'supervisor' || activeUni.role === 'headoffice')) {
        let sup = await supervisorRepo.findByEmployeeCode(activeUni.employeeCode)
        if (!sup) {
          sup = {
            id: `sup-${activeUni.employeeCode.toLowerCase()}`,
            employeeCode: activeUni.employeeCode,
            fullName: activeUni.fullName,
            pinSalt: 'synced_session',
            pinHash: 'synced_session',
            stationId: activeUni.stationId || 'stn-01',
            companyId: activeUni.companyId,
            companyShortCode: activeUni.companyShortCode,
            isHeadOffice: activeUni.role === 'headoffice',
            isSuperAdmin: false,
            approvalStatus: 'APPROVED',
            approvedAt: new Date().toISOString(),
            approvedBy: 'Super Admin',
            active: true,
            failedAttempts: 0,
            lockoutUntil: null,
            createdAt: new Date().toISOString(),
          }
          await prodDb.supervisors.put(sup)
        }
        const token = localStorage.getItem(SESSION_STORAGE_KEY) || `sess_${crypto.randomUUID()}`
        localStorage.setItem(SESSION_STORAGE_KEY, token)
        await prodDb.supervisorSessions.put({
          id: `sess-${crypto.randomUUID()}`,
          token,
          supervisorId: sup.id,
          employeeCode: sup.employeeCode,
          fullName: sup.fullName,
          stationId: sup.stationId || 'stn-01',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        })
        if (!cancelled) setSupervisor(sup)
      } else {
        const token = localStorage.getItem(SESSION_STORAGE_KEY)
        if (token) {
          try {
            const { supervisor } = await supervisorService.verifySession(token)
            if (!cancelled) setSupervisor(supervisor)
          } catch {
            localStorage.removeItem(SESSION_STORAGE_KEY)
          }
        }
      }
      if (!cancelled) setReady(true)
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [session])

  const signIn = useCallback(async (employeeCode: string, pin: string) => {
    setSigningIn(true)
    try {
      const { supervisor, session } = await supervisorService.authenticate(employeeCode, pin)
      localStorage.setItem(SESSION_STORAGE_KEY, session.token)
      setSupervisor(supervisor)
    } finally {
      setSigningIn(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    const token = localStorage.getItem(SESSION_STORAGE_KEY)
    if (token) await supervisorService.logout(token)
    clearUnifiedSession()
    setSupervisor(null)
    window.location.reload()
  }, [])

  const value = useMemo(() => ({ ready, supervisor, signingIn, signIn, signOut }), [ready, supervisor, signingIn, signIn, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSupervisorSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSupervisorSession must be used within SupervisorSessionProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface SupervisorData {
  loading: boolean
  shifts: Shift[]
  attendants: Attendant[]
  stats: SupervisorStats | null
  pendingSync: number
  auditLog: AuditEntry[]
  lastRefreshAt: string | null
  refresh: () => Promise<void>
  reviewShift: (shiftId: string, verdict: Extract<ShiftStatus, 'APPROVED' | 'REJECTED'>, notes: string) => Promise<void>
  registerAttendant: (input: { fullName: string; employeeCode: string; pin: string; pumpId: string }) => Promise<Attendant>
  deactivateAttendant: (id: string) => Promise<void>
  resetPin: (attendantId: string, newPin: string) => Promise<void>
  pushSync: () => Promise<SyncResult>
}

const DataContext = createContext<SupervisorData | undefined>(undefined)

export const SupervisorDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { supervisor } = useSupervisorSession()
  const [loading, setLoading] = useState(true)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [attendants, setAttendants] = useState<Attendant[]>([])
  const [stats, setStats] = useState<SupervisorStats | null>(null)
  const [pendingSync, setPendingSync] = useState(0)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [allShifts, allAttendants, dashboard, pending, log] = await Promise.all([
      supervisorService.listAllShifts(),
      supervisorService.listAttendants(),
      supervisorService.dashboardStats(),
      syncService.pendingCount(),
      supervisorService.listAuditLog(),
    ])
    setShifts(allShifts)
    setAttendants(allAttendants)
    setStats(dashboard)
    setPendingSync(pending)
    setAuditLog(log)
    setLastRefreshAt(new Date().toISOString())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const unsub = syncService.subscribe(event => setPendingSync(event.pendingCount))
    return () => unsub()
  }, [])

  // Live replication: another "device" mutated the shared production DB.
  useLiveChanges(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  // Background auto-sync: periodically push pending records when online.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void syncService.runPendingSync()
    }, AUTO_SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  const reviewShift = useCallback(
    async (shiftId: string, verdict: Extract<ShiftStatus, 'APPROVED' | 'REJECTED'>, notes: string) => {
      if (!supervisor) return
      await supervisorService.reviewShift(shiftId, verdict, notes, supervisor)
      await refresh()
    },
    [supervisor, refresh],
  )

  const registerAttendant = useCallback(
    async (input: { fullName: string; employeeCode: string; pin: string; pumpId: string }) => {
      if (!supervisor) throw new Error('Not authenticated')
      const attendant = await supervisorService.registerAttendant(input, supervisor)
      await refresh()
      return attendant
    },
    [supervisor, refresh],
  )

  const deactivateAttendant = useCallback(
    async (id: string) => {
      if (!supervisor) return
      await supervisorService.deactivateAttendant(id, supervisor)
      await refresh()
    },
    [supervisor, refresh],
  )

  const resetPin = useCallback(
    async (attendantId: string, newPin: string) => {
      if (!supervisor) return
      await supervisorService.resetAttendantPin(attendantId, newPin, supervisor)
      await refresh()
    },
    [supervisor, refresh],
  )

  const pushSync = useCallback(async () => {
    const result = await syncService.runPendingSync()
    await refresh()
    return result
  }, [refresh])

  const value = useMemo(
    () => ({
      loading,
      shifts,
      attendants,
      stats,
      pendingSync,
      auditLog,
      lastRefreshAt,
      refresh,
      reviewShift,
      registerAttendant,
      deactivateAttendant,
      resetPin,
      pushSync,
    }),
    [loading, shifts, attendants, stats, pendingSync, auditLog, lastRefreshAt, refresh, reviewShift, registerAttendant, deactivateAttendant, resetPin, pushSync],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useSupervisorData(): SupervisorData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useSupervisorData must be used within SupervisorDataProvider')
  return ctx
}