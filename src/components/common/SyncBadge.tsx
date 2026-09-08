import React from 'react'
import { SYNC_STATUS_CONFIG, type SyncStatusType } from '../../constants/syncStates'
import { CheckCircle2, Clock, RefreshCw, AlertCircle, HardDrive } from 'lucide-react'

interface SyncBadgeProps {
  status: SyncStatusType
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  showLabel?: boolean
  customLabel?: string
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  showLabel = true,
  customLabel
}) => {
  const config = SYNC_STATUS_CONFIG[status] || SYNC_STATUS_CONFIG.saved_local

  const getIcon = () => {
    switch (status) {
      case 'synced':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      case 'pending':
        return <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      case 'transferring':
        return <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
      case 'failed':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
      case 'saved_local':
      default:
        return <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
    }
  }

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1 font-semibold rounded-full',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-semibold rounded-full',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-bold rounded-full',
  }

  return (
    <span
      className={`inline-flex items-center border shadow-xs transition-colors select-none ${config.badgeColor} ${sizeClasses[size]}`}
      title={config.description}
    >
      {showIcon && getIcon()}
      {showLabel && <span>{customLabel || config.shortLabel}</span>}
    </span>
  )
}
