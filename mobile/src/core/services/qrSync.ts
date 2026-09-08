/**
 * Air-gapped QR code sync for the universal build.
 * One device renders the pending local state as QR frames; another device
 * (even fully offline, no WiFi, no cloud) scans them and merges the data.
 * Supports multi-frame payloads for larger shift histories.
 */

import { listShifts, saveShift, listAudit, addAudit } from '../infra/repositories'
import type { AuditEntry, Shift } from '../domain/types'

export interface QrSyncPayload {
  app: 'mvp-mobile'
  kind: 'SYNC'
  version: 1
  exportedAt: string
  shifts: Shift[]
  audits: AuditEntry[]
}

/** Max characters per QR frame (keeps each barcode scannable by any phone). */
export const QR_FRAME_MAX = 1200

export interface QrFrame {
  v: 1
  i?: number // chunk index (absent when single frame)
  n?: number // total chunks
  c?: string // chunk content
  full?: string // full payload when single frame
}

export function encodePayloadToFrames(json: string): QrFrame[] {
  if (json.length <= QR_FRAME_MAX) {
    return [{ v: 1, full: json }]
  }
  const n = Math.ceil(json.length / QR_FRAME_MAX)
  const frames: QrFrame[] = []
  for (let i = 0; i < n; i++) {
    frames.push({ v: 1, i, n, c: json.slice(i * QR_FRAME_MAX, (i + 1) * QR_FRAME_MAX) })
  }
  return frames
}

export async function buildSyncPayload(): Promise<{ frames: QrFrame[] }> {
  const shifts = await listShifts()
  const audits = await listAudit()
  const payload: QrSyncPayload = {
    app: 'mvp-mobile',
    kind: 'SYNC',
    version: 1,
    exportedAt: new Date().toISOString(),
    shifts,
    audits: audits.slice(0, 120),
  }
  return { frames: encodePayloadToFrames(JSON.stringify(payload)) }
}

export function frameToText(f: QrFrame): string {
  return JSON.stringify(f)
}

/**
 * Merge an incoming (decoded) payload into the local store.
 * Conflict resolution: latest last-modified wins per shift; audit events are
 * deduped by id and merged newest-first.
 */
export async function mergePayloadJson(json: string): Promise<{ shiftsAdded: number; auditsAdded: number }> {
  const parsed = JSON.parse(json) as QrSyncPayload
  if (parsed.app !== 'mvp-mobile' || parsed.kind !== 'SYNC') {
    throw new Error('Not a Master View sync code.')
  }

  const shifts = await listShifts()
  const existingById = new Map(shifts.map(s => [s.id, s]))
  let shiftsAdded = 0
  for (const incoming of parsed.shifts ?? []) {
    const local = existingById.get(incoming.id)
    if (!local || new Date(incoming.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
      existingById.set(incoming.id, incoming)
      shiftsAdded += 1
    }
  }
  if (shiftsAdded > 0) {
    await saveMany([...existingById.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
  }

  const existingAudits = await listAudit()
  const auditIds = new Set(existingAudits.map(a => a.id))
  let auditsAdded = 0
  for (const entry of parsed.audits ?? []) {
    if (!auditIds.has(entry.id)) {
      auditIds.add(entry.id)
      await addAudit(entry)
      auditsAdded += 1
    }
  }

  return { shiftsAdded, auditsAdded }
}

async function saveMany(shifts: Shift[]): Promise<void> {
  for (const s of shifts) {
    await saveShift(s)
  }
}

export type ScanOutcome = { state: 'waiting' } | { state: 'need-more'; total: number; received: number } | { state: 'merging' } | { state: 'done'; shifts: number; audits: number } | { state: 'error'; message: string }

export class FrameCollector {
  private chunks = new Map<number, string>()
  private total = 0

  async feed(raw: string): Promise<ScanOutcome> {
    let frame: QrFrame
    try {
      frame = JSON.parse(raw)
    } catch {
      return { state: 'error', message: 'Unreadable QR code.' }
    }
    if (frame.v !== 1) return { state: 'error', message: 'Unsupported sync code.' }

    // Single-frame payload
    if (frame.full) {
      this.chunks.clear()
      this.total = 0
      return this.complete(frame.full)
    }

    if (frame.i == null || frame.n == null || frame.c == null) {
      return { state: 'error', message: 'Malformed sync frame.' }
    }
    this.total = frame.n
    this.chunks.set(frame.i, frame.c)
    if (this.chunks.size >= this.total) {
      const ordered = Array.from({ length: this.total }, (_, i) => this.chunks.get(i) ?? '')
      if (ordered.some(c => c === '')) return { state: 'error', message: 'Missing frames — rescan.' }
      return this.complete(ordered.join(''))
    }
    return { state: 'need-more', total: this.total, received: this.chunks.size }
  }

  reset(): void {
    this.chunks.clear()
    this.total = 0
  }

  private async complete(full: string) {
    try {
      const result = await mergePayloadJson(full)
      this.reset()
      return { state: 'done', shifts: result.shiftsAdded, audits: result.auditsAdded } as const
    } catch (e) {
      this.reset()
      return { state: 'error', message: e instanceof Error ? e.message : 'Sync failed.' } as const
    }
  }
}