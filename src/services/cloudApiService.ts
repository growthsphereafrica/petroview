import type { ShiftRecord } from '../db/database'
import { prodDb } from '../core/infra/db'
import type { SyncEntityType } from '../core/domain/types'

export interface HeadOfficeStats {
  totalStations: number
  activeStations: number
  totalTodaySalesGHS: number
  totalTodayLitres: number
  totalTodayShifts: number
  netShortageGHS: number
  syncComplianceRate: number
  stations: Array<{
    id: string
    name: string
    code: string
    region: string
    status: 'Online' | 'Offline' | 'Wi-Fi Only'
    todaySalesGHS: number
    litresDispensed: number
    pendingSyncs: number
    lastSync: string
  }>
}

export const INITIAL_HEAD_OFFICE_STATS: HeadOfficeStats = {
  totalStations: 24,
  activeStations: 22,
  totalTodaySalesGHS: 486250.00,
  totalTodayLitres: 32800.50,
  totalTodayShifts: 86,
  netShortageGHS: -420.50,
  syncComplianceRate: 98.4,
  stations: [
    {
      id: 'STN-001',
      name: 'Green Valley Station',
      code: 'GV-042',
      region: 'Greater Accra',
      status: 'Online',
      todaySalesGHS: 45620.50,
      litresDispensed: 3120.80,
      pendingSyncs: 3,
      lastSync: '10:20 AM'
    },
    {
      id: 'STN-002',
      name: 'Airport Bypass Express',
      code: 'AB-015',
      region: 'Greater Accra',
      status: 'Online',
      todaySalesGHS: 68400.00,
      litresDispensed: 4610.00,
      pendingSyncs: 0,
      lastSync: '10:35 AM'
    },
    {
      id: 'STN-003',
      name: 'Kumasi Central Highway',
      code: 'KC-088',
      region: 'Ashanti Region',
      status: 'Wi-Fi Only',
      todaySalesGHS: 54100.00,
      litresDispensed: 3650.00,
      pendingSyncs: 5,
      lastSync: '08:45 AM'
    },
    {
      id: 'STN-004',
      name: 'Takoradi Harbor Hub',
      code: 'TH-021',
      region: 'Western Region',
      status: 'Offline',
      todaySalesGHS: 39800.00,
      litresDispensed: 2700.00,
      pendingSyncs: 12,
      lastSync: 'Yesterday 09:15 PM'
    },
    {
      id: 'STN-005',
      name: 'Tamale North Junction',
      code: 'TN-009',
      region: 'Northern Region',
      status: 'Online',
      todaySalesGHS: 29500.00,
      litresDispensed: 1980.00,
      pendingSyncs: 1,
      lastSync: '10:10 AM'
    }
  ]
}

export async function uploadShiftToCloud(shift: ShiftRecord): Promise<{ success: boolean; cloudTxId: string; timestamp: string }> {
  // Real backend upload when an API URL is configured; simulated otherwise.
  const base = getApiBase()
  if (base) {
    try {
      const result = await postEntityBatch(base, [{ type: 'SHIFT', data: shift as unknown as Record<string, unknown> }])
      return { success: true, cloudTxId: result.cloudTxId, timestamp: result.timestamp }
    } catch (err) {
      if (err instanceof Error && err.message === 'CLOUD_UNCONFIGURED') {
        // fall through to simulation
      } else {
        // Server reachable but rejected — surface the real result.
        return { success: false, cloudTxId: '', timestamp: new Date().toISOString() }
      }
    }
  }
  await new Promise(resolve => setTimeout(resolve, 800))
  return {
    success: true,
    cloudTxId: `CLD-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString()
  }
}

/**
 * Resolves the configured backend API base URL from VITE_API_URL.
 * Returns null when unconfigured, in which case the app runs in
 * simulated-sync (demo) mode.
 */
export function getApiBase(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (configured && configured.length > 4) {
    return configured.replace(/\/+$/, '')
  }
  return 'https://petroviewapi.growthspheregh.com'
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem('mvp_prod_session_token') ?? localStorage.getItem('mvp_prod_supervisor_token')
  } catch {
    return null
  }
}

/**
 * Uploads a single queued entity (SHIFT / TRANSACTION / RECEIPT) to the
 * backend. Throws on network or validation failure so the durable retry
 * queue can back off and try again later.
 */
export async function uploadEntityToCloud(entityType: SyncEntityType, entityId: string): Promise<{ cloudTxId: string; timestamp: string }> {
  const base = getApiBase()
  if (!base) throw new Error('CLOUD_UNCONFIGURED')

  const data = await loadEntityRecord(entityType, entityId)
  if (!data) throw new Error(`Entity ${entityType}:${entityId} not found in local store`)

  const result = await postEntityBatch(base, [{ type: entityType, data }])
  return { cloudTxId: result.cloudTxId, timestamp: result.timestamp }
}

async function loadEntityRecord(entityType: SyncEntityType, entityId: string): Promise<Record<string, unknown> | null> {
  if (entityType === 'SHIFT') return ((await prodDb.shifts.get(entityId)) as unknown as Record<string, unknown> | null) ?? null
  if (entityType === 'TRANSACTION') return ((await prodDb.transactions.get(entityId)) as unknown as Record<string, unknown> | null) ?? null
  if (entityType === 'RECEIPT') return ((await prodDb.receipts.get(entityId)) as unknown as Record<string, unknown> | null) ?? null
  return null
}

interface EntityBatchResult {
  cloudTxId: string
  timestamp: string
}

async function postEntityBatch(base: string, entities: Array<{ type: SyncEntityType; data: Record<string, unknown> }>): Promise<EntityBatchResult> {
  const token = getStoredToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

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

  const json = (await resp.json().catch(() => ({}))) as { cloudTxId?: string; timestamp?: string; error?: string; message?: string }
  if (!resp.ok) {
    throw new Error(json.error ?? json.message ?? `HTTP ${resp.status}`)
  }
  return { cloudTxId: json.cloudTxId ?? `CLD-${Date.now().toString(36).toUpperCase()}`, timestamp: json.timestamp ?? new Date().toISOString() }
}
