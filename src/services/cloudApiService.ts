import type { ShiftRecord } from '../db/database'
import { prodDb } from '../core/infra/db'
import type { SyncEntityType } from '../core/domain/types'
import { getBackendUrl } from './backendApiService'

export function shiftRecordToBackend(shift: ShiftRecord): Record<string, unknown> {
  const openingReadings = [
    { fuelCode: 'PMS', value: shift.openingMeters?.PMS ?? 0 },
    { fuelCode: 'AGO', value: shift.openingMeters?.AGO ?? 0 },
    { fuelCode: 'DPK', value: shift.openingMeters?.DPK ?? 0 },
    { fuelCode: 'KERO', value: shift.openingMeters?.KERO ?? 0 },
  ].filter(r => r.value > 0 || ((shift.fuelSales as unknown as Record<string, { litres?: number }>)?.[r.fuelCode]?.litres ?? 0) > 0)

  const closingReadings = [
    { fuelCode: 'PMS', value: shift.closingMeters?.PMS ?? 0 },
    { fuelCode: 'AGO', value: shift.closingMeters?.AGO ?? 0 },
    { fuelCode: 'DPK', value: shift.closingMeters?.DPK ?? 0 },
    { fuelCode: 'KERO', value: shift.closingMeters?.KERO ?? 0 },
  ].filter(r => r.value > 0 || ((shift.fuelSales as unknown as Record<string, { litres?: number }>)?.[r.fuelCode]?.litres ?? 0) > 0)

  const sales = (['PMS', 'AGO', 'DPK', 'KERO'] as const).map(code => {
    const sale = shift.fuelSales?.[code]
    return {
      fuelCode: code,
      litres: sale?.litres ?? 0,
      unitPrice: sale?.price ?? 0,
      amount: sale?.amount ?? 0,
    }
  }).filter(s => s.litres > 0 || s.amount > 0)

  const payments = {
    CASH: shift.breakdown?.cash ?? 0,
    MOMO: shift.breakdown?.momo ?? 0,
    VOUCHER: shift.breakdown?.voucher ?? 0,
    CREDIT: shift.breakdown?.credit ?? 0,
  }

  const isClosed = shift.status === 'completed' || shift.status === 'reviewed' || shift.status === 'approved' || shift.status === 'rejected'

  return {
    id: shift.id,
    number: shift.shiftNumber || shift.id,
    stationId: shift.stationId,
    attendantId: shift.attendantId,
    pumpId: shift.pumpId || undefined,
    status: isClosed ? 'CLOSED' : 'OPEN',
    openedAt: shift.startTime,
    closedAt: isClosed ? (shift.endTime || new Date().toISOString()) : null,
    openingReadings: openingReadings.length > 0 ? openingReadings : [{ fuelCode: 'PMS', value: shift.openingMeters?.PMS ?? 0 }],
    closingReadings: isClosed ? (closingReadings.length > 0 ? closingReadings : openingReadings) : [],
    sales,
    payments,
    expectedTotal: shift.expectedTotal,
    actualTotal: shift.actualTotal,
    variance: shift.actualTotal - shift.expectedTotal,
  }
}

export async function uploadShiftToCloud(shift: ShiftRecord): Promise<{ success: boolean; cloudTxId: string; timestamp: string }> {
  const result = await postEntityBatch([{ type: 'SHIFT', data: shiftRecordToBackend(shift) }])
  if (!result.accepted.includes(shift.id)) {
    const reason = result.rejected.find(item => item.id === shift.id)?.reason
    throw new Error(reason || `Shift upload rejected: ${shift.id}`)
  }
  return { success: true, cloudTxId: result.cloudTxId, timestamp: result.timestamp }
}

export function getApiBase(): string {
  return getBackendUrl()
}

export function getStoredToken(): string | null {
  try {
    const cloudToken = localStorage.getItem('petroview_cloud_token')
    if (cloudToken) return cloudToken
    const session = localStorage.getItem('mvp_active_session')
    if (!session) return null
    const parsed = JSON.parse(session) as { token?: unknown }
    return typeof parsed.token === 'string' ? parsed.token : null
  } catch {
    return null
  }
}

/**
 * Uploads a single queued entity (SHIFT / TRANSACTION / RECEIPT / EXPENSE / TANK_READING) to the
 * backend. Throws on network or validation failure so the durable retry
 * queue can back off and try again later.
 */
