/**
 * Production Supervisor App — session + data providers wired to the
 * supervisor screen flow with typed navigation and a global toast.
 */

import React, { useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { SupervisorSessionProvider, SupervisorDataProvider, useSupervisorSession } from './providers'
import { clearUnifiedSession, type UnifiedSession } from '../unified/UnifiedLoginScreen'
import { SupervisorDashboardScreen } from './screens/DashboardScreen'
import { SupervisorShiftsScreen } from './screens/ShiftsScreen'
import { SupervisorShiftDetailScreen } from './screens/ShiftDetailScreen'
import { SupervisorAttendantsScreen } from './screens/AttendantsScreen'
import { SupervisorSyncScreen } from './screens/SyncScreen'
import { SupervisorSettingsScreen } from './screens/SettingsScreen'
import { SupervisorAuditLogScreen } from './screens/AuditLogScreen'
import { SupervisorTankReadingsScreen } from './screens/TankReadingsScreen'

type Screen = 'dashboard' | 'tank_readings' | 'shifts' | 'shift_detail' | 'attendants' | 'audit' | 'sync' | 'settings'

export interface ToastState {
  message: string
  kind: 'success' | 'error' | 'warning' | 'info'
}

const Splash: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center bg-slate-950 gap-3">
    <span className="w-10 h-10 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
    <p className="text-xs font-mono text-slate-500">Loading supervisor workspace…</p>
  </div>
)

const SupervisorNavigator: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const go = (s: Screen) => setScreen(s)

  const openShift = (shiftId: string) => {
    setSelectedShiftId(shiftId)
    go('shift_detail')
  }

  const notify = (message: string, kind: ToastState['kind'] = 'info') => {
    setToast({ message, kind })
    window.setTimeout(() => setToast(null), 3500)
  }

  return (
    <div className="relative h-full">
      {screen === 'dashboard' && (
        <SupervisorDashboardScreen
          onGoToShifts={() => go('shifts')}
          onGoToAttendants={() => go('attendants')}
          onGoToSync={() => go('sync')}
          onGoToSettings={() => go('settings')}
          onGoToAudit={() => go('audit')}
          onGoToTankReadings={() => go('tank_readings')}
          onOpenShift={openShift}
        />
      )}

      {screen === 'tank_readings' && <SupervisorTankReadingsScreen onBack={() => go('dashboard')} />}

      {screen === 'shifts' && <SupervisorShiftsScreen onBack={() => go('dashboard')} onOpenShift={openShift} />}

      {screen === 'shift_detail' && selectedShiftId && (
        <SupervisorShiftDetailScreen shiftId={selectedShiftId} onBack={() => go('shifts')} onToast={notify} />
      )}

      {screen === 'attendants' && <SupervisorAttendantsScreen onBack={() => go('dashboard')} onToast={notify} />}

      {screen === 'audit' && <SupervisorAuditLogScreen onBack={() => go('dashboard')} />}

      {screen === 'sync' && <SupervisorSyncScreen onBack={() => go('dashboard')} />}

      {screen === 'settings' && <SupervisorSettingsScreen onBack={() => go('dashboard')} />}

      {toast && (
        <div className="absolute bottom-5 left-4 right-4 z-40 animate-in slide-in-from-bottom duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 ${
              toast.kind === 'success'
                ? 'bg-emerald-950 border-emerald-600 text-emerald-100'
                : toast.kind === 'error'
                ? 'bg-rose-950 border-rose-600 text-rose-100'
                : toast.kind === 'warning'
                ? 'bg-amber-950 border-amber-600 text-amber-100'
                : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            {toast.kind === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {toast.kind === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
            {toast.kind === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
            {toast.kind === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}
            <span className="text-xs font-semibold leading-snug flex-1">{toast.message}</span>
            <button onClick={() => setToast(null)} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const AuthenticatedApp: React.FC = () => {
  const { ready, supervisor } = useSupervisorSession()
  if (!ready) return <Splash />
  if (!supervisor) {
    clearUnifiedSession()
    window.location.reload()
    return <Splash />
  }
  return (
    <SupervisorDataProvider>
      <SupervisorNavigator />
    </SupervisorDataProvider>
  )
}

export const ProductionSupervisorApp: React.FC<{ session?: UnifiedSession }> = ({ session }) => (
  <SupervisorSessionProvider session={session}>
    <AuthenticatedApp />
  </SupervisorSessionProvider>
)