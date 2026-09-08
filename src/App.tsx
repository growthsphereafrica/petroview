import React, { lazy, Suspense, useState } from 'react'
import { ForecourtProvider, useForecourt } from './context/ForecourtContext'
import { NetworkSimulatorProvider, useNetworkSimulator } from './context/NetworkSimulatorContext'
import { MVPLogo } from './components/common/MVPLogo'
import { DeviceFrame } from './components/common/DeviceFrame'
import { CompanySelectorModal } from './components/company/CompanySelectorModal'
import { PWAInstallPrompt } from './components/common/PWAInstallPrompt'
import {
  UnifiedLoginScreen,
  loadUnifiedSession,
  saveUnifiedSession,
  clearUnifiedSession,
  type UnifiedSession,
} from './features/unified/UnifiedLoginScreen'

// Code-split the heavy production portals: each loads on demand.
const ProductionAttendantApp = lazy(() =>
  import('./features/attendant/ProductionAttendantApp').then(m => ({ default: m.ProductionAttendantApp })),
)
const ProductionSupervisorApp = lazy(() =>
  import('./features/supervisor/ProductionSupervisorApp').then(m => ({ default: m.ProductionSupervisorApp })),
)
const ProductionHeadOfficeDashboard = lazy(() =>
  import('./features/headoffice/HeadOfficeDashboard').then(m => ({ default: m.ProductionHeadOfficeDashboard })),
)
import {
  Smartphone,
  Tablet,
  Building2,
  Monitor,
  Wifi,
  WifiOff,
  Globe,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
  Code
} from 'lucide-react'

type AppViewMode = 'attendant' | 'supervisor_desktop' | 'supervisor_mobile' | 'headoffice'

