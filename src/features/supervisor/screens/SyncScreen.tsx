/**
 * Supervisor sync center — pushes queued shift records to the cloud
 * gateway and reports per-record state.
 */

import React, { useEffect, useState } from 'react'
import { CloudUpload, RefreshCw, Wifi } from 'lucide-react'
import { useSupervisorData } from '../providers'
import { syncService } from '../../../core/services/syncService'
import { syncQueueRepo } from '../../../core/infra/repositories'
import { Badge, BigActionButton, Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { formatDateTime } from '../../../utils/currencyFormatter'
import type { SyncQueueItem } from '../../../core/domain/types'

export const SupervisorSyncScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { pendingSync, pushSync, refresh } = useSupervisorData()
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const loadQueue = async () => {
    setQueue(await syncQueueRepo.getAll())
  }

  useEffect(() => {
    void loadQueue()
    const unsub = syncService.subscribe(() => void loadQueue())
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async () => {
    setRunning(true)
    setMessage(null)
    try {
      const result = await pushSync()
      await loadQueue()
      await refresh()
      setMessage(`${result.succeeded} pushed · ${result.failed} failed politely retried.`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-y-auto">
      <StatusBar online />
      <ScreenHeader title="Sync Center" subtitle="Offline-first · durable queue" onBack={onBack} />

      <div className="flex-1 px-4 py-4 max-w-4xl w-full mx-auto flex flex-col gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase font-bold text-slate-500">Queued for upload</p>
            <Badge tone={pendingSync > 0 ? 'warning' : 'success'}>{pendingSync}</Badge>
          </div>
          <p className="text-xs text-slate-400 leading-snug mt-2">
            Records are held locally until the cloud gateway accepts them. Failed items retry with
            exponential backoff — nothing is lost on a device restart.
          </p>
          <div className="mt-4">
            <BigActionButton variant="primary" loading={running} onClick={() => void run()}>
              <CloudUpload className="w-4 h-4" />
              {running ? 'Pushing…' : pendingSync > 0 ? `Push ${pendingSync} record${pendingSync === 1 ? '' : 's'}` : 'Push now'}
            </BigActionButton>
          </div>
          {message && <p className="mt-3 text-[11px] font-semibold text-emerald-400">{message}</p>}
        </Card>

        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2 text-slate-400">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">Upload queue</span>
          </div>
          {queue.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Wifi className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500">All clear — no pending uploads.</p>
            </div>
          ) : (
            queue.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">
                    {item.entityType} · {item.entityId}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500">queued {formatDateTime(item.createdAt)}</p>
                </div>
                <Badge tone={item.status === 'SYNCED' ? 'success' : item.status === 'FAILED' ? 'danger' : 'warning'}>
                  {item.status === 'SYNCED' ? 'Synced' : item.status === 'FAILED' ? 'Failed' : `Attempt ${item.attempts}`}
                </Badge>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}