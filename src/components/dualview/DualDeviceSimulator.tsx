import React, { useState } from 'react'
import { useNetworkSimulator, type NetworkMode } from '../../context/NetworkSimulatorContext'
import { useForecourt } from '../../context/ForecourtContext'
import { DeviceFrame } from '../common/DeviceFrame'
import { ProductionAttendantApp } from '../../features/attendant/ProductionAttendantApp'
import { ProductionSupervisorApp } from '../../features/supervisor/ProductionSupervisorApp'
import {
  Wifi,
  WifiOff,
  Globe,
  Radio,
  Sparkles,
  Terminal,
  Activity,
  ArrowLeftRight,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  RefreshCw,
  QrCode
} from 'lucide-react'

export const DualDeviceSimulator: React.FC = () => {
  const { networkMode, setNetworkMode, isOnline, isLocalWifi, isOffline, packetLogs, clearLogs } = useNetworkSimulator()
  const { syncAllPending, syncStats } = useForecourt()
  const [showLogDrawer, setShowLogDrawer] = useState(false)

  return (
    <div className="w-full flex-1 bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Interactive Network Controller Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-4 shadow-xl z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Live Forecourt Network Sandbox
              </h3>
              <p className="text-[11px] text-slate-400">
                Simulate network drops, station Wi-Fi mesh & air-gapped QR sync
              </p>
            </div>
          </div>
        </div>

        {/* 3 Network Mode Switcher Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800">
          <button
            onClick={() => setNetworkMode('online')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              isOnline
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Online (Cloud + Wi-Fi)</span>
          </button>

          <button
            onClick={() => setNetworkMode('local_wifi')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              isLocalWifi
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Station Wi-Fi Only</span>
          </button>

          <button
            onClick={() => setNetworkMode('offline')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
              isOffline
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>Air-Gapped Offline</span>
          </button>
        </div>

        {/* Sync Trigger & Log Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncAllPending()}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Trigger Peer Sync</span>
          </button>

          <button
            onClick={() => setShowLogDrawer(!showLogDrawer)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              showLogDrawer
                ? 'bg-slate-800 border-slate-600 text-emerald-400'
                : 'border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Packet Inspector</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </button>
        </div>
      </div>

      {/* Main Dual Device Stage */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8 lg:gap-12">
        {/* Device 1: Attendant Smartphone */}
        <div className="flex flex-col items-center">
          <DeviceFrame
            type="phone"
            title="Attendant Mobile App"
            subtitle="Production core — 100% offline, locked shift lifecycle"
          >
            <ProductionAttendantApp />
          </DeviceFrame>
        </div>

        {/* Device Inter-link Visual Indicator */}
        <div className="hidden lg:flex flex-col items-center justify-center self-center gap-3 p-3 rounded-2xl bg-slate-900/60 border border-slate-800 text-center max-w-[140px]">
          <ArrowLeftRight className={`w-6 h-6 ${isOnline ? 'text-emerald-400' : isLocalWifi ? 'text-amber-400' : 'text-slate-600'}`} />
          <span className="text-[10px] font-mono font-bold uppercase text-slate-400">
            {isOnline ? 'Cloud Sync' : isLocalWifi ? 'Local Peer Wi-Fi' : 'Air-Gap QR Only'}
          </span>
          <div className="text-[9px] text-slate-500">
            {isOffline ? 'Generate QR on left, scan on right' : 'Live state replication'}
          </div>
        </div>

        {/* Device 2: Supervisor Tablet Hub */}
        <div className="flex flex-col items-center">
          <DeviceFrame
            type="phone"
            title="Supervisor Station Hub"
            subtitle="Station manager tablet for audit, QR scanning & approvals"
          >
            <ProductionSupervisorApp />
          </DeviceFrame>
        </div>
      </div>

      {/* Real-Time Packet Inspector Drawer */}
      {showLogDrawer && (
        <div className="bg-slate-950 border-t border-slate-800 p-4 max-h-56 shrink-0 flex flex-col gap-2 overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white font-mono">
                Real-Time Forecourt Data Bus Packets
              </span>
            </div>
            <button
              onClick={clearLogs}
              className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Packets
            </button>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-[11px] flex flex-col gap-1 pr-1">
            {packetLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-900/80 border border-slate-800/60"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">{log.timestamp}</span>
                  <span className="text-emerald-400 font-bold">{log.protocol}</span>
                  <span className="text-slate-300">
                    [{log.source} ➔ {log.destination}]: {log.summary}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    log.status === 'success'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : log.status === 'queued'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  {log.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
