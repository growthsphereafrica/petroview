import { Router } from 'express'
import { db, deserializeShift } from '../db'
import { authenticate, requireRole, type AuthRequest } from '../middleware'
import { newToken } from '../auth'
import type { FuelCode, PaymentMethod, Shift, ShiftStatus, SyncEntityType } from '../db'

export const syncRouter = Router()

interface SyncPayload {
  deviceId?: string
  entities: Array<{
    type: SyncEntityType
    data: Record<string, unknown>
  }>
}

const upsertShift = db.prepare(`
  INSERT INTO shifts (
    id, number, attendantId, attendantName, pumpId, pumpName, stationId, stationName,
    status, openedAt, closedAt, openingReadings, closingReadings, sales,
    expectedTotal, payments, actualTotal, variance, notes, reviewerNotes, syncStatus, createdAt, updatedAt
  ) VALUES (
    @id, @number, @attendantId, @attendantName, @pumpId, @pumpName, @stationId, @stationName,
    @status, @openedAt, @closedAt, @openingReadings, @closingReadings, @sales,
    @expectedTotal, @payments, @actualTotal, @variance, @notes, @reviewerNotes, @syncStatus, @createdAt, @updatedAt
  )
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    closedAt = excluded.closedAt,
    closingReadings = excluded.closingReadings,
    sales = excluded.sales,
    expectedTotal = excluded.expectedTotal,
    payments = excluded.payments,
    actualTotal = excluded.actualTotal,
    variance = excluded.variance,
    notes = excluded.notes,
    reviewerNotes = CASE WHEN excluded.reviewerNotes IS NOT NULL THEN excluded.reviewerNotes ELSE shifts.reviewerNotes END,
    syncStatus = excluded.syncStatus,
    updatedAt = excluded.updatedAt
`)

const upsertTx = db.prepare(`
  INSERT INTO transactions (id, shiftId, attendantId, fuelCode, litres, amount, unitPrice, method, customerRef, recordedAt, syncStatus)
  VALUES (@id, @shiftId, @attendantId, @fuelCode, @litres, @amount, @unitPrice, @method, @customerRef, @recordedAt, @syncStatus)
  ON CONFLICT(id) DO UPDATE SET method = excluded.method, litres = excluded.litres, amount = excluded.amount, recordedAt = excluded.recordedAt, syncStatus = excluded.syncStatus
`)

const upsertReceipt = db.prepare(`
  INSERT INTO receipts (id, shiftId, image, capturedAt, syncStatus)
  VALUES (@id, @shiftId, @image, @capturedAt, @syncStatus)
  ON CONFLICT(id) DO UPDATE SET image = excluded.image, capturedAt = excluded.capturedAt, syncStatus = excluded.syncStatus
`)

