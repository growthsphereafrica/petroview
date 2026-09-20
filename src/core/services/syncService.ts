/**
 * Offline-first synchronization service with durable retry queue.
 * Records are never lost: every mutation is committed to IndexedDB before
 * being queued for upload. Failed uploads are retried with exponential backoff.
 */

import { syncQueueRepo } from '../infra/repositories'
import type { SyncQueueItem, SyncStatus } from '../domain/types'
import { liveSyncBus } from './liveSyncBus'
import { getApiBase, uploadEntityToCloud } from '../../services/cloudApiService'

export interface SyncResult {
  attempted: number
  succeeded: number
  failed: number
}

export interface SyncProgressEvent {
  pendingCount: number
  syncedCount: number
  result?: SyncResult
}

type SyncListener = (event: SyncProgressEvent) => void

/**
 * Backend uploader. When a real API base URL is configured (VITE_API_URL)
 * the entity is POSTed to the gateway and failures are retried with
 * exponential backoff. Without a configured backend the device runs in
 * simulated-sync demo mode (any queued entity is treated as accepted).
 */
async function uploadEntity(item: SyncQueueItem): Promise<void> {
  if (getApiBase()) {
    await uploadEntityToCloud(item.entityType, item.entityId)
    return
  }
  await new Promise(resolve => setTimeout(resolve, 350))
}

const BACKOFF_BASE_MS = 1_000

export class SyncService {
  private listeners: SyncListener[] = []
  private running = false
  private debounceTimer: number | null = null
  private autoSyncInterval: number | null = null

  constructor() {
    this.initAutoSync()
  }

  private initAutoSync(): void {
    if (typeof window === 'undefined') return

    // Immediately trigger upload when connection returns
    window.addEventListener('online', () => {
      console.log('[SyncService] Device is ONLINE. Triggering immediate background sync pass.')
      void this.runPendingSync()
    })

    // Trigger sync when tab becomes active again
    window.addEventListener('focus', () => {
      void this.runPendingSync()
    })

    // Continuous background sync loop (checks every 12 seconds)
    this.autoSyncInterval = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      void this.runPendingSync()
    }, 12_000)
  }

  /**
   * Triggers a debounced background sync pass whenever local data changes.
   * Ensures high-frequency transactions don't overload the gateway while
   * guaranteeing zero-delay background upload.
   */
  triggerBackgroundSync(delayMs = 600): void {
    if (typeof window === 'undefined') return
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null
      void this.runPendingSync()
    }, delayMs)
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private emit(event: SyncProgressEvent): void {
    for (const l of this.listeners) {
      try {
        l(event)
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  private async getStats(): Promise<SyncProgressEvent> {
    const pending = await syncQueueRepo.getCount()
    const all = await syncQueueRepo.getAll()
    const synced = all.filter(q => q.status === 'SYNCED').length
    return { pendingCount: pending, syncedCount: synced }
  }

  /**
   * Triggers a sync pass for all due items. Safe to call while another
   * pass is already running — concurrent runs are coalesced.
   */
  async runPendingSync(): Promise<SyncResult> {
    if (this.running) return { attempted: 0, succeeded: 0, failed: 0 }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { attempted: 0, succeeded: 0, failed: 0 }
    }
    this.running = true
    try {
      const due = await syncQueueRepo.getPending()
      const result: SyncResult = { attempted: due.length, succeeded: 0, failed: 0 }

      for (const item of due) {
        try {
          await uploadEntity(item)
          item.status = 'SYNCED'
          item.attempts += 1
          item.lastError = null
          item.nextRetryAt = null
          item.updatedAt = new Date().toISOString()
          await syncQueueRepo.update(item)
          result.succeeded += 1
          liveSyncBus.publish({ table: 'SYNC_QUEUE', reason: 'UPDATE', key: item.id })
        } catch (err) {
          item.status = 'PENDING'
          item.attempts += 1
          item.lastError = err instanceof Error ? err.message : 'upload failed'
          item.nextRetryAt = new Date(Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** Math.min(item.attempts, 6), 60_000)).toISOString()
          item.updatedAt = new Date().toISOString()
          await syncQueueRepo.update(item)
          result.failed += 1
        }
      }

      this.emit({ ...(await this.getStats()), result })
      return result
    } finally {
      this.running = false
    }
  }

  async pendingCount(): Promise<number> {
    return syncQueueRepo.getCount()
  }
}

export const syncService = new SyncService()

export function toSyncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'SYNCED':
      return 'Synced'
    case 'FAILED':
      return 'Failed'
    default:
      return 'Pending'
  }
}