/**
 * Supervisor React providers: session provider (auth) + data provider
 * (shifts, review workflow, attendants, audit trail, live replication).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supervisorService, type SupervisorStats } from '../../core/services/supervisorService'
import { syncService, type SyncResult } from '../../core/services/syncService'
import { backendLogout } from '../../services/backendApiService'
import { prodDb } from '../../core/infra/db'
import { supervisorRepo } from '../../core/infra/repositories'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { loadUnifiedSession, clearUnifiedSession, type UnifiedSession } from '../unified/UnifiedLoginScreen'
import type { AuditEntry, Attendant, Shift, ShiftStatus, Supervisor } from '../../core/domain/types'

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
  const signingIn = false

  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const activeUni = session || loadUnifiedSession()
        if (!activeUni || (activeUni.role !== 'supervisor' && activeUni.role !== 'headoffice')) return
        let sup = await supervisorRepo.findByEmployeeCode(activeUni.employeeCode)
        if (!sup) {
          sup = {
            id: `sup-${activeUni.employeeCode.toLowerCase()}`,
            employeeCode: activeUni.employeeCode,
            fullName: activeUni.fullName,
            pinSalt: 'synced_session',
            pinHash: 'synced_session',
            stationId: activeUni.stationId || '',
            companyId: activeUni.companyId,
            companyShortCode: activeUni.companyShortCode,
            isHeadOffice: activeUni.role === 'headoffice',
            isSuperAdmin: false,
            approvalStatus: 'APPROVED',
            approvedAt: activeUni.expiresAt,
            approvedBy: 'Backend',
            active: true,
            failedAttempts: 0,
            lockoutUntil: null,
            createdAt: new Date().toISOString(),
          }
          await prodDb.supervisors.put(sup)
        } else if (activeUni.stationId && sup.stationId !== activeUni.stationId) {
          sup.stationId = activeUni.stationId
          if (activeUni.companyId) sup.companyId = activeUni.companyId
          if (activeUni.companyShortCode) sup.companyShortCode = activeUni.companyShortCode
          await prodDb.supervisors.put(sup)
        }
        if (!cancelled) setSupervisor(sup)
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [session])

  const signIn = useCallback(async () => {
    throw new Error('Use the unified gateway to sign in.')
  }, [])

  const signOut = useCallback(async () => {
    await backendLogout()
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
  registerAttendant: (input: { fullName: string; employeeCode: string; pin: string; pumpId: string; stationId?: string }) => Promise<Attendant>
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
    const stationId = supervisor?.stationId
    const companyId = supervisor?.companyId
    const isHeadOffice = !!supervisor?.isHeadOffice
    const [allShifts, allAttendants, dashboard, pending, log] = await Promise.all([
      supervisorService.listAllShifts(stationId, companyId, isHeadOffice),
      supervisorService.listAttendants(stationId, companyId),
      supervisorService.dashboardStats(stationId, companyId, isHeadOffice),
      syncService.pendingCount(),
      supervisorService.listAuditLog(stationId, companyId),
    ])
    setShifts(allShifts)
    setAttendants(allAttendants)
    setStats(dashboard)
    setPendingSync(pending)
    setAuditLog(log)
    setLastRefreshAt(new Date().toISOString())
    setLoading(false)
  }, [supervisor?.stationId, supervisor?.companyId, supervisor?.isHeadOffice])

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

  // Background auto-sync: periodically push pending records and refresh remote shifts when online.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await syncService.runPendingSync()
          await refresh()
        } catch { /* best effort */ }
      })()
    }, AUTO_SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  const reviewShift = useCallback(
    async (shiftId: string, verdict: Extract<ShiftStatus, 'APPROVED' | 'REJECTED'>, notes: string) => {
      if (!supervisor) return
      await supervisorService.reviewShift(shiftId, verdict, notes, supervisor)
      await refresh()
    },
    [supervisor, refresh],
  )

  const registerAttendant = useCallback(
    async (input: { fullName: string; employeeCode: string; pin: string; pumpId: string; stationId?: string }) => {
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