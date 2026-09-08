export type SyncStatusType = 'synced' | 'pending' | 'transferring' | 'failed' | 'saved_local'

export interface SyncStatusConfig {
  key: SyncStatusType
  label: string
  shortLabel: string
  description: string
  badgeColor: string
  textColor: string
  borderColor: string
  dotColor: string
  bgColor: string
}

export const SYNC_STATUS_CONFIG: Record<SyncStatusType, SyncStatusConfig> = {
  synced: {
    key: 'synced',
    label: 'Synced',
    shortLabel: 'Synced',
    description: 'Successfully synchronized to supervisor & cloud',
    badgeColor: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500',
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-500',
  },
  pending: {
    key: 'pending',
    label: 'Pending Sync',
    shortLabel: 'Pending',
    description: 'Waiting to be synchronized',
    badgeColor: 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-500',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-500',
  },
  transferring: {
    key: 'transferring',
    label: 'Transferring',
    shortLabel: 'Transferring',
    description: 'Currently in progress',
    badgeColor: 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500',
    dotColor: 'bg-blue-500 animate-pulse',
    bgColor: 'bg-blue-500',
  },
  failed: {
    key: 'failed',
    label: 'Sync Failed',
    shortLabel: 'Failed',
    description: 'Failed to synchronize. Retry scheduled.',
    badgeColor: 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400',
    textColor: 'text-rose-600 dark:text-rose-400',
    borderColor: 'border-rose-500',
    dotColor: 'bg-rose-500',
    bgColor: 'bg-rose-500',
  },
  saved_local: {
    key: 'saved_local',
    label: 'Saved Locally',
    shortLabel: 'Local',
    description: 'Stored securely on this device (offline)',
    badgeColor: 'bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-400',
    textColor: 'text-slate-600 dark:text-slate-400',
    borderColor: 'border-slate-400',
    dotColor: 'bg-slate-400',
    bgColor: 'bg-slate-400',
  },
}
