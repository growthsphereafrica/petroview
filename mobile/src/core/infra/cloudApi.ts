/**
 * Cloud sync client for the universal app.
 * Reads the backend base URL from EXPO_PUBLIC_API_URL (inlined at build time).
 * Both web and mobile use this same backend — single source of truth.
 */

import { keys, sDel, sGet, sSet } from '../store/storage'
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

const REQUEST_TIMEOUT_MS = 10_000

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function readJson(resp: Response): Promise<Record<string, unknown>> {
  return (await resp.json().catch(() => ({}))) as Record<string, unknown>
}

// ---- Token storage --------------------------------------------------------

export async function getCloudToken(): Promise<string | null> {
  const token = await sGet<string>(keys.cloudToken)
  return token && token.length > 0 ? token : null
}

export async function setCloudToken(token: string | null): Promise<void> {
  if (token) await sSet(keys.cloudToken, token)
  else await sDel(keys.cloudToken)
}

// ---- Login ----------------------------------------------------------------

export interface CloudAccount {
  userId: string
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

export interface CloudSession extends CloudAccount {
  token: string
}

export type CloudLoginResult =
  | { ok: true; session: CloudSession }
  | { ok: false; message: string; isNetworkError: boolean }

const ROLES = new Set<CloudAccount['role']>(['attendant', 'supervisor', 'headoffice', 'superadmin'])

function isCloudAccount(value: unknown): value is CloudAccount {
  if (!value || typeof value !== 'object') return false
  const account = value as Record<string, unknown>
  return typeof account.userId === 'string' && account.userId.length > 0
    && typeof account.role === 'string' && ROLES.has(account.role as CloudAccount['role'])
    && typeof account.fullName === 'string' && account.fullName.trim().length > 0
    && typeof account.employeeCode === 'string' && account.employeeCode.trim().length > 0
    && (account.stationId === null || typeof account.stationId === 'string')
    && (account.companyId === null || typeof account.companyId === 'string')
    && (account.companyShortCode === null || typeof account.companyShortCode === 'string')
    && typeof account.isSuperAdmin === 'boolean'
    && typeof account.isHeadOffice === 'boolean'
    && typeof account.expiresAt === 'string'
    && Number.isFinite(Date.parse(account.expiresAt))
}

function isCloudSession(value: unknown): value is CloudSession {
  if (!value || typeof value !== 'object') return false
  const token = (value as Record<string, unknown>).token
  return typeof token === 'string' && token.length > 0 && isCloudAccount(value)
}

function errorMessage(json: Record<string, unknown>, status: number): string {
  const message = json.message ?? json.error
  return typeof message === 'string' && message ? message : `Authentication failed (HTTP ${status})`
}

export async function cloudLogin(employeeCode: string, pin: string): Promise<CloudLoginResult> {
  const base = getCloudApiBase()
  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/auth/login`, {
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

  const json = await readJson(resp)
  if (!resp.ok) return { ok: false, message: errorMessage(json, resp.status), isNetworkError: false }
  if (!isCloudSession(json)) return { ok: false, message: 'The server returned an invalid session.', isNetworkError: false }
  if (Date.parse(json.expiresAt) <= Date.now()) return { ok: false, message: 'The returned session has expired.', isNetworkError: false }

  await setCloudToken(json.token)
  return { ok: true, session: json }
}

export type CloudMeLookup =
  | { ok: true; account: CloudAccount }
  | { ok: false; message: string; status: number; isNetworkError: boolean }

export async function cloudGetMe(): Promise<CloudMeLookup> {
  const token = await getCloudToken()
  if (!token) return { ok: false, message: 'Authentication required.', status: 401, isNetworkError: false }

  const base = getCloudApiBase()
  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return { ok: false, message: 'Unable to reach the server. Please check your internet connection.', status: 0, isNetworkError: true }
  }

  const json = await readJson(resp)
  if (!resp.ok) return { ok: false, message: errorMessage(json, resp.status), status: resp.status, isNetworkError: false }
  if (!isCloudAccount(json)) return { ok: false, message: 'The server returned an invalid account.', status: resp.status, isNetworkError: false }
  return { ok: true, account: json }
}

export async function cloudLogout(): Promise<void> {
  const token = await getCloudToken()
  if (!token) return
  try {
    await fetchWithTimeout(`${getCloudApiBase()}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
  } finally {
    await setCloudToken(null)
  }
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
  pumpId?: string
}): Promise<CloudRegisterResult> {
  const base = getCloudApiBase()

  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('BACKEND_UNREACHABLE')
  }

  const json = await readJson(resp)
  if (!resp.ok) throw new Error(typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${resp.status}`)
  const result = json as unknown as CloudRegisterResult
  return result
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
  if (shifts.length === 0) throw new Error('NO_ENTITIES')
  const base = getCloudApiBase()
  if (!base) throw new Error('CLOUD_UNCONFIGURED')

  const token = await getCloudToken()
  if (!token) throw new Error('CLOUD_UNAUTHENTICATED')
  const account = await sGet<CloudSession>(keys.activeSession)
  if (!account || account.token !== token) throw new Error('CLOUD_SESSION_MISSING')

  const entities = shifts.map(s => ({ type: 'SHIFT', data: toBackendShift(s) }))
  const entityKey = entities.map(entity => `${entity.type}:${String(entity.data.id)}`).join('|')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-employee-code': account.employeeCode,
    'X-Idempotency-Key': `${account.employeeCode}:${entityKey}`,
  }

  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/sync/entities`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: `petroview-mobile-${account.userId}`,
        entities,
      }),
    })
  } catch {
    throw new Error('NETWORK_UNAVAILABLE')
  }

  const json = await readJson(resp)
  if (!resp.ok) {
    const code = resp.status === 401 ? 'UNAUTHORIZED' : (json.error ?? json.message ?? `HTTP ${resp.status}`)
    const err = new Error(String(code))
    ;(err as { status?: number }).status = resp.status
    throw err
  }
  if (typeof json.cloudTxId !== 'string' || typeof json.timestamp !== 'string' || !Array.isArray(json.accepted) || !Array.isArray(json.rejected)) {
    throw new Error('INVALID_SYNC_RESPONSE')
  }
  return json as unknown as SyncUploadResult
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

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getCloudToken()
  if (!token) throw new Error('CLOUD_UNAUTHENTICATED')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
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
    resp = await fetchWithTimeout(`${base}/api/tank-readings${qs ? '?' + qs : ''}`, { headers: await authHeaders() })
  } catch {
    throw new Error('Unable to reach the server. Check your connection and try again.')
  }
  if (!resp.ok) {
    const json = await readJson(resp)
    throw new Error(typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${resp.status}`)
  }
  const json = await readJson(resp)
  if (!Array.isArray(json.readings) || typeof json.count !== 'number') throw new Error('INVALID_TANK_RESPONSE')
  return json as unknown as TankReadingsResult
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
    resp = await fetchWithTimeout(`${base}/api/tank-readings`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Unable to reach the server. Check your connection and try again.')
  }
  if (!resp.ok) {
    const json = await readJson(resp)
    throw new Error(typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${resp.status}`)
  }
  const json = await readJson(resp)
  if (typeof json.id !== 'string' || typeof json.readingsCount !== 'number') throw new Error('INVALID_TANK_RESPONSE')
  return json as unknown as { id: string; readingsCount: number }
}

