/**
 * Backend API client — the single source of truth for authentication.
 * Both web and mobile apps call this same API so credentials are shared.
 */

const API_BASE_KEY = 'petroview_api_base'

export function getBackendUrl(): string {
  try {
    const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
    if (configured && configured.length > 4) return configured.replace(/\/+$/, '')
  } catch { /* not in browser */ }
  return 'https://petroviewapi.growthspheregh.com'
}

export interface BackendLoginResponse {
  token: string
  role: 'attendant' | 'supervisor' | 'headoffice' | 'superadmin'
  fullName: string
  employeeCode: string
  stationId: string | null
  companyId: string | null
  companyShortCode: string | null
  isSuperAdmin: boolean
  isHeadOffice: boolean
  expiresAt: string
}

export interface BackendRegisterResponse {
  id: string
  employeeCode: string
  fullName: string
  role: 'attendant' | 'supervisor'
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
}

export interface BackendPendingApproval {
  id: string
  employeeCode: string
  fullName: string
  phone: string | null
  stationId: string | null
  companyId: string | null
  companyShortCode: string | null
  createdAt: string
  role: 'attendant' | 'supervisor'
}

async function apiCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getBackendUrl()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) ?? {}) }
  const token = getStoredCloudToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let resp: Response
  try {
    resp = await fetch(`${base}${path}`, { ...options, headers })
  } catch (err) {
    throw new Error('BACKEND_UNREACHABLE')
  }

  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const msg = (json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? `HTTP ${resp.status}`
    throw new Error(msg)
  }
  return json as T
}

export function getStoredCloudToken(): string | null {
  try {
    return localStorage.getItem('petroview_cloud_token')
  } catch { return null }
}

export function storeCloudToken(token: string): void {
  try { localStorage.setItem('petroview_cloud_token', token) } catch { /* */ }
}

export function clearCloudToken(): void {
  try { localStorage.removeItem('petroview_cloud_token') } catch { /* */ }
}

export async function backendLogin(employeeCode: string, pin: string): Promise<BackendLoginResponse> {
  const result = await apiCall<BackendLoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ employeeCode, pin }),
  })
  storeCloudToken(result.token)
  return result
}

export async function backendRegister(input: {
  employeeCode: string
  fullName: string
  pin: string
  phone?: string
  stationId?: string
  companyId?: string
  companyShortCode?: string
}): Promise<BackendRegisterResponse> {
  return apiCall<BackendRegisterResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function backendLogout(): Promise<void> {
  try { await apiCall('/api/auth/logout', { method: 'POST' }) } catch { /* best effort */ }
  clearCloudToken()
}

export async function backendGetPendingApprovals(): Promise<{ supervisors: BackendPendingApproval[]; attendants: BackendPendingApproval[]; total: number }> {
  return apiCall('/api/auth/pending-approvals')
}

export async function backendApproveUser(userId: string, verdict: 'APPROVED' | 'REJECTED'): Promise<{ id: string; approvalStatus: string }> {
  return apiCall(`/api/auth/approve/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ verdict }),
  })
}

export async function backendHealthCheck(): Promise<{ status: string; attendants: number; supervisors: number; companies: number }> {
  return apiCall('/api/health')
}

export interface BackendCompany {
  id: string
  name: string
  shortCode: string
  tagline?: string
  logoText?: string
  primaryColor?: string
  active?: boolean
  createdAt?: string
}

export interface BackendCompanyStation {
  id: string
  companyId: string
  name: string
  code: string
  location: string
  region: string
  pumpsCount: number
  active?: boolean
  companyName?: string
  companyShortCode?: string
}

export async function backendGetCompanies(): Promise<{ count: number; companies: BackendCompany[] }> {
  const data = await apiCall<any>('/api/companies')
  if (Array.isArray(data)) {
    return { count: data.length, companies: data }
  }
  if (data && Array.isArray(data.companies)) {
    return data
  }
  return { count: 0, companies: [] }
}

export async function backendGetCompanyStations(companyId?: string): Promise<BackendCompanyStation[]> {
  if (companyId) {
    const data = await apiCall<any>(`/api/companies/${companyId}/stations`)
    return Array.isArray(data) ? data : []
  }
  const data = await apiCall<any>('/api/companies/all/stations')
  return Array.isArray(data) ? data : []
}

export async function backendCreateCompany(input: {
  name: string
  shortCode: string
  tagline?: string
  phone?: string
  adminFullName?: string
  adminPin?: string
  initialStations?: Array<{
    name: string
    code?: string
    location?: string
    region?: string
    pumpsCount?: number
  }>
}): Promise<{ company: { id: string; name: string; shortCode: string }; admin: { employeeCode: string; pin: string }; stations?: BackendCompanyStation[] }> {
  return apiCall('/api/companies', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function backendCreateStation(
  companyId: string,
  station: { name: string; code: string; location: string; region: string; pumpsCount?: number },
): Promise<BackendCompanyStation> {
  return apiCall(`/api/companies/${companyId}/stations`, {
    method: 'POST',
    body: JSON.stringify(station),
  })
}

export async function backendDeleteStation(companyId: string, stationId: string): Promise<{ success: boolean }> {
  return apiCall(`/api/companies/${companyId}/stations/${stationId}`, {
    method: 'DELETE',
  })
}

export async function backendGetTankReadings(stationId?: string, days?: number): Promise<{ count: number; readings: Array<Record<string, unknown>> }> {
  const params = new URLSearchParams()
  if (stationId) params.set('station', stationId)
  if (days) params.set('days', String(days))
  const qs = params.toString()
  return apiCall(`/api/tank-readings${qs ? '?' + qs : ''}`)
}

export async function backendRecordTankReadings(input: {
  stationId: string
  readings: Array<{ tankId: string; fuelCode: string; openingLevel: number; closingLevel: number; dipStock: number; received: number; notes?: string }>
  notes?: string
}): Promise<{ id: string; readingsCount: number }> {
  return apiCall('/api/tank-readings', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function backendGetHeadOfficeSummary(days?: number): Promise<Record<string, unknown>> {
  const qs = days ? `?days=${days}` : ''
  return apiCall(`/api/headoffice/summary${qs}`)
}

export async function backendGetShifts(status?: string, station?: string): Promise<{ count: number; shifts: Array<Record<string, unknown>> }> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (station) params.set('station', station)
  const qs = params.toString()
  return apiCall(`/api/shifts${qs ? '?' + qs : ''}`)
}

export async function backendReviewShift(shiftId: string, verdict: 'APPROVED' | 'REJECTED', notes?: string): Promise<{ id: string; status: string }> {
  return apiCall(`/api/sync/shifts/${shiftId}/review`, {
    method: 'POST',
    body: JSON.stringify({ verdict, notes }),
  })
}

export async function backendGetAttendants(companyId?: string, stationId?: string): Promise<{ count: number; attendants: Array<Record<string, unknown>> }> {
  const params = new URLSearchParams()
  if (companyId) params.set('company', companyId)
  if (stationId) params.set('station', stationId)
  const qs = params.toString()
  return apiCall(`/api/attendants${qs ? '?' + qs : ''}`)
}

export async function backendGetAuditLog(limit?: number): Promise<{ count: number; entries: Array<Record<string, unknown>> }> {
  const qs = limit ? `?limit=${limit}` : ''
  return apiCall(`/api/audit${qs}`)
}
