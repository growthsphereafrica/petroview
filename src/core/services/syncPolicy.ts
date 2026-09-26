/**
 * Sync retry policy — pure, framework-free, unit testable in isolation.
 *
 * This decides whether a fuel sale is eventually delivered to the server or
 * abandoned, so it is kept separate from the service that performs the upload:
 * the policy must be verifiable without a browser, a network, or a real clock.
 */

import type { SyncStatus } from '../domain/types'

const BACKOFF_BASE_MS = 1_000
export const MAX_BACKOFF_MS = 60_000

/**
 * Retry budget for a single record.
 *
 * There is deliberately no unbounded retry. A record the server permanently
 * rejects — a tenant-scope error, a price the company does not authorise, a
 * ledger mismatch — used to be retried every 12 seconds forever, inflating the
 * "pending" badge permanently and giving the attendant no way to clear it.
 * After this many failures the record is dead-lettered and stops consuming
 * battery and bandwidth until a human acts on it.
 */
export const MAX_SYNC_ATTEMPTS = 12

export interface RetryDecision {
  status: SyncStatus
  nextRetryAt: string | null
}

export function nextRetryDecision(attempts: number, now: number = Date.now()): RetryDecision {
  if (attempts >= MAX_SYNC_ATTEMPTS) {
    return { status: 'DEAD_LETTER', nextRetryAt: null }
  }
  // attempts is the number of failures so far, so the first retry waits one
  // base interval: base * 2^(attempts - 1).
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** Math.min(attempts - 1, 6), MAX_BACKOFF_MS)
  return { status: 'FAILED', nextRetryAt: new Date(now + delay).toISOString() }
}

export function toSyncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'SYNCED':
      return 'Synced'
    case 'FAILED':
      return 'Retrying'
    case 'DEAD_LETTER':
      return 'Needs attention'
    default:
      return 'Pending'
  }
}