export async function uploadEntityToCloud(entityType: SyncEntityType, entityId: string): Promise<{ cloudTxId: string; timestamp: string; accepted: string[]; rejected: Array<{ id: string; reason: string }> }> {
  const base = getApiBase()
  const token = getStoredToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  if (entityType === 'EXPENSE') {
    const expense = await prodDb.expenses.get(entityId)
    if (!expense) throw new Error(`Expense ${entityId} not found in local store`)
    const resp = await fetch(`${base}/api/expenses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        companyId: expense.companyId,
        companyShortCode: expense.companyShortCode,
        stationId: expense.stationId,
        stationName: expense.stationName,
        category: expense.category,
        amount: expense.amount,
        paymentSource: expense.paymentSource,
        payee: expense.payee,
        referenceNumber: expense.referenceNumber,
        notes: expense.notes,
        date: expense.date,
        recordedBy: expense.recordedBy,
      }),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.message || `Expense upload failed: HTTP ${resp.status}`)
    }
    return { cloudTxId: `EXP-${entityId}`, timestamp: new Date().toISOString(), accepted: [entityId], rejected: [] }
  }

  const data = await loadEntityRecord(entityType, entityId)
  if (!data) throw new Error(`Entity ${entityType}:${entityId} not found in local store`)

  const result = await postEntityBatch([{ type: entityType, data }])
  if (!result.accepted.includes(entityId)) {
    const reason = result.rejected.find(item => item.id === entityId)?.reason
    throw new Error(reason || `Entity upload rejected: ${entityType}:${entityId}`)
  }
  return { cloudTxId: result.cloudTxId, timestamp: result.timestamp, accepted: result.accepted, rejected: result.rejected }
}

async function loadEntityRecord(entityType: SyncEntityType, entityId: string): Promise<Record<string, unknown> | null> {
  if (entityType === 'SHIFT') return ((await prodDb.shifts.get(entityId)) as unknown as Record<string, unknown> | null) ?? null
  if (entityType === 'TRANSACTION') return ((await prodDb.transactions.get(entityId)) as unknown as Record<string, unknown> | null) ?? null
  if (entityType === 'RECEIPT') return ((await prodDb.receipts.get(entityId)) as unknown as Record<string, unknown> | null) ?? null
  if (entityType === 'TANK_READING') return ((await prodDb.tankReadings.get(entityId)) as unknown as Record<string, unknown> | null) ?? null
  return null
}

interface EntityBatchResult {
  cloudTxId: string
  timestamp: string
  accepted: string[]
  rejected: Array<{ id: string; reason: string }>
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`
}

/**
 * cyrb53 — a fast non-cryptographic 53-bit hash. Used only to make the
 * idempotency key content-sensitive. Without it the key identifies a record but
 * not its contents, so the server's 24h response cache returns "already
 * accepted" for an edited sale and the correction is silently discarded.
 */
function contentHash(input: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

async function postEntityBatch(entities: Array<{ type: SyncEntityType; data: Record<string, unknown> }>): Promise<EntityBatchResult> {
  const base = getApiBase()
  const token = getStoredToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const s = localStorage.getItem('mvp_active_session')
    const parsed = s ? JSON.parse(s) : null
    if (parsed?.employeeCode) headers['x-employee-code'] = parsed.employeeCode
    if (parsed?.token) {
      // The content hash is what makes a corrected record reach the server
      // instead of being swallowed by the idempotency cache.
      const entityKey = entities
        .map(entity => `${entity.type}:${String(entity.data.id ?? '')}:${contentHash(canonicalize(entity.data))}`)
        .join('|')
      headers['X-Idempotency-Key'] = `${parsed.employeeCode}:${entityKey}`
    }
  } catch { /* best effort */ }

  let resp: Response
  try {
    resp = await fetch(`${base}/api/sync/entities`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: typeof navigator !== 'undefined' ? navigator.userAgent : 'device', entities }),
    })
  } catch {
    throw new Error('NETWORK_UNAVAILABLE')
  }

  const json = (await resp.json().catch(() => ({}))) as {
    cloudTxId?: string
    timestamp?: string
    accepted?: unknown
    rejected?: unknown
    error?: string
    message?: string
  }
  if (!resp.ok) {
    throw new Error(json.error ?? json.message ?? `HTTP ${resp.status}`)
  }
  return {
    cloudTxId: json.cloudTxId ?? `CLD-${Date.now().toString(36).toUpperCase()}`,
    timestamp: json.timestamp ?? new Date().toISOString(),
    accepted: Array.isArray(json.accepted) ? json.accepted.filter((id): id is string => typeof id === 'string') : [],
    rejected: Array.isArray(json.rejected)
      ? json.rejected.filter((item): item is { id: string; reason: string } => {
        if (!item || typeof item !== 'object') return false
        const value = item as { id?: unknown; reason?: unknown }
        return typeof value.id === 'string' && typeof value.reason === 'string'
      })
      : [],
  }
}
