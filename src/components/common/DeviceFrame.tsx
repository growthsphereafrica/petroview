import React from 'react'
import { Wifi, WifiOff, BatteryMedium, Signal, HardDrive, Smartphone, Tablet } from 'lucide-react'
import { useNetworkSimulator } from '../../context/NetworkSimulatorContext'

interface DeviceFrameProps {
  children: React.ReactNode
  type?: 'phone' | 'tablet' | 'fullscreen'
  title?: string
  subtitle?: string
  className?: string
}

export const DeviceFrame: React.FC<DeviceFrameProps> = ({
  children,
  type = 'phone',
  title,
  subtitle,
  className = ''
}) => {
  const { networkMode, isOnline, isLocalWifi, isOffline } = useNetworkSimulator()

  if (type === 'fullscreen') {
    return <div className={`w-full h-full ${className}`}>{children}</div>
  }

  const isPhone = type === 'phone'

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Device Label / Header Info */}
      {(title || subtitle) && (
        <div className="mb-2 text-center select-none">
          {title && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
              {isPhone ? <Smartphone className="w-3.5 h-3.5 text-emerald-400" /> : <Tablet className="w-3.5 h-3.5 text-amber-400" />}
              {title}
            </div>
          )}
          {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
        </div>
      )}

      {/* Hardware Device Chassis */}
      <div
        className={`relative ${
          isPhone
            ? 'w-[375px] h-[780px] max-w-full rounded-[44px]'
            : 'w-[520px] h-[780px] max-w-full rounded-[36px]'
        } bg-slate-950 p-3 shadow-2xl ring-1 ring-white/10 shadow-black/80 flex flex-col border-4 border-slate-800 transition-all`}
      >
        {/* Hardware Notch / Camera Pill */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-30 flex items-center justify-center gap-2 pointer-events-none shadow-inner">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700/60" />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-950 border border-blue-600/40" />
        </div>

        {/* Screen Bezel Inner Shell */}
        <div className="relative w-full h-full bg-white dark:bg-slate-900 rounded-[34px] overflow-hidden flex flex-col border border-slate-800/80">
          {/* iOS / Android Status Bar */}
          <div className="h-10 px-6 pt-2 bg-transparent shrink-0 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 z-20 select-none">
            <span className="font-mono text-[11px] tracking-tight">9:41</span>
            <div className="flex items-center gap-1.5 text-[11px]">
              {isOnline ? (
                <div className="flex items-center gap-0.5 text-emerald-500" title="Online (4G / Cloud)">
                  <Signal className="w-3 h-3" />
                  <Wifi className="w-3 h-3" />
                </div>
              ) : isLocalWifi ? (
                <div className="flex items-center gap-0.5 text-amber-500" title="Station Wi-Fi Only (Local Mesh)">
                  <Wifi className="w-3 h-3" />
                </div>
              ) : (
                <div className="flex items-center gap-0.5 text-rose-500" title="Air-Gapped / Offline">
                  <WifiOff className="w-3 h-3" />
                </div>
              )}
              <BatteryMedium className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            </div>
          </div>

          {/* Screen Content Scrollable Area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
            {children}
          </div>

          {/* Bottom Home Indicator Bar */}
          <div className="h-4 shrink-0 flex items-center justify-center bg-transparent pointer-events-none">
            <div className="w-28 h-1 bg-slate-400/40 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