export async function cloudResetPin(employeeCode: string, newPin: string): Promise<void> {
  const base = getCloudApiBase()
  const headers = await authHeaders()
  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/auth/reset-pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ employeeCode, newPin }),
    })
  } catch {
    throw new Error('BACKEND_UNREACHABLE')
  }
  if (!resp.ok) {
    const json = await readJson(resp)
    throw new Error(typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${resp.status}`)
  }
}

export async function cloudListAttendants(stationId?: string | null): Promise<Array<{
  id: string
  employeeCode: string
  fullName: string
  pumpId: string | null
  stationId: string
  companyId?: string
  companyShortCode?: string
  phone?: string
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  active: boolean
  createdAt: string
}>> {
  const base = getCloudApiBase()
  const headers = await authHeaders()
  const qs = stationId ? `?station=${encodeURIComponent(stationId)}` : ''
  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/attendants${qs}`, { headers })
  } catch {
    throw new Error('Unable to reach the server. Check your connection.')
  }
  const json = await readJson(resp)
  if (!resp.ok) {
    throw new Error(typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${resp.status}`)
  }
  if (!Array.isArray(json.attendants)) return []
  return json.attendants as any[]
}

export async function cloudCreateAttendant(input: {
  employeeCode: string
  fullName: string
  pin: string
  stationId?: string
  pumpId?: string
  phone?: string
}): Promise<{ id: string; employeeCode: string; fullName: string; stationId: string; approvalStatus: string }> {
  const base = getCloudApiBase()
  const headers = await authHeaders()
  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/attendants`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Unable to reach the server. Check your connection.')
  }
  const json = await readJson(resp)
  if (!resp.ok) {
    throw new Error(typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${resp.status}`)
  }
  return json as any
}

export async function cloudDeactivateAttendant(id: string): Promise<void> {
  const base = getCloudApiBase()
  const headers = await authHeaders()
  let resp: Response
  try {
    resp = await fetchWithTimeout(`${base}/api/attendants/${encodeURIComponent(id)}/deactivate`, {
      method: 'POST',
      headers,
    })
  } catch {
    throw new Error('Unable to reach the server. Check your connection.')
  }
  if (!resp.ok) {
    const json = await readJson(resp)
    throw new Error(typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${resp.status}`)
  }
}

