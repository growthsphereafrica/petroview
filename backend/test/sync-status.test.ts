import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Exercises the boot-time syncStatus reconciliation directly, against its own
 * throwaway database, rather than through the server. The migration only runs
 * at start-up, so the only way to test it is to build a database that looks
 * like the one that shipped and then run the migration over it.
 */
let dir: string
let db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown; get: (id: string) => unknown }; close: () => void }
let reconcile: () => void

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masterview-syncstatus-'))
  process.env.DB_PATH = path.join(dir, 'sync.sqlite')
  process.env.SEED_DEMO_DATA = 'false'
  process.env.NODE_ENV = 'test'
  const mod = await import('../src/db')
  db = mod.db as unknown as typeof db
  mod.initSchema()
  reconcile = mod.reconcileSyncStatus
})

afterAll(() => {
  try {
    db?.close()
  } catch {
    /* best effort */
  }
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

function addShift(id: string, syncStatus: string): void {
  db.prepare(`INSERT INTO shifts (id, number, attendantId, attendantName, pumpId, pumpName, stationId, stationName,
    status, openedAt, openingReadings, closingReadings, sales, expectedTotal, payments, actualTotal, variance, syncStatus, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, id, 'att-1', 'Test Attendant', '', '', 'st-1', 'Station', 'OPEN', new Date().toISOString(),
    '[]', '[]', '[]', 0, '{}', 0, 0, syncStatus, new Date().toISOString(), new Date().toISOString(),
  )
}

function addTransaction(id: string, shiftId: string, syncStatus: string): void {
  db.prepare(`INSERT INTO transactions (id, shiftId, attendantId, fuelCode, litres, amount, unitPrice, method, recordedAt, syncStatus)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, shiftId, 'att-1', 'PMS', 10, 148, 14.8, 'CASH', new Date().toISOString(), syncStatus)
}

function addReceipt(id: string, shiftId: string, syncStatus: string): void {
  db.prepare('INSERT INTO receipts (id, shiftId, image, capturedAt, syncStatus) VALUES (?,?,?,?,?)')
    .run(id, shiftId, 'data:image/png;base64,AA==', new Date().toISOString(), syncStatus)
}

function addQueueRow(entityType: string, entityId: string, status: string): void {
  db.prepare(`INSERT INTO syncQueue (id, entityType, entityId, status, attempts, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?)`).run(`q-${entityType}-${entityId}-${Math.random().toString(36).slice(2, 8)}`, entityType, entityId, status, 1, new Date().toISOString(), new Date().toISOString())
}

function statusOf(table: string, id: string): string {
  return (db.prepare(`SELECT syncStatus FROM ${table} WHERE id = ?`).get(id) as { syncStatus: string }).syncStatus
}

describe('boot-time syncStatus reconciliation', () => {
  it('trusts the sync queue and clears stale PENDING markers', () => {
    // This is the exact production shape: rows written before the queue existed
    // kept PENDING forever while the queue recorded them as delivered, so Head
    // Office reported 0% sync compliance on a network that had fully synced.
    addShift('ss-queued', 'PENDING')
    addQueueRow('SHIFT', 'ss-queued', 'SYNCED')

    addShift('ss-failed', 'PENDING')
    addQueueRow('SHIFT', 'ss-failed', 'FAILED')

    addShift('ss-untracked', 'PENDING')

    addShift('ss-done', 'SYNCED')
    addQueueRow('SHIFT', 'ss-done', 'SYNCED')

    reconcile()

    expect(statusOf('shifts', 'ss-queued')).toBe('SYNCED')
    // The rows that matter most: a failed delivery must never be laundered into
    // "synced" by a migration, because that is how data loss hides.
    expect(statusOf('shifts', 'ss-failed')).toBe('PENDING')
    expect(statusOf('shifts', 'ss-untracked')).toBe('PENDING')
    expect(statusOf('shifts', 'ss-done')).toBe('SYNCED')
  })

  it('covers transactions and receipts, not just shifts', () => {
    addShift('ss-parent', 'SYNCED')
    addTransaction('tx-queued', 'ss-parent', 'PENDING')
    addQueueRow('TRANSACTION', 'tx-queued', 'SYNCED')
    addTransaction('tx-untracked', 'ss-parent', 'PENDING')
    addReceipt('rc-queued', 'ss-parent', 'PENDING')
    addQueueRow('RECEIPT', 'rc-queued', 'SYNCED')

    reconcile()

    expect(statusOf('transactions', 'tx-queued')).toBe('SYNCED')
    expect(statusOf('transactions', 'tx-untracked')).toBe('PENDING')
    expect(statusOf('receipts', 'rc-queued')).toBe('SYNCED')
  })

  it('is idempotent', () => {
    addShift('ss-twice', 'PENDING')
    addQueueRow('SHIFT', 'ss-twice', 'SYNCED')
    reconcile()
    reconcile()
    expect(statusOf('shifts', 'ss-twice')).toBe('SYNCED')
  })

  it('does not confuse entity types that share an id', () => {
    // Shifts and transactions live in different tables, and a queue row for one
    // must never vouch for a row in the other just because the ids collide.
    addShift('shared-id', 'PENDING')
    addTransaction('shared-id', 'shared-id', 'PENDING')
    addQueueRow('TRANSACTION', 'shared-id', 'SYNCED')

    reconcile()

    expect(statusOf('transactions', 'shared-id')).toBe('SYNCED')
    expect(statusOf('shifts', 'shared-id')).toBe('PENDING')
  })
})
