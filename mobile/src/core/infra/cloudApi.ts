/**
 * Cloud sync client for the universal app.
 * Reads the backend base URL from EXPO_PUBLIC_API_URL (inlined at build time).
 * Both web and mobile use this same backend — single source of truth.
 */

import { keys, sGet, sSet } from '../store/storage'
import type { Shift } from '../domain/types'
import { PRODUCTION_PUMPS } from '../domain/config'

function pumpNameFor(id: string | null | undefined): string {
  return PRODUCTION_PUMPS.find(p => p.id === id)?.name ?? ''
}

export function getCloudApiBase(): string {
  const configured = (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.trim()
  if (configured && configured.length > 4) {
    return configured.replace(/\/+$/, '')
  }
  return 'https://petroviewapi.growthspheregh.com'
}

export function isCloudConfigured(): boolean {
  return true
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
  role: 'attendant' | 'supervisor' | 'headoffice' | 'superadmin'
  fullName: string
  employeeCode: string
  stationId: string | null
  stationName?: string
  companyId: string | null
  companyShortCode: string | null
  isSuperAdmin: boolean
  isHeadOffice: boolean
  expiresAt: string
}

export type CloudLoginResult =
  | { ok: true; session: CloudSession }
  | { ok: false; message: string; isNetworkError: boolean }

/**
 * Exchanges employeeCode + PIN for a backend session token.
 * Returns structured result preserving actual server error message.
 */
export async function cloudLogin(employeeCode: string, pin: string): Promise<CloudLoginResult> {
  const base = getCloudApiBase()
  if (!base) {
    return { ok: false, message: 'Server URL is not configured.', isNetworkError: true }
  }

  let resp: Response
  try {
    resp = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode, pin }),
    })
  } catch {
    return {
      ok: false,
      message: 'Unable to reach the server. Please check your internet connection.',
      isNetworkError: true,
    }
  }

  const json = (await resp.json().catch(() => ({}))) as Partial<CloudSession> & { error?: string; message?: string }
  if (!resp.ok || !json.token) {
    const msg = json.message || json.error || `Authentication failed (HTTP ${resp.status})`
    return { ok: false, message: msg, isNetworkError: false }
  }

  await setCloudToken(json.token)
  return { ok: true, session: json as CloudSession }
}

// ---- Register -------------------------------------------------------------

export interface CloudRegisterResult {
  id: string
  employeeCode: string
  fullName: string
  role: 'attendant' | 'supervisor'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
}

export async function cloudRegister(input: {
  employeeCode: string
  fullName: string
  pin: string
  phone?: string
  stationId?: string
  companyId?: string
  companyShortCode?: string
}): Promise<CloudRegisterResult> {
  const base = getCloudApiBase()
  if (!base) throw new Error('BACKEND_UNREACHABLE')

  let resp: Response
  try {
    resp = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('BACKEND_UNREACHABLE')
  }

  const json = await resp.json().catch(() => ({})) as CloudRegisterResult & { error?: string; message?: string }
  if (!resp.ok) throw new Error(json.message ?? json.error ?? `HTTP ${resp.status}`)
  return json
}

// ---- Sync -----------------------------------------------------------------

function toBackendShift(shift: Shift) {
  return {
    id: shift.id,
    number: shift.number,
    attendantId: shift.attendantId,
    attendantName: shift.attendantName,
    pumpId: shift.pumpId,
    pumpName: pumpNameFor(shift.pumpId),
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

// ---- Tank readings --------------------------------------------------------

export interface TankReadingEntry {
  tankId: string
  fuelCode: string
  openingLevel: number
  closingLevel: number
  dipStock: number
  received: number
  notes?: string
}

export interface TankReadingRow {
  id: string
  stationId: string
  companyId: string | null
  recordedBy: string
  recordedByName: string
  readings: TankReadingEntry[]
  recordedAt: string
  notes: string | null
  createdAt: string
}

export interface TankReadingsResult {
  count: number
  readings: TankReadingRow[]
}

function authHeaders(): Promise<Record<string, string>> {
  return getCloudToken().then(token => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  })
}

export async function cloudGetTankReadings(stationId?: string | null, days?: number): Promise<TankReadingsResult> {
  const base = getCloudApiBase()
  if (!base) return { count: 0, readings: [] }

  const params = new URLSearchParams()
  if (stationId) params.set('station', stationId)
  if (days) params.set('days', String(days))
  const qs = params.toString()

  let resp: Response
  try {
    resp = await fetch(`${base}/api/tank-readings${qs ? '?' + qs : ''}`, { headers: await authHeaders() })
  } catch {
    throw new Error('Unable to reach the server. Check your connection and try again.')
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return (await resp.json().catch(() => ({ count: 0, readings: [] }))) as TankReadingsResult
}

export async function cloudRecordTankReadings(input: {
  stationId: string
  readings: TankReadingEntry[]
  notes?: string
}): Promise<{ id: string; readingsCount: number }> {
  const base = getCloudApiBase()
  if (!base) throw new Error('Unable to reach the server. Check your connection and try again.')

  let resp: Response
  try {
    resp = await fetch(`${base}/api/tank-readings`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Unable to reach the server. Check your connection and try again.')
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return (await resp.json().catch(() => ({ id: '', readingsCount: 0 }))) as { id: string; readingsCount: number }
}
