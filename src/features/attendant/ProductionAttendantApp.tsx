/**
 * Production Attendant App — ties session + shift providers to the
 * mobile screen flow with typed navigation and a global toast.
 */

import React, { useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { AttendantSessionProvider, ShiftProvider, useAttendantSession, useShift } from './providers'
import { LoginScreen } from './screens/LoginScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { StartShiftScreen } from './screens/StartShiftScreen'
import { MeterReadingsScreen } from './screens/MeterReadingsScreen'
import { SalesScreen } from './screens/SalesScreen'
import { ReceiptCaptureScreen } from './screens/ReceiptCaptureScreen'
import { ClosingReadingsScreen } from './screens/ClosingReadingsScreen'
import { ShiftSummaryScreen } from './screens/ShiftSummaryScreen'
import { SyncScreen } from './screens/SyncScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import type { MeterReading } from '../../core/domain/types'

type Screen =
  | 'dashboard'
  | 'start_shift'
  | 'opening_readings'
  | 'sales'
  | 'receipts'
  | 'closing'
  | 'summary'
  | 'sync'
  | 'settings'

const Splash: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center bg-slate-950 gap-3">
    <span className="w-10 h-10 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
    <p className="text-xs font-mono text-slate-500">Initializing production database…</p>
  </div>
)

const ShiftNavigator: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [pendingPumpId, setPendingPumpId] = useState<string | null>(null)
  const { activeShift, openShift, toast, dismissToast } = useShift()
  const go = (s: Screen) => setScreen(s)

  const dashboard = (
    <DashboardScreen
      onGoToStartShift={() => go('start_shift')}
      onGoToTransactions={() => go('sales')}
      onGoToClose={() => go('closing')}
      onGoToSync={() => go('sync')}
      onGoToSettings={() => go('settings')}
    />
  )

  const handleStartShiftNext = (pumpId: string) => {
    setPendingPumpId(pumpId)
    go('opening_readings')
  }

  const handleOpeningSaved = async (readings: MeterReading[]) => {
    if (!pendingPumpId) return
    await openShift({ pumpId: pendingPumpId, openingReadings: readings })
    go('dashboard')
  }

  const handleClosed = () => go('summary')

  return (
    <div className="relative h-full">
      {screen === 'dashboard' && dashboard}

      {screen === 'start_shift' && <StartShiftScreen onNext={handleStartShiftNext} onBack={() => go('dashboard')} />}

      {screen === 'opening_readings' && pendingPumpId && (
        <MeterReadingsScreen
          pumpId={pendingPumpId}
          mode="opening"
          onBack={() => go('start_shift')}
          onSave={values => void handleOpeningSaved(values)}
        />
      )}

      {screen === 'sales'
        ? activeShift
          ? <SalesScreen onBack={() => go('dashboard')} onCaptureReceipt={() => go('receipts')} />
          : dashboard
        : null}

      {screen === 'receipts' && activeShift && <ReceiptCaptureScreen onBack={() => go('sales')} />}

      {screen === 'closing' && activeShift && (
        <ClosingReadingsScreen onBack={() => go('sales')} onClosed={handleClosed} />
      )}

      {screen === 'summary' && <ShiftSummaryScreen onBack={() => go('dashboard')} onDone={() => go('dashboard')} />}

      {screen === 'sync' && <SyncScreen onBack={() => go('dashboard')} />}

      {screen === 'settings' && <SettingsScreen onBack={() => go('dashboard')} />}

      {/* Global toast */}
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
            <button onClick={dismissToast} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const AuthenticatedApp: React.FC = () => {
  const { ready, attendant } = useAttendantSession()
  if (!ready) return <Splash />
  if (!attendant) return <LoginScreen />
  return (
    <ShiftProvider attendant={attendant}>
      <ShiftNavigator />
    </ShiftProvider>
  )
}

export const ProductionAttendantApp: React.FC = () => (
  <AttendantSessionProvider>
    <AuthenticatedApp />
  </AttendantSessionProvider>
)