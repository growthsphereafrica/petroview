/**
 * React providers + hooks that bind the production core services to the UI.
 * Two providers: AttendantSessionProvider (auth) and ShiftProvider (lifecycle).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { shiftService } from '../../core/services/shiftService'
import { syncService } from '../../core/services/syncService'
import { describeError, DomainError } from '../../core/domain/errors'
import { backendLogout } from '../../services/backendApiService'
import { prodDb } from '../../core/infra/db'
import { attendantRepo } from '../../core/infra/repositories'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { formatGHS } from '../../utils/currencyFormatter'
import { loadUnifiedSession, clearUnifiedSession, type UnifiedSession } from '../unified/UnifiedLoginScreen'
import type { Attendant, Shift } from '../../core/domain/types'

const AUTO_SYNC_INTERVAL_MS = 15_000

// ---------------------------------------------------------------------------
// Session context
// ---------------------------------------------------------------------------

interface SessionContextValue {
  ready: boolean
  attendant: Attendant | null
  signingIn: boolean
  signIn: (employeeCode: string, pin: string) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

export const AttendantSessionProvider: React.FC<{ children: React.ReactNode; session?: UnifiedSession | null }> = ({
  children,
  session,
}) => {
  const [ready, setReady] = useState(false)
  const [attendant, setAttendant] = useState<Attendant | null>(null)
  const signingIn = false

  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const activeUni = session || loadUnifiedSession()
        if (!activeUni || activeUni.role !== 'attendant') return
        let att = await attendantRepo.findByEmployeeCode(activeUni.employeeCode)
        if (!att) {
          att = {
            id: `att-${activeUni.employeeCode.toLowerCase()}`,
            employeeCode: activeUni.employeeCode,
            fullName: activeUni.fullName,
            pinSalt: 'synced_session',
            pinHash: 'synced_session',
            stationId: activeUni.stationId || '',
            pumpId: null,
            companyId: activeUni.companyId,
            companyShortCode: activeUni.companyShortCode,
            approvalStatus: 'APPROVED',
            approvedAt: activeUni.expiresAt,
            approvedBy: 'Backend',
            active: true,
            failedAttempts: 0,
            lockoutUntil: null,
            createdAt: new Date().toISOString(),
          }
          await prodDb.attendants.put(att)
        } else if (activeUni.stationId && att.stationId !== activeUni.stationId) {
          att.stationId = activeUni.stationId
          if (activeUni.companyId) att.companyId = activeUni.companyId
          if (activeUni.companyShortCode) att.companyShortCode = activeUni.companyShortCode
          await prodDb.attendants.put(att)
        }
        if (!cancelled) setAttendant(att)
      } catch (err) {
        // A blocked or corrupt IndexedDB must not present as a silent
        // logged-out state with no explanation.
        console.error('[session] restore failed', err)
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
    setAttendant(null)
    window.location.reload()
  }, [])

  const value = useMemo(
    () => ({ ready, attendant, signingIn, signIn, signOut }),
    [ready, attendant, signingIn, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useAttendantSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useAttendantSession must be used within AttendantSessionProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Shift context
// ---------------------------------------------------------------------------

export type ShiftToast = { message: string; kind: 'success' | 'error' | 'info' | 'warning' } | null

interface ShiftContextValue {
  loading: boolean
  activeShift: Shift | null
  shifts: Shift[]
  toast: ShiftToast
  dismissToast: () => void
  openShift: (input: { pumpId: string; openingReadings: Shift['openingReadings'] }) => Promise<void>
  recordSale: (input: { fuelCode: Shift['sales'][number]['fuelCode']; litres: number; method: 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'; unitPrice?: number }) => Promise<void>
  updateSale: (txId: string, updates: { fuelCode?: Shift['sales'][number]['fuelCode']; litres?: number; method?: 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'; unitPrice?: number }) => Promise<void>
  deleteSale: (txId: string) => Promise<void>
  closeShift: (input: { closingReadings: Shift['closingReadings']; notes?: string }) => Promise<void>
  refresh: () => Promise<void>
  pushSync: () => Promise<void>
  pendingCount: number
}

const ShiftContext = createContext<ShiftContextValue | undefined>(undefined)

export const ShiftProvider: React.FC<{ children: React.ReactNode; attendant: Attendant | null }> = ({ children, attendant }) => {
  const [loading, setLoading] = useState(true)
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [toast, setToast] = useState<ShiftToast>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!attendant) {
      setActiveShift(null)
      setShifts([])
      setLoading(false)
      return
    }
    try {
      const [current, history] = await Promise.all([
        shiftService.getActiveShift(attendant.id),
        shiftService.listShifts(attendant.id),
      ])
      setActiveShift(current)
      setShifts(history)
      setPendingCount(await syncService.pendingCount())
    } catch (err) {
      // Never leave `loading` true: a rejected read used to strand the
      // attendant on a permanent spinner with no way forward.
      console.error('[shift] refresh failed', err)
    } finally {
      setLoading(false)
    }
  }, [attendant])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Live replication: supervisor or another "device" mutated the shared DB.
  useLiveChanges(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  // Background auto-sync: push pending records periodically when online.
  useEffect(() => {
    const timer = window.setInterval(() => {
      void syncService.runPendingSync().catch(err => console.error('[sync] periodic run failed', err))
    }, AUTO_SYNC_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  const notify = useCallback((message: string, kind: ShiftToast['kind'] = 'info') => {
    setToast({ message, kind })
    window.setTimeout(() => setToast(null), 4200)
  }, [])

  const openShift = useCallback(
    async (input: { pumpId: string; openingReadings: Shift['openingReadings'] }) => {
      if (!attendant) return
      try {
        const shift = await shiftService.openShift({ attendant, pumpId: input.pumpId, openingReadings: input.openingReadings })
        setActiveShift(shift)
        notify(`Shift ${shift.number} opened for Pump ${input.pumpId.replace('pump-', '')}`, 'success')
      } catch (err) {
        notify(describeError(err), 'error')
        throw err
      }
    },
    [attendant, notify],
  )

  const recordSale = useCallback(
    async (input: { fuelCode: Shift['sales'][number]['fuelCode']; litres: number; method: 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'; unitPrice?: number }) => {
      if (!attendant || !activeShift) {
        notify('No open shift. Start a shift first.', 'error')
        throw new DomainError('SHIFT_NOT_OPEN', 'No open shift.')
      }
      try {
        const updated = await shiftService.recordSale({
          shift: activeShift,
          fuelCode: input.fuelCode,
          litres: input.litres,
          method: input.method,
          unitPrice: input.unitPrice,
        })
        setActiveShift(updated)
        setShifts(prev => (prev.some(s => s.id === updated.id) ? prev.map(s => (s.id === updated.id ? updated : s)) : [updated, ...prev]))
        notify(`${input.litres.toFixed(2)}L ${input.fuelCode} — ${formatGHS(updated.actualTotal)} collected so far`, 'success')
      } catch (err) {
        // A sale that fails to persist must never look like a sale that
        // succeeded: the fuel is already dispensed and the cash already taken.
        notify(`Sale not recorded: ${describeError(err)}`, 'error')
        throw err
      }
    },
    [attendant, activeShift, notify],
  )

  const updateSale = useCallback(
    async (txId: string, updates: { fuelCode?: Shift['sales'][number]['fuelCode']; litres?: number; method?: 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'; unitPrice?: number }) => {
      if (!activeShift) {
        notify('No active shift.', 'error')
        return
      }
      try {
        const updated = await shiftService.updateTransaction(activeShift.id, txId, updates)
        setActiveShift(updated)
        setShifts(prev => prev.map(s => (s.id === updated.id ? updated : s)))
        notify('Transaction updated successfully.', 'success')
      } catch (err) {
        notify(describeError(err), 'error')
        throw err
      }
    },
    [activeShift, notify],
  )

  const deleteSale = useCallback(
    async (txId: string) => {
      if (!activeShift) {
        notify('No active shift.', 'error')
        return
      }
      try {
        const updated = await shiftService.deleteTransaction(activeShift.id, txId)
        setActiveShift(updated)
        setShifts(prev => prev.map(s => (s.id === updated.id ? updated : s)))
        notify('Transaction removed.', 'info')
      } catch (err) {
        notify(describeError(err), 'error')
        throw err
      }
    },
    [activeShift, notify],
  )

  const closeShift = useCallback(
    async (input: { closingReadings: Shift['closingReadings']; notes?: string }) => {
      if (!activeShift) {
        notify('No open shift to close.', 'error')
        throw new DomainError('SHIFT_NOT_OPEN', 'No open shift.')
      }
      const closed = await shiftService.closeShift(activeShift, input.closingReadings, input.notes ?? null)
      setActiveShift(null)
      setShifts(prev => prev.map(s => (s.id === closed.id ? closed : s)))
      await refresh()
      notify(`Shift ${closed.number} closed and queued for sync.`, 'success')
    },
    [activeShift, notify, refresh],
  )

  const pushSync = useCallback(async () => {
    const result = await syncService.runPendingSync(true)
    setPendingCount(await syncService.pendingCount())
    notify(
      result.attempted === 0
        ? 'Nothing pending — all records up to date.'
        : `Synchronized ${result.succeeded}/${result.attempted} record(s).`,
      result.failed > 0 ? 'warning' : 'success',
    )
  }, [notify])

  // Reflect sync status changes into pending counter.
  useEffect(() => {
    const unsub = syncService.subscribe(async event => {
      setPendingCount(event.pendingCount)
    })
    return () => unsub()
  }, [])

  const value = useMemo(
    () => ({
      loading,
      activeShift,
      shifts,
      toast,
      dismissToast: () => setToast(null),
      openShift,
      recordSale,
      updateSale,
      deleteSale,
      closeShift,
      refresh,
      pushSync,
      pendingCount,
    }),
    [loading, activeShift, shifts, toast, openShift, recordSale, updateSale, deleteSale, closeShift, refresh, pushSync, pendingCount],
  )

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>
}

export function useShift(): ShiftContextValue {
  const ctx = useContext(ShiftContext)
  if (!ctx) throw new Error('useShift must be used within ShiftProvider')
  return ctx
}