/**
 * App-wide live replication bus built on BroadcastChannel.
 * Every production mutation publishes a { table, key } message so the
 * other open "device" (phone terminal ↔ supervisor tablet) can refresh
 * its local view in real time — simulating forecourt network replication.
 */

import { useEffect } from 'react'

export type LiveTable = 'SHIFTS' | 'ATTENDANTS' | 'SUPERVISORS' | 'TRANSACTIONS' | 'RECEIPTS' | 'SYNC_QUEUE' | 'AUDIT_LOG'

export interface LiveChangeEvent {
  table: LiveTable
  reason: 'INSERT' | 'UPDATE' | 'DELETE' | 'CLEAR' | 'SYNC'
  key: string
  at: string
}

type LiveListener = (event: LiveChangeEvent) => void

const CHANNEL_NAME = 'mvp-live-replication'

class LiveSyncBus {
  private channel: BroadcastChannel | null = null
  private listeners = new Set<LiveListener>()

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (ev: MessageEvent<LiveChangeEvent>) => {
        for (const l of this.listeners) {
          try {
            l(ev.data)
          } catch {
            // listener errors are non-fatal
          }
        }
      }
    }
  }

  publish(event: Omit<LiveChangeEvent, 'at'>): void {
    const full: LiveChangeEvent = { ...event, at: new Date().toISOString() }
    this.channel?.postMessage(full)
    // deliver locally as well so the publishing device stays consistent
    for (const l of this.listeners) {
      try {
        l(full)
      } catch {
        // non-fatal
      }
    }
  }

  subscribe(listener: LiveListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const liveSyncBus = new LiveSyncBus()

/** Subscribes the given listener for the lifetime of the calling component. */
export function useLiveChanges(listener: LiveListener): void {
  useEffect(() => liveSyncBus.subscribe(listener), [listener])
}