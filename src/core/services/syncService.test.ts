import { describe, expect, it } from 'vitest'

import { MAX_SYNC_ATTEMPTS, nextRetryDecision, toSyncStatusLabel } from './syncPolicy'
import type { SyncStatus } from '../domain/types'

describe('nextRetryDecision', () => {
  const NOW = 1_700_000_000_000

  it('retries with exponential backoff below the ceiling', () => {
    const d1 = nextRetryDecision(1, NOW)
    expect(d1.status).toBe('FAILED')
    expect(new Date(d1.nextRetryAt!).getTime() - NOW).toBe(1_000)

    const d2 = nextRetryDecision(2, NOW)
    expect(new Date(d2.nextRetryAt!).getTime() - NOW).toBe(2_000)

    const d3 = nextRetryDecision(3, NOW)
    expect(new Date(d3.nextRetryAt!).getTime() - NOW).toBe(4_000)
  })

  it('caps the backoff at 60 seconds', () => {
    const d = nextRetryDecision(MAX_SYNC_ATTEMPTS - 1, NOW)
    expect(d.status).toBe('FAILED')
    expect(new Date(d.nextRetryAt!).getTime() - NOW).toBe(60_000)
  })

  it('dead-letters exactly at the ceiling', () => {
    const d = nextRetryDecision(MAX_SYNC_ATTEMPTS, NOW)
    expect(d.status).toBe('DEAD_LETTER')
    // Terminal: no scheduled retry.
    expect(d.nextRetryAt).toBeNull()
  })

  it('stays dead-lettered above the ceiling', () => {
    expect(nextRetryDecision(MAX_SYNC_ATTEMPTS + 5, NOW).status).toBe('DEAD_LETTER')
  })

  it('never schedules a retry before now', () => {
    for (let attempts = 1; attempts < MAX_SYNC_ATTEMPTS; attempts++) {
      const d = nextRetryDecision(attempts, NOW)
      expect(new Date(d.nextRetryAt!).getTime()).toBeGreaterThan(NOW)
    }
  })

  it('is the reason the pending count can drain', () => {
    // A permanently-rejected record used to be retried every 12s forever and
    // counted as pending indefinitely, so the badge could never reach zero.
    const terminal = nextRetryDecision(MAX_SYNC_ATTEMPTS, NOW)
    expect(terminal.status).not.toBe('FAILED')
    expect(terminal.status).not.toBe('PENDING')
  })
})

describe('toSyncStatusLabel', () => {
  it('distinguishes transient failure from a record needing a human', () => {
    const labels: Record<SyncStatus, string> = {
      PENDING: 'Pending',
      SYNCED: 'Synced',
      FAILED: 'Retrying',
      DEAD_LETTER: 'Needs attention',
    }
    for (const [status, label] of Object.entries(labels) as Array<[SyncStatus, string]>) {
      expect(toSyncStatusLabel(status)).toBe(label)
    }
  })

  it('does not label a dead-lettered record as merely failed', () => {
    expect(toSyncStatusLabel('DEAD_LETTER')).not.toBe('Failed')
  })
})
