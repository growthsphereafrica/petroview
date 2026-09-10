import React, { lazy, Suspense, useState, useEffect } from 'react'
import { ForecourtProvider, useForecourt } from './context/ForecourtContext'
import { NetworkSimulatorProvider, useNetworkSimulator } from './context/NetworkSimulatorContext'
import { ThemeProvider, ThemeToggleButton, useTheme } from './context/ThemeContext'
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
  const { theme } = useTheme()

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
    <div className={`min-h-screen flex flex-col font-sans selection:bg-orange-500/30 ${
      theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-[#080c14] text-slate-100'
    }`}>
      {/* Clean Production Enterprise Header */}
      <header className={`px-4 sm:px-6 py-2.5 shrink-0 flex items-center justify-between gap-3 sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${
        theme === 'light' ? 'bg-white/95 border-slate-200 shadow-sm' : 'bg-slate-950/90 border-slate-800/80'
      }`}>
        {/* Brand & Station Identity */}
        <div className="flex items-center gap-3">
          <MVPLogo size="md" showText={!isMobileScreen} tagline={!isMobileScreen} />

          {/* Active Station / Enterprise Tag */}
          <button
            onClick={() => session.role === 'superadmin' && setIsCompanyModalOpen(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-left transition ${
              theme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-white'
            } ${
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
              <span className="text-[9px] font-mono font-bold text-orange-500 block uppercase">
                {session.role === 'superadmin'
                  ? 'Master Console'
                  : session.role === 'headoffice'
                  ? session.companyShortCode || 'Enterprise Network'
                  : activeCompany.shortCode}
              </span>
              <span className={`text-xs font-bold truncate max-w-[140px] sm:max-w-none block ${
                theme === 'light' ? 'text-slate-900' : 'text-white'
              }`}>
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

        {/* Right Section: Theme Toggle + Role View Mode toggle + Operator Profile + Connectivity + Sign Out */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Global Theme Toggle */}
          <ThemeToggleButton size="sm" />

          {/* Attendant Desktop View Toggle (Full Screen vs Device Frame) */}
          {session.role === 'attendant' && !isMobileScreen && (
            <button
              onClick={() => setDesktopFrameMode(v => !v)}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition ${
                theme === 'light'
                  ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
              title={desktopFrameMode ? 'Switch to Full Screen View' : 'Switch to Handheld Phone Frame'}
            >
              {desktopFrameMode ? <Maximize2 className="w-3.5 h-3.5 text-orange-400" /> : <Smartphone className="w-3.5 h-3.5 text-orange-400" />}
              <span>{desktopFrameMode ? 'Full View' : 'Phone Frame'}</span>
            </button>
          )}

          {/* User Profile Pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-inner ${
            theme === 'light' ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                session.role === 'superadmin'
                  ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40'
                  : session.role === 'headoffice'
                  ? 'bg-orange-500/20 text-orange-500 border border-orange-500/40'
                  : session.role === 'supervisor'
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
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
              <p className={`text-xs font-bold truncate max-w-[130px] ${
                theme === 'light' ? 'text-slate-900' : 'text-white'
              }`}>{session.fullName}</p>
              <p className={`text-[10px] font-mono ${
                theme === 'light' ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <span className="text-orange-500 font-bold">{session.employeeCode}</span> · {roleLabel}
              </p>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={() => {
                clearUnifiedSession()
                setSession(null)
              }}
              className={`ml-1 p-1.5 rounded-lg border text-rose-500 hover:bg-rose-500/15 hover:border-rose-500/40 transition flex items-center gap-1 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold hidden md:inline">Sign out</span>
            </button>
          </div>

          <PWAInstallPrompt />

          {/* Connectivity Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-mono ${
              theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
            title={networkMode === 'online' ? 'Cloud Connected' : networkMode === 'local_wifi' ? 'Station Wi-Fi Mesh' : 'Air-Gapped Offline'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500 animate-pulse' : isLocalWifi ? 'bg-amber-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-500 text-[10px] font-bold capitalize hidden lg:inline">
              {networkMode === 'online' ? 'Cloud' : networkMode === 'local_wifi' ? 'Mesh' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main View Area with Strict Role-Based Portal Access */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Suspense
          fallback={
            <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${
              theme === 'light' ? 'bg-slate-100' : 'bg-[#080c14]'
            }`}>
              <span className="w-10 h-10 border-4 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
              <p className="text-xs font-mono text-slate-500">Loading PetroView portal…</p>
            </div>
          }
        >
          {/* 1. Attendant Portal */}
          {session.role === 'attendant' && (
            <div className={`flex-1 flex flex-col overflow-y-auto ${
              theme === 'light' ? 'bg-slate-100' : 'bg-[#080c14]'
            }`}>
              {desktopFrameMode && !isMobileScreen ? (
                <div className="flex-1 p-6 flex flex-col items-center justify-center">
                  <DeviceFrame
                    type="phone"
                    title="Attendant Mobile Forecourt OS"
                    subtitle="Simulated handheld device terminal"
                  >
                    <ProductionAttendantApp session={session} />
                  </DeviceFrame>
                </div>
              ) : (
                <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto">
                  <ProductionAttendantApp session={session} />
                </div>
              )}
            </div>
          )}

          {/* 2. Station Manager / Supervisor Portal */}
          {session.role === 'supervisor' && (
            <div className={`flex-1 overflow-y-auto ${
              theme === 'light' ? 'bg-slate-100' : 'bg-[#080c14]'
            }`}>
              <ProductionSupervisorApp session={session} />
            </div>
          )}

          {/* 3. OMC HQ Admin Portal */}
          {session.role === 'headoffice' && (
            <div className={`flex-1 overflow-y-auto ${
              theme === 'light' ? 'bg-slate-100' : 'bg-[#080c14]'
            }`}>
              <ProductionHeadOfficeDashboard session={session} />
            </div>
          )}

          {/* 4. Super Admin Console */}
          {session.role === 'superadmin' && (
            <div className={`flex-1 overflow-y-auto ${
              theme === 'light' ? 'bg-slate-100' : 'bg-[#080c14]'
            }`}>
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
    <ThemeProvider>
      <NetworkSimulatorProvider>
        <ForecourtProvider>
          <MainAppLayout />
        </ForecourtProvider>
      </NetworkSimulatorProvider>
    </ThemeProvider>
  )
}