const MainAppLayout: React.FC = () => {
  const [activeMode, setActiveMode] = useState<AppViewMode>(() =>
    loadUnifiedSession()?.role === 'attendant' ? 'attendant' : 'supervisor_desktop',
  )
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
  const [session, setSession] = useState<UnifiedSession | null>(() => loadUnifiedSession())
  const { activeCompany, activeStation, notification, setNotification } = useForecourt()
  const { networkMode, isOnline, isLocalWifi, isOffline } = useNetworkSimulator()

  if (!session) {
    return (
      <UnifiedLoginScreen
        onAuthenticated={next => {
          saveUnifiedSession(next)
          setSession(next)
          setActiveMode(next.role === 'attendant' ? 'attendant' : 'supervisor_desktop')
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Production Navigation Header */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40">
        {/* Brand & Multi-Company Tenant Switcher */}
        <div className="flex items-center gap-4">
          <MVPLogo size="md" showText={true} tagline={true} />

          {/* Active Company & Branch Switcher Button */}
          <button
            onClick={() => setIsCompanyModalOpen(true)}
            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-slate-950/80 border border-slate-700/80 hover:border-orange-500/80 transition shadow-inner group"
            title="Click to switch active Oil & Gas Company or Branch Station"
          >
            <span className="w-2.5 h-2.5 rounded-full ring-2 ring-orange-500/30" style={{ backgroundColor: activeCompany.primaryColor }} />
            <div className="text-left">
              <span className="text-[10px] font-mono font-bold text-orange-400 block uppercase leading-none">
                {activeCompany.shortCode} Tenant
              </span>
              <span className="text-xs font-bold text-white leading-tight group-hover:text-orange-200 transition">
                {activeStation.name}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-400 transition" />
          </button>
        </div>

        {/* 4 Clean Production Role Portals */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/90 rounded-2xl border border-slate-800 shadow-inner overflow-x-auto">
          <button
            onClick={() => setActiveMode('attendant')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
              activeMode === 'attendant'
                ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/60 border border-orange-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Smartphone className={`w-4 h-4 ${activeMode === 'attendant' ? 'text-white' : 'text-orange-400'}`} />
            <span>Attendant (App / Web)</span>
          </button>

          <button
            onClick={() => setActiveMode('supervisor_desktop')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
              activeMode === 'supervisor_desktop'
                ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/60 border border-orange-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Monitor className={`w-4 h-4 ${activeMode === 'supervisor_desktop' ? 'text-white' : 'text-orange-400'}`} />
            <span>Supervisor Console (Web)</span>
          </button>

          <button
            onClick={() => setActiveMode('supervisor_mobile')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
              activeMode === 'supervisor_mobile'
                ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/60 border border-orange-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Tablet className={`w-4 h-4 ${activeMode === 'supervisor_mobile' ? 'text-white' : 'text-amber-400'}`} />
            <span>Supervisor Handheld (App)</span>
          </button>

          <button
            onClick={() => setActiveMode('headoffice')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shrink-0 ${
              activeMode === 'headoffice'
                ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/60 border border-orange-400/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Building2 className={`w-4 h-4 ${activeMode === 'headoffice' ? 'text-white' : 'text-amber-400'}`} />
            <span>Head Office & ERP APIs</span>
          </button>
        </div>

        {/* Right Actions: Signed-in identity + PWA Install + Network Pill */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-950 border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${session.role === 'supervisor' ? 'bg-orange-400' : 'bg-amber-400'}`} />
            <div className="leading-tight">
              <p className="text-[10px] font-mono font-bold text-slate-300">{session.fullName}</p>
              <p className="text-[9px] font-mono text-slate-500 uppercase">{session.employeeCode} · {session.role}</p>
            </div>
            <button
              onClick={() => {
                clearUnifiedSession()
                setSession(null)
              }}
              className="ml-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-bold text-rose-400 hover:bg-rose-500/10 transition"
              title="Sign out of all portals"
            >
              Sign out
            </button>
          </div>

          <PWAInstallPrompt />

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : isLocalWifi ? 'bg-amber-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-300 font-bold capitalize text-[11px]">
              {networkMode === 'online' ? 'Cloud Connected' : networkMode === 'local_wifi' ? 'Station Wi-Fi Mesh' : 'Air-Gapped Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Suspense
          fallback={
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 gap-3">
              <span className="w-10 h-10 border-4 border-slate-800 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-xs font-mono text-slate-500">Loading PetroView portal…</p>
            </div>
          }
        >
        {activeMode === 'attendant' && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center bg-slate-950">
<DeviceFrame
              type="phone"
              title="Attendant Mobile Forecourt OS"
              subtitle="Production build — offline-first with locked shift lifecycle"
            >
              <ProductionAttendantApp />
            </DeviceFrame>
          </div>
        )}

        {activeMode === 'supervisor_desktop' && (
          <div className="flex-1 overflow-y-auto bg-slate-950">
            <ProductionSupervisorApp />
          </div>
        )}

        {activeMode === 'supervisor_mobile' && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center bg-slate-950">
            <DeviceFrame
              type="phone"
              title="Supervisor Handheld Station Hub"
              subtitle="Touch-optimized mobile tablet app for forecourt audits & QR scanning"
            >
              <ProductionSupervisorApp />
            </DeviceFrame>
          </div>
        )}

        {activeMode === 'headoffice' && <ProductionHeadOfficeDashboard />}
        </Suspense>
      </main>

      {/* Multi-Company & Branch Switcher Modal */}
      <CompanySelectorModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
      />

      {/* Global Toast Notification Popup */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 max-w-md ${
              notification.type === 'success'
                ? 'bg-emerald-950 border-emerald-600 text-emerald-100'
                : notification.type === 'error'
                ? 'bg-rose-950 border-rose-600 text-rose-100'
                : notification.type === 'warning'
                ? 'bg-amber-950 border-amber-600 text-amber-100'
                : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {notification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
            {notification.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
            {notification.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}

            <span className="text-xs font-semibold leading-snug">{notification.message}</span>

            <button
              onClick={() => setNotification(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <NetworkSimulatorProvider>
      <ForecourtProvider>
        <MainAppLayout />
      </ForecourtProvider>
    </NetworkSimulatorProvider>
  )
}
