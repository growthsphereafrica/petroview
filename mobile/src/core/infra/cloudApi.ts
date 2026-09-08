/**
 * Cloud sync client for the universal app.
 * Reads the backend base URL from EXPO_PUBLIC_API_URL (inlined at build time).
 * When the URL is unset the app runs fully offline (QR-only sync, as before).
 */

import { keys, sGet, sSet } from '../store/storage'
import type { Shift } from '../domain/types'

export function getCloudApiBase(): string | null {
  const configured = (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.trim()
  return configured && configured.length > 4 ? configured.replace(/\/+$/, '') : null
}

export function isCloudConfigured(): boolean {
  return getCloudApiBase() !== null
}

// ---- Token storage --------------------------------------------------------

export async function getCloudToken(): Promise<string | null> {
  const token = await sGet<string>(keys.cloudToken)
  return token && token.length > 0 ? token : null
}

export async function setCloudToken(token: string | null): Promise<void> {
  await sSet(keys.cloudToken, token)
}

// ---- Login ----------------------------------------------------------------

export interface CloudSession {
  token: string
  role: 'attendant' | 'supervisor'
  fullName: string
  employeeCode: string
  stationId: string | null
  expiresAt: string
}

/**
 * Exchanges employeeCode + PIN for a backend session token.
 * Returns null when the backend is unreachable or credentials are rejected.
 */
export async function cloudLogin(employeeCode: string, pin: string): Promise<CloudSession | null> {
  const base = getCloudApiBase()
  if (!base) return null

  let resp: Response
  try {
    resp = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode, pin }),
    })
  } catch {
    return null
  }

  const json = (await resp.json().catch(() => ({}))) as Partial<CloudSession> & { error?: string }
  if (!resp.ok || !json.token) return null

  await setCloudToken(json.token)
  return json as CloudSession
}

// ---- Sync -----------------------------------------------------------------

/**
 * Maps the local mobile Shift into the backend's expected wire shape
 * (backend reads array-format readings and expectedTotal).
 */
function toBackendShift(shift: Shift) {
  return {
    id: shift.id,
    number: shift.number,
    attendantId: shift.attendantId,
    attendantName: shift.attendantName,
    pumpId: shift.pumpId,
    stationId: shift.stationId,
    stationName: shift.stationName,
    status: shift.status,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openingReadings: Object.values(shift.openingReadings ?? {}),
    closingReadings: shift.closingReadings ? Object.values(shift.closingReadings) : [],
    sales: shift.sales,
    expectedTotal: shift.salesTotal,
    payments: shift.payments,
    actualTotal: shift.actualTotal,
    variance: shift.variance,
    notes: shift.reviewNotes,
    syncStatus: shift.syncStatus,
    createdAt: shift.openedAt,
    updatedAt: shift.updatedAt,
  }
}

export interface SyncUploadResult {
  cloudTxId: string
  timestamp: string
  accepted: string[]
  rejected: Array<{ id: string; reason: string }>
}

/**
 * Posts queued shifts to the backend. Throws on network/HTTP failure so the
 * caller can mark items PENDING/FAILED and retry later.
 */
export async function uploadShiftsToCloud(shifts: Shift[]): Promise<SyncUploadResult> {
  const base = getCloudApiBase()
  if (!base) throw new Error('CLOUD_UNCONFIGURED')

  const token = await getCloudToken()
  if (!token) throw new Error('CLOUD_UNAUTHENTICATED')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  headers.Authorization = `Bearer ${token}`

  let resp: Response
  try {
    resp = await fetch(`${base}/api/sync/entities`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: `petroview-mobile-${shifts[0]?.stationId ?? 'unknown'}`,
        entities: shifts.map(s => ({ type: 'SHIFT', data: toBackendShift(s) })),
      }),
    })
  } catch {
    throw new Error('NETWORK_UNAVAILABLE')
  }

  const json = (await resp.json().catch(() => ({}))) as Partial<SyncUploadResult> & { error?: string; message?: string }
  if (!resp.ok) {
    const code = resp.status === 401 ? 'UNAUTHORIZED' : (json.error ?? json.message ?? `HTTP ${resp.status}`)
    const err = new Error(code)
    ;(err as { status?: number }).status = resp.status
    throw err
  }

  return {
    cloudTxId: json.cloudTxId ?? `CLD-${Date.now().toString(36).toUpperCase()}`,
    timestamp: json.timestamp ?? new Date().toISOString(),
    accepted: json.accepted ?? [],
    rejected: json.rejected ?? [],
  }
}