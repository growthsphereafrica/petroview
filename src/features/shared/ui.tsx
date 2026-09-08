/**
 * Shared presentational primitives for the production attendant UI.
 * Small, focused, Tailwind-based building blocks.
 */

import React, { type ReactNode } from 'react'
import { ArrowLeft, Battery, ChevronRight, Signal, Wifi, WifiOff } from 'lucide-react'
import { clsx } from 'clsx'

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3 bg-slate-950 border-b border-slate-800">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-extrabold text-white tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  )
}

export function StatusBar({ online }: { online: boolean }) {
  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-1.5 bg-slate-950">
      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
        <Signal className="w-3 h-3" />
        <span>4G</span>
        <Battery className="w-3.5 h-3.5 ml-2" />
        <span>98%</span>
      </div>
      <div
        className={clsx(
          'flex items-center gap-1 text-[10px] font-mono font-bold',
          online ? 'text-emerald-400' : 'text-amber-400',
        )}
      >
        {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
        <span>{online ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl bg-slate-900 border border-slate-800 shadow-sm', className)}>{children}</div>
  )
}

interface TappableRowProps {
  icon?: ReactNode
  title: string
  subtitle?: string
  value?: string
  onClick?: () => void
  accent?: string
}

export function TappableRow({ icon, title, subtitle, value, onClick, accent }: TappableRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/60 transition disabled:opacity-60"
    >
      {icon && (
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent ?? '#F97316'}22`, color: accent ?? '#F97316' }}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-white truncate">{title}</span>
        {subtitle && <span className="block text-[11px] text-slate-500 truncate">{subtitle}</span>}
      </span>
      {value && <span className="text-xs font-mono font-bold text-slate-300 shrink-0">{value}</span>}
      {onClick && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />}
    </button>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'flame' }) {
  const tones: Record<string, string> = {
    default: 'bg-slate-800 text-slate-300 border-slate-700',
    flame: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    danger: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  }
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', tones[tone])}>
      {children}
    </span>
  )
}

export function BigActionButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  loading,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'flame'
  loading?: boolean
}) {
  const styles: Record<string, string> = {
    primary: 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-950/60 border border-orange-400/30 font-extrabold',
    flame: 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white shadow-lg shadow-orange-950/60 border border-orange-400/30 font-extrabold',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold',
    ghost: 'bg-transparent text-slate-400 hover:text-white',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        'w-full rounded-xl py-3.5 text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        styles[variant],
      )}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}