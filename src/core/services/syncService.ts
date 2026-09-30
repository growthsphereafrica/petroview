/**
 * Offline-first synchronization service with durable retry queue.
 * Records are never lost: every mutation is committed to IndexedDB before
 * being queued for upload. Failed uploads are retried with exponential backoff.
 */

import { syncQueueRepo } from '../infra/repositories'
import { nextRetryDecision } from './syncPolicy'
import type { SyncQueueItem } from '../domain/types'
import { liveSyncBus } from './liveSyncBus'
import { uploadEntityToCloud } from '../../services/cloudApiService'

export interface SyncResult {
  attempted: number
  succeeded: number
  failed: number
  deadLettered: number
}

export interface SyncProgressEvent {
  pendingCount: number
  syncedCount: number
  deadLetteredCount: number
  result?: SyncResult
}

type SyncListener = (event: SyncProgressEvent) => void

async function uploadEntity(item: SyncQueueItem): Promise<void> {
  await uploadEntityToCloud(item.entityType, item.entityId)
}

export { MAX_SYNC_ATTEMPTS, nextRetryDecision, toSyncStatusLabel } from './syncPolicy'


export class SyncService {
  private listeners: SyncListener[] = []
  private running = false
  private rerunRequested = false
  private debounceTimer: number | null = null
  private autoSyncInterval: number | null = null

  private lastResult: SyncResult | null = null

  constructor() {
    this.initAutoSync()
  }

  private initAutoSync(): void {
    if (typeof window === 'undefined') return

    // Immediately trigger upload when connection returns
    window.addEventListener('online', () => {
      console.log('[SyncService] Device is ONLINE. Triggering immediate background sync pass.')
      void this.runPendingSync(true).catch(err => console.error('[SyncService] sync pass failed', err))
    })

    // Trigger sync when tab becomes active again
    window.addEventListener('focus', () => {
      void this.runPendingSync(true).catch(err => console.error('[SyncService] sync pass failed', err))
    })

    // Continuous background sync loop (checks every 10 seconds)
    this.autoSyncInterval = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      void this.runPendingSync().catch(err => console.error('[SyncService] periodic pass failed', err))
    }, 10_000)
  }

  /**
   * Triggers a fast background sync pass whenever local data changes.
   * Ensures near real-time propagation from attendants to managers and HQ.
   */
  triggerBackgroundSync(delayMs = 100): void {
    if (typeof window === 'undefined') return
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null
      void this.runPendingSync().catch(err => console.error('[SyncService] debounced pass failed', err))
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
    const [pending, all, deadLettered] = await Promise.all([
      syncQueueRepo.getCount(),
      syncQueueRepo.getAll(),
      syncQueueRepo.getDeadLettered(),
    ])
    const synced = all.filter(q => q.status === 'SYNCED').length
    return { pendingCount: pending, syncedCount: synced, deadLetteredCount: deadLettered.length }
  }

  /**
   * Triggers a sync pass for all due items.
   * When force = true (e.g. manual Push), ignores exponential backoff and retries immediately.
   */
  async runPendingSync(force = false): Promise<SyncResult> {
    const empty: SyncResult = { attempted: 0, succeeded: 0, failed: 0, deadLettered: 0 }
    if (this.running) {
      this.rerunRequested = true
      if (force) {
        while (this.running) {
          await new Promise(r => setTimeout(r, 60))
        }
        const remaining = await syncQueueRepo.getCount()
        if (remaining > 0) {
          return this.runPendingSync(true)
        }
        return this.lastResult ?? empty
      }
      return empty
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return empty
    }
    this.running = true
    try {
      const due = await syncQueueRepo.getPending(force)
      const result: SyncResult = { attempted: due.length, succeeded: 0, failed: 0, deadLettered: 0 }

      for (const item of due) {
        try {
          await uploadEntity(item)
          item.status = 'SYNCED'
          // `attempts` counts failed tries, not total operations. Incrementing it
          // on success too made the number the UI shows meaningless.
          item.lastError = null
          item.nextRetryAt = null
          item.updatedAt = new Date().toISOString()
          await syncQueueRepo.update(item)
          result.succeeded += 1
          liveSyncBus.publish({ table: 'SYNC_QUEUE', reason: 'UPDATE', key: item.id })
        } catch (err) {
          item.attempts += 1
          item.lastError = err instanceof Error ? err.message : 'upload failed'
          item.updatedAt = new Date().toISOString()
          const decision = nextRetryDecision(item.attempts)
          item.status = decision.status
          item.nextRetryAt = decision.nextRetryAt
          if (decision.status === 'DEAD_LETTER') {
            result.deadLettered += 1
            console.error(
              `[SyncService] ${item.entityType}:${item.entityId} gave up after ${item.attempts} attempts.`,
              item.lastError,
            )
          } else {
            result.failed += 1
          }
          await syncQueueRepo.update(item)
        }
      }

      // Bound the queue table. Without this it grew for the life of the install
      // and getAll() loaded every historical row on every pass.
      await syncQueueRepo.pruneSynced()

      this.lastResult = result
      this.emit({ ...(await this.getStats()), result })
      return result
    } catch (err) {
      // getPending/getStats can throw. Swallowing here keeps a transient storage
      // fault from becoming an unhandled rejection at every call site.
      console.error('[SyncService] sync pass aborted', err)
      this.emit({ ...(await this.getStats().catch(() => ({ pendingCount: 0, syncedCount: 0, deadLetteredCount: 0 }))) })
      return empty
    } finally {
      this.running = false
      if (this.rerunRequested) {
        this.rerunRequested = false
        void this.runPendingSync().catch(err => console.error('[SyncService] deferred pass failed', err))
      }
    }
  }

  async pendingCount(): Promise<number> {
    return syncQueueRepo.getCount()
  }

  /** Records that need a human decision, most recent first. */
  async deadLettered(): Promise<SyncQueueItem[]> {
    return syncQueueRepo.getDeadLettered()
  }

  /** Re-queues a dead-lettered record after the cause was corrected. */
  async retryDeadLettered(id: string): Promise<void> {
    await syncQueueRepo.revive(id)
    liveSyncBus.publish({ table: 'SYNC_QUEUE', reason: 'UPDATE', key: id })
    this.emit({ ...(await this.getStats()) })
    void this.runPendingSync().catch(err => console.error('[SyncService] retry pass failed', err))
  }

  /** Re-queues ALL dead-lettered records for retry. */
  async retryAllDeadLettered(): Promise<number> {
    const count = await syncQueueRepo.reviveAllDeadLettered()
    if (count > 0) {
      liveSyncBus.publish({ table: 'SYNC_QUEUE', reason: 'UPDATE', key: 'ALL' })
      this.emit({ ...(await this.getStats()) })
      void this.runPendingSync().catch(err => console.error('[SyncService] retryAll pass failed', err))
    }
    return count
  }

  /** Automatically revives records that failed due to expired credentials now that the user authenticated. */
  async retryUnauthorizedOnLogin(): Promise<number> {
    const count = await syncQueueRepo.reviveUnauthorized()
    if (count > 0) {
      liveSyncBus.publish({ table: 'SYNC_QUEUE', reason: 'UPDATE', key: 'UNAUTHORIZED' })
      this.emit({ ...(await this.getStats()) })
      void this.runPendingSync().catch(err => console.error('[SyncService] auto-revive unauthorized pass failed', err))
    }
    return count
  }

  /** Discards a dead-lettered record's upload. The sale itself is untouched. */
  async discardDeadLettered(id: string): Promise<void> {
    await syncQueueRepo.discard(id)
    liveSyncBus.publish({ table: 'SYNC_QUEUE', reason: 'DELETE', key: id })
    this.emit({ ...(await this.getStats()) })
  }
}

export const syncService = new SyncService()