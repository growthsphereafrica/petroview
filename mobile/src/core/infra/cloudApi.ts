/**
 * Cloud sync client for the universal app.
 * Reads the backend base URL from EXPO_PUBLIC_API_URL (inlined at build time).
 * Both web and mobile use this same backend — single source of truth.
 */

import { keys, sDel, sGet, sSet } from '../store/storage'
import type { Shift } from '../domain/types'
import { PRODUCTION_PUMPS, getStationPumps } from '../domain/config'

export function pumpNameFor(id: string | null | undefined): string {
  if (!id) return ''
  const dynamic = getStationPumps().find(p => p.id === id || p.name.toLowerCase() === id.toLowerCase())
  if (dynamic) return dynamic.name
  return PRODUCTION_PUMPS.find(p => p.id === id)?.name ?? (id.startsWith('pump-') ? `Pump ${id.replace('pump-', '')}` : id)
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
  companyName?: string
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
    && (account.stationName === undefined || account.stationName === null || typeof account.stationName === 'string')
    && (account.companyId === null || typeof account.companyId === 'string')
    && (account.companyName === undefined || account.companyName === null || typeof account.companyName === 'string')
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
    pumpName: shift.pumpName || pumpNameFor(shift.pumpId),
    assignedNozzles: shift.assignedNozzles || (shift.openingReadings ? Object.values(shift.openingReadings).map((r: any, idx) => r.nozzleLabel || `Nozzle ${r.nozzleIndex ?? (idx + 1)} (${r.fuelCode})`) : []),
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

export async function cloudResubmitShift(shiftId: string, payload: Record<string, unknown>): Promise<{ ok: boolean; shift?: any; message?: string }> {
  const base = getCloudApiBase()
  const token = await getCloudToken()
  if (!token) return { ok: false, message: 'Unauthenticated' }
  try {
    const resp = await fetchWithTimeout(`${base}/api/shifts/${encodeURIComponent(shiftId)}/resubmit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const json = await readJson(resp)
    if (!resp.ok) {
      return { ok: false, message: errorMessage(json, resp.status) }
    }
    return { ok: true, shift: json.shift }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' }
  }
}

export async function cloudReviewShift(
  shiftId: string,
  status: 'APPROVED' | 'REJECTED',
  reviewerNotes?: string,
): Promise<{ ok: boolean; shift?: any; message?: string }> {
  const base = getCloudApiBase()
  const token = await getCloudToken()
  if (!token) return { ok: false, message: 'Unauthenticated' }
  try {
    const resp = await fetchWithTimeout(`${base}/api/shifts/${encodeURIComponent(shiftId)}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status, reviewerNotes }),
    })
    const json = await readJson(resp)
    if (!resp.ok) return { ok: false, message: errorMessage(json, resp.status) }
    return { ok: true, shift: json.shift }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' }
  }
}

export function fromBackendShift(raw: any): Shift {
  const mapReadings = (readings: any): Record<string, any> => {
    if (!readings) return {}
    if (typeof readings === 'object' && !Array.isArray(readings)) {
      return readings
    }
    const result: Record<string, any> = {}
    if (Array.isArray(readings)) {
      readings.forEach((r, idx) => {
        const key = r.key || (r.nozzleIndex != null ? `${r.fuelCode}_${r.nozzleIndex}` : r.fuelCode || `nozzle_${idx}`)
        result[key] = {
          fuelCode: r.fuelCode,
          value: Number(r.value || 0),
          nozzleIndex: r.nozzleIndex,
          nozzleLabel: r.nozzleLabel,
        }
      })
    }
    return result
  }

  const openingReadings = mapReadings(raw.openingReadings)
  const closingReadings = raw.closingReadings ? mapReadings(raw.closingReadings) : null

  return {
    id: raw.id,
    number: raw.number || `SH-${raw.id.slice(0, 6).toUpperCase()}`,
    stationId: raw.stationId,
    stationName: raw.stationName || 'Forecourt Station',
    attendantId: raw.attendantId,
    attendantName: raw.attendantName || 'Attendant',
    pumpId: raw.pumpId,
    pumpName: raw.pumpName || pumpNameFor(raw.pumpId),
    assignedNozzles: Array.isArray(raw.assignedNozzles)
      ? raw.assignedNozzles
      : (typeof raw.assignedNozzles === 'string'
          ? (JSON.parse(raw.assignedNozzles || '[]') || [])
          : Object.values(openingReadings).map((r: any, idx) => r.nozzleLabel || `Nozzle ${r.nozzleIndex ?? (idx + 1)} (${r.fuelCode})`)),
    openedAt: raw.openedAt || raw.createdAt || new Date().toISOString(),
    closedAt: raw.closedAt || null,
    openingReadings,
    closingReadings,
    sales: Array.isArray(raw.sales) ? raw.sales : [],
    payments: raw.payments || { CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
    readingsTotal: Number(raw.readingsTotal || raw.salesTotal || 0),
    salesTotal: Number(raw.salesTotal || raw.expectedTotal || 0),
    actualTotal: Number(raw.actualTotal || 0),
    variance: Number(raw.variance || 0),
    status: raw.status || 'OPEN',
    reviewNotes: raw.reviewerNotes || raw.reviewNotes || raw.notes || null,
    reviewedBy: raw.reviewedBy || null,
    reviewedAt: raw.reviewedAt || null,
    syncStatus: raw.syncStatus || 'SYNCED',
    updatedAt: raw.updatedAt || new Date().toISOString(),
    version: raw.version || 1,
  }
}

export async function cloudGetShifts(stationId?: string): Promise<{ ok: boolean; shifts: Shift[]; message?: string }> {
  const base = getCloudApiBase()
  const token = await getCloudToken()
  if (!token) return { ok: false, shifts: [], message: 'Unauthenticated' }
  try {
    const url = stationId ? `${base}/api/shifts?station=${encodeURIComponent(stationId)}` : `${base}/api/shifts`
    const resp = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await readJson(resp)
    if (!resp.ok) return { ok: false, shifts: [], message: errorMessage(json, resp.status) }
    const rawList = Array.isArray(json) ? json : (Array.isArray((json as any).shifts) ? (json as any).shifts : [])
    const shifts = rawList.map(fromBackendShift)
    return { ok: true, shifts }
  } catch (err) {
    return { ok: false, shifts: [], message: err instanceof Error ? err.message : 'Network error' }
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

export interface CloudPumpNozzle {
  id: string
  nozzleIndex: number
  name: string
  fuelCode: string
  active: boolean
}

export interface CloudPump {
  id: string
  stationId: string
  companyId?: string
  name: string
  fuels: string[]
  nozzles?: CloudPumpNozzle[]
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export async function cloudGetPumps(stationId?: string, companyId?: string): Promise<{ ok: boolean; pumps: CloudPump[]; message?: string }> {
  const base = getCloudApiBase()
  const headers = await authHeaders().catch(() => ({ 'Content-Type': 'application/json' }))
  const params = new URLSearchParams()
  if (stationId) params.set('stationId', stationId)
  if (companyId) params.set('companyId', companyId)
  const qs = params.toString()
  try {
    const resp = await fetchWithTimeout(`${base}/api/pumps${qs ? '?' + qs : ''}`, { headers })
    const json = await readJson(resp)
    if (!resp.ok) {
      return { ok: false, pumps: [], message: typeof json.message === 'string' ? json.message : 'Failed to load station pumps' }
    }
    const rawPumps = Array.isArray(json.pumps) ? json.pumps : []
    const pumps: CloudPump[] = rawPumps.map((p: any) => {
      const fuels = Array.isArray(p.fuels) ? p.fuels.map(String) : ['PMS', 'AGO']
      const nozzles: CloudPumpNozzle[] = Array.isArray(p.nozzles) && p.nozzles.length > 0
        ? p.nozzles.map((nz: any, idx: number) => ({
            id: String(nz.id || `noz-${idx + 1}`),
            nozzleIndex: typeof nz.nozzleIndex === 'number' ? nz.nozzleIndex : idx + 1,
            name: String(nz.name || `Nozzle ${idx + 1} (${fuels[idx] || 'PMS'})`),
            fuelCode: String(nz.fuelCode || fuels[idx] || 'PMS'),
            active: nz.active !== false,
          }))
        : fuels.map((f: string, idx: number) => ({
            id: `noz-${idx + 1}`,
            nozzleIndex: idx + 1,
            name: fuels.filter((x: string) => x === f).length > 1 ? `Side ${idx + 1} (${f})` : `Nozzle ${idx + 1} (${f})`,
            fuelCode: f,
            active: true,
          }))
      return {
        id: String(p.id),
        stationId: String(p.stationId || stationId || ''),
        companyId: p.companyId ? String(p.companyId) : undefined,
        name: String(p.name || 'Pump'),
        fuels,
        nozzles,
        active: p.active !== false,
        createdAt: p.createdAt ? String(p.createdAt) : undefined,
        updatedAt: p.updatedAt ? String(p.updatedAt) : undefined,
      }
    })
    return { ok: true, pumps }
  } catch (err) {
    return { ok: false, pumps: [], message: err instanceof Error ? err.message : 'Network error' }
  }
}

