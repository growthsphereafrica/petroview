/**
 * Sync status screen — shows the durable local queue and lets the
 * attendant push pending records to the cloud gateway.
 */

import React, { useEffect, useState } from 'react'
import { Cloud, CloudUpload, RefreshCw, ShieldCheck } from 'lucide-react'
import { useShift } from '../providers'
import { Badge, Card, ScreenHeader } from '../ui'
import { syncQueueRepo } from '../../../core/infra/repositories'
import { formatDateTime } from '../../../utils/currencyFormatter'
import type { SyncQueueItem } from '../../../core/domain/types'

export const SyncScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { pushSync, pendingCount } = useShift()
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [syncing, setSyncing] = useState(false)

  const reload = async () => {
    const all = await syncQueueRepo.getAll()
    setQueue(all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
  }

  useEffect(() => {
    void reload()
  }, [pendingCount])

  const run = async () => {
    setSyncing(true)
    try {
      await pushSync()
      await reload()
    } finally {
      setSyncing(false)
    }
  }

  const synced = queue.filter(q => q.status === 'SYNCED').length
  const failed = queue.filter(q => q.status === 'FAILED').length

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader title="Synchronization" subtitle="Offline-first queue" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 grid grid-cols-3 divide-x divide-slate-800 text-center shadow-md">
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-500">Pending</p>
            <p className="text-2xl font-black text-amber-400">{pendingCount}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-500">Synced</p>
            <p className="text-2xl font-black text-orange-400">{synced}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-slate-500">Failed</p>
            <p className="text-2xl font-black text-rose-400">{failed}</p>
          </div>
        </div>

        <button
          onClick={() => void run()}
          disabled={syncing || pendingCount === 0}
          className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-orange-950/60 border border-orange-400/30"
        >
          {syncing ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CloudUpload className="w-5 h-5" />}
          {syncing ? 'Pushing records…' : pendingCount > 0 ? `Push all pending (${pendingCount})` : 'All caught up'}
        </button>

        <div className="flex items-center gap-2 rounded-xl bg-orange-500/10 border border-orange-500/20 px-3.5 py-2.5">
          <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" />
          <p className="text-[11px] text-orange-200">
            Every record is committed to your device first. If the network drops, it waits here and retries automatically.
          </p>
        </div>

        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          {queue.length === 0 && (
            <div className="px-4 py-8 flex flex-col items-center text-center">
              <Cloud className="w-8 h-8 text-slate-700 mb-2" />
              <p className="text-xs text-slate-500">Nothing to sync.</p>
            </div>
          )}
          {queue.map(item => (
            <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{item.entityType} · {item.entityId}</p>
                <p className="text-[10px] text-slate-500">
                  {item.attempts > 0 ? `${item.attempts} attempt(s)` : 'queued'} · {formatDateTime(item.createdAt)}
                </p>
              </div>
              <Badge tone={item.status === 'SYNCED' ? 'flame' : item.status === 'FAILED' ? 'danger' : 'warning'}>
                {item.status}
              </Badge>
            </div>
          ))}
        </Card>

        <button
          onClick={onBack}
          className="w-full rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white py-3 text-sm font-bold flex items-center justify-center gap-2 transition"
        >
          <RefreshCw className="w-4 h-4" /> Back to Dashboard
        </button>
      </div>
    </div>
  )
}