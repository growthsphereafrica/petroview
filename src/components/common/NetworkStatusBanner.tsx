import React from 'react'
import { useForecourt } from '../../context/ForecourtContext'
import { useNetworkSimulator } from '../../context/NetworkSimulatorContext'
import { RefreshCw, Wifi, WifiOff, Globe, HardDrive, ChevronRight } from 'lucide-react'

interface NetworkStatusBannerProps {
  onOpenSync?: () => void
  variant?: 'banner' | 'card' | 'compact'
}

export const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({
  onOpenSync,
  variant = 'banner'
}) => {
  const { syncStats, isSyncing, syncAllPending } = useForecourt()
  const { networkMode, isOnline, isLocalWifi, isOffline } = useNetworkSimulator()

  const hasPending = syncStats.pendingCount > 0

  if (variant === 'compact') {
    return (
      <button
        onClick={onOpenSync}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 transition"
      >
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : isLocalWifi ? 'bg-amber-500' : 'bg-rose-500'}`} />
        <span className="font-medium capitalize">{networkMode.replace('_', ' ')}</span>
        {hasPending && (
          <span className="bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
            {syncStats.pendingCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      onClick={onOpenSync}
      className={`cursor-pointer w-full transition-all duration-200 ${
        hasPending
          ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
          : 'bg-emerald-600 text-white hover:bg-emerald-500'
      } px-4 py-2.5 rounded-xl flex items-center justify-between shadow-md`}
    >
      <div className="flex items-center gap-2.5">
        <div className="p-1 rounded-lg bg-black/10">
          {isSyncing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : hasPending ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Wifi className="w-4 h-4" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-wide uppercase">
              {hasPending ? `Sync Status: Pending (${syncStats.pendingCount})` : 'Sync Status: All Synced'}
            </span>
          </div>
          <p className="text-[11px] opacity-90 leading-tight">
            Last sync: {syncStats.lastSyncTime} • {isOnline ? 'Cloud Online' : isLocalWifi ? 'Station Wi-Fi' : 'Air-Gapped Local'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs font-bold shrink-0">
        <span>Details</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </div>
  )
}
