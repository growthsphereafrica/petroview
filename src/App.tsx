import React, { lazy, Suspense, useState, useEffect } from 'react'
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
import {
  Smartphone,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
  LogOut,
  Maximize2,
  ShieldCheck,
  Sparkles,
  UserCog,
  Zap,
} from 'lucide-react'

// Code-split heavy production portals on demand
const ProductionAttendantApp = lazy(() =>
  import('./features/attendant/ProductionAttendantApp').then(m => ({ default: m.ProductionAttendantApp })),
)
const ProductionSupervisorApp = lazy(() =>
  import('./features/supervisor/ProductionSupervisorApp').then(m => ({ default: m.ProductionSupervisorApp })),
)
const ProductionHeadOfficeDashboard = lazy(() =>
  import('./features/headoffice/HeadOfficeDashboard').then(m => ({ default: m.ProductionHeadOfficeDashboard })),
)
const SuperSuperAdminDashboard = lazy(() =>
  import('./features/superadmin/SuperSuperAdminDashboard').then(m => ({ default: m.SuperSuperAdminDashboard })),
)

const MainAppLayout: React.FC = () => {
  const [session, setSession] = useState<UnifiedSession | null>(() => loadUnifiedSession())
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
  const [desktopFrameMode, setDesktopFrameMode] = useState<boolean>(false)
  const { activeCompany, activeStation, notification, setNotification } = useForecourt()
  const { networkMode, isOnline, isLocalWifi } = useNetworkSimulator()

  // Screen size detection for responsive mobile layout
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!session) {
    return (
      <UnifiedLoginScreen
        onAuthenticated={next => {
          saveUnifiedSession(next)
          setSession(next)
        }}
      />
    )
  }

  const roleLabel =
    session.role === 'superadmin'
      ? 'Platform Master'
      : session.role === 'headoffice'
      ? 'Company HQ Admin'
      : session.role === 'supervisor'
      ? 'Station Manager'
      : 'Fuel Attendant'

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col font-sans selection:bg-orange-500/30">
      {/* Clean Production Enterprise Header */}
      <header className="bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 py-2.5 shrink-0 flex items-center justify-between gap-3 sticky top-0 z-40">
        {/* Brand & Station Identity */}
        <div className="flex items-center gap-3">
          <MVPLogo size="md" showText={!isMobileScreen} tagline={!isMobileScreen} />

          {/* Active Station / Enterprise Tag */}
          <button
            onClick={() => session.role === 'superadmin' && setIsCompanyModalOpen(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-left transition ${
              session.role === 'superadmin'
                ? 'hover:border-orange-500/80 cursor-pointer group'
                : 'cursor-default pointer-events-none'
            }`}
            title={session.role === 'superadmin' ? 'Global Platform Owner · Switch/inspect tenant' : 'Assigned Enterprise OMC'}
          >
            <span
              className="w-2.5 h-2.5 rounded-full ring-2 ring-orange-500/30"
              style={{ backgroundColor: session.role === 'superadmin' ? '#F43F5E' : activeCompany.primaryColor }}
            />
            <div className="leading-tight">
              <span className="text-[9px] font-mono font-bold text-orange-400 block uppercase">
                {session.role === 'superadmin'
                  ? 'Master Console'
                  : session.role === 'headoffice'
                  ? session.companyShortCode || 'Enterprise Network'
                  : activeCompany.shortCode}
              </span>
              <span className="text-xs font-bold text-white truncate max-w-[140px] sm:max-w-none block">
                {session.role === 'superadmin'
                  ? 'All Registered OMCs'
                  : session.companyName || session.stationName || activeStation.name}
              </span>
            </div>
            {session.role === 'superadmin' && (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-orange-400 transition ml-0.5" />
            )}
          </button>
        </div>

        {/* Right Section: Role View Mode toggle + Operator Profile + Connectivity + Sign Out */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Attendant Desktop View Toggle (Full Screen vs Device Frame) */}
          {session.role === 'attendant' && !isMobileScreen && (
            <button
              onClick={() => setDesktopFrameMode(v => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-[11px] font-bold flex items-center gap-1.5 transition"
              title={desktopFrameMode ? 'Switch to Full Screen View' : 'Switch to Handheld Phone Frame'}
            >
              {desktopFrameMode ? <Maximize2 className="w-3.5 h-3.5 text-orange-400" /> : <Smartphone className="w-3.5 h-3.5 text-orange-400" />}
              <span>{desktopFrameMode ? 'Full View' : 'Phone Frame'}</span>
            </button>
          )}

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-inner">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                session.role === 'superadmin'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : session.role === 'headoffice'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                  : session.role === 'supervisor'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {session.role === 'superadmin' ? (
                <Sparkles className="w-3.5 h-3.5" />
              ) : session.role === 'headoffice' ? (
                <Building2 className="w-3.5 h-3.5" />
              ) : session.role === 'supervisor' ? (
                <UserCog className="w-3.5 h-3.5" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
            </div>

            <div className="leading-tight hidden sm:block">
              <p className="text-xs font-bold text-white truncate max-w-[130px]">{session.fullName}</p>
              <p className="text-[10px] font-mono text-slate-400">
                <span className="text-orange-400 font-bold">{session.employeeCode}</span> · {roleLabel}
              </p>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={() => {
                clearUnifiedSession()
                setSession(null)
              }}
              className="ml-1 p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-rose-400 hover:bg-rose-500/15 hover:border-rose-500/40 transition flex items-center gap-1"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold hidden md:inline">Sign out</span>
            </button>
          </div>

          <PWAInstallPrompt />

          {/* Connectivity Status Pill */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono"
            title={networkMode === 'online' ? 'Cloud Connected' : networkMode === 'local_wifi' ? 'Station Wi-Fi Mesh' : 'Air-Gapped Offline'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : isLocalWifi ? 'bg-amber-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-400 text-[10px] font-bold capitalize hidden lg:inline">
              {networkMode === 'online' ? 'Cloud' : networkMode === 'local_wifi' ? 'Mesh' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main View Area with Strict Role-Based Portal Access */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Suspense
          fallback={
            <div className="flex-1 flex flex-col items-center justify-center bg-[#080c14] gap-3">
              <span className="w-10 h-10 border-4 border-slate-800 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-xs font-mono text-slate-500">Loading PetroView portal…</p>
            </div>
          }
        >
          {/* 1. Attendant Portal */}
          {session.role === 'attendant' && (
            <div className="flex-1 flex flex-col overflow-y-auto bg-[#080c14]">
              {desktopFrameMode && !isMobileScreen ? (
                <div className="flex-1 p-6 flex flex-col items-center justify-center">
                  <DeviceFrame
                    type="phone"
                    title="Attendant Mobile Forecourt OS"
                    subtitle="Simulated handheld device terminal"
                  >
                    <ProductionAttendantApp />
                  </DeviceFrame>
                </div>
              ) : (
                <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto">
                  <ProductionAttendantApp />
                </div>
              )}
            </div>
          )}

          {/* 2. Station Manager / Supervisor Portal */}
          {session.role === 'supervisor' && (
            <div className="flex-1 overflow-y-auto bg-[#080c14]">
              <ProductionSupervisorApp />
            </div>
          )}

          {/* 3. Company Head Office Portal */}
          {session.role === 'headoffice' && (
            <div className="flex-1 overflow-y-auto bg-[#080c14]">
              <ProductionHeadOfficeDashboard session={session} />
            </div>
          )}

          {/* 4. Platform Master Super Super Admin Console */}
          {session.role === 'superadmin' && (
            <div className="flex-1 overflow-y-auto bg-[#080c14]">
              <SuperSuperAdminDashboard />
            </div>
          )}
        </Suspense>
      </main>

      {/* Multi-Company & Branch Switcher Modal (HQ & Super Admin) */}
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