const queue = (entityType: SyncEntityType, entityId: string, createdAt: string): void => {
  db.prepare('DELETE FROM syncQueue WHERE entityType = ? AND entityId = ?').run(entityType, entityId)
  db.prepare(
    'INSERT INTO syncQueue (id, entityType, entityId, status, attempts, nextRetryAt, lastError, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(newToken(), entityType, entityId, 'SYNCED', 1, null, null, createdAt, new Date().toISOString())
}

/**
 * POST /api/sync/entities
 * Devices push batched queued records (shifts, transactions, receipts).
 * Server upserts with last-write-wins and returns an ack per entity.
 */
syncRouter.post('/entities', authenticate, (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as Partial<SyncPayload>
  const entities = Array.isArray(body.entities) ? body.entities : []
  if (entities.length === 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'entities array is required.' })
    return
  }

  const accepted: string[] = []
  const rejected: Array<{ id: string; reason: string }> = []

  for (const entity of entities) {
    const data = entity.data ?? {}
    try {
      if (entity.type === 'SHIFT') {
        const s = data as unknown as Shift
        if (!s.id || !s.number || !s.attendantId || !s.openedAt) throw new Error('shift is missing required fields')
        const openingReadings = JSON.stringify(s.openingReadings ?? [])
        const closingReadings = JSON.stringify(s.closingReadings ?? [])
        const sales = JSON.stringify(s.sales ?? [])
        const payments = JSON.stringify(s.payments ?? { CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 })
        const status = (s.status ?? 'OPEN') as ShiftStatus
        const syncStatus = status === 'CLOSED' ? 'PENDING' : (s.syncStatus ?? 'SYNCED')
        const now = new Date().toISOString()
        upsertShift.run({
          id: s.id,
          number: s.number,
          attendantId: s.attendantId,
          attendantName: s.attendantName ?? 'Attendant',
          pumpId: s.pumpId ?? '',
          pumpName: s.pumpName ?? '',
          stationId: s.stationId ?? (req.session?.stationId ?? 'STN-GV-042'),
          stationName: s.stationName ?? 'Station',
          status,
          openedAt: s.openedAt,
          closedAt: s.closedAt ?? null,
          openingReadings,
          closingReadings,
          sales,
          expectedTotal: s.expectedTotal ?? 0,
          payments,
          actualTotal: s.actualTotal ?? 0,
          variance: s.variance ?? 0,
          notes: s.notes ?? null,
          reviewerNotes: s.reviewerNotes ?? null,
          syncStatus,
          createdAt: s.createdAt ?? now,
          updatedAt: s.updatedAt ?? now,
        })
        queue('SHIFT', s.id, s.createdAt ?? now)
        accepted.push(s.id)
      } else if (entity.type === 'TRANSACTION') {
        const t = data as Record<string, unknown>
        if (!t.id || !t.shiftId || !t.fuelCode) throw new Error('transaction is missing required fields')
        upsertTx.run({
          id: t.id,
          shiftId: t.shiftId,
          attendantId: t.attendantId ?? 'unknown',
          fuelCode: t.fuelCode as FuelCode,
          litres: Number(t.litres ?? 0),
          amount: Number(t.amount ?? 0),
          unitPrice: Number(t.unitPrice ?? 0),
          method: (t.method as PaymentMethod) ?? 'CASH',
          customerRef: (t.customerRef as string | null) ?? null,
          recordedAt: (t.recordedAt as string) ?? new Date().toISOString(),
          syncStatus: (t.syncStatus as string) ?? 'SYNCED',
        })
        queue('TRANSACTION', String(t.id), new Date().toISOString())
        accepted.push(String(t.id))
      } else if (entity.type === 'RECEIPT') {
        const r = data as Record<string, unknown>
        if (!r.id || !r.shiftId) throw new Error('receipt is missing required fields')
        upsertReceipt.run({
          id: r.id,
          shiftId: r.shiftId,
          image: String(r.image ?? ''),
          capturedAt: (r.capturedAt as string) ?? new Date().toISOString(),
          syncStatus: (r.syncStatus as string) ?? 'SYNCED',
        })
        queue('RECEIPT', String(r.id), new Date().toISOString())
        accepted.push(String(r.id))
      } else {
        rejected.push({ id: entity?.data?.id as string, reason: `unsupported entity type: ${entity.type}` })
      }
    } catch (err) {
      rejected.push({ id: (data?.id as string) ?? '?', reason: err instanceof Error ? err.message : 'validation failed' })
    }
  }

  res.json({
    success: true,
    cloudTxId: `CLD-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    accepted,
    rejected,
    serverTime: new Date().toISOString(),
  })
})

syncRouter.post('/shifts/:id/review', authenticate, requireRole('supervisor'), (req: AuthRequest, res) => {
  const { id } = req.params
  const { verdict, notes } = (req.body ?? {}) as { verdict?: 'APPROVED' | 'REJECTED'; notes?: string }
  if (verdict !== 'APPROVED' && verdict !== 'REJECTED') {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'verdict must be APPROVED or REJECTED.' })
    return
  }
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(id) as { id: string; status: string; number: string } | undefined
  if (!shift) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Shift not found.' })
    return
  }
  if (shift.status !== 'CLOSED') {
    res.status(409).json({ error: 'CONFLICT', message: 'Only CLOSED shifts can be reviewed.' })
    return
  }
  const now = new Date().toISOString()
  db.prepare('UPDATE shifts SET status = ?, reviewerNotes = ?, updatedAt = ? WHERE id = ?').run(verdict, notes ?? null, now, id)
  db.prepare('INSERT INTO audit_log (id, action, actorId, actorName, actorRole, targetId, targetDescription, notes, timestamp, meta) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    newToken(),
    verdict === 'APPROVED' ? 'REVIEW_APPROVED' : 'REJECTED',
    req.session?.userId ?? '',
    req.session?.fullName ?? '',
    'SUPERVISOR',
    id,
    `Shift ${shift.number}`,
    notes ?? null,
    now,
    null,
  )
  res.json({ id, status: verdict, reviewerNotes: notes ?? null, reviewedAt: now })
})