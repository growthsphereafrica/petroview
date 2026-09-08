/**
 * Mobile domain types. Mirrors the production web build's own `src/core/domain/types.ts`
 * so both platforms share an identical business contract. Business rules and
 * validation are enforced by the shared service layer.
 */

export type FuelCode = 'PMS' | 'AGO' | 'DPK' | 'KERO'

export type PaymentMethod = 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'

export type ShiftStatus = 'OPEN' | 'CLOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED'

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'

export type SyncEntityType = 'SHIFT' | 'TRANSACTION' | 'RECEIPT'

export interface MeterReading {
  fuelCode: FuelCode
  value: number
}

export interface FuelSale {
  fuelCode: FuelCode
  litres: number
  unitPrice: number
  amount: number
}

export interface PaymentsBreakdown {
  CASH: number
  MOMO: number
  VOUCHER: number
  CREDIT: number
}

export interface Attendant {
  id: string
  employeeCode: string
  fullName: string
  pinSalt: string
  pinHash: string
  pumpId: string | null
  stationId: string
  active: boolean
  failedAttempts: number
  lockoutUntil: string | null
  createdAt: string
}

export interface AttendantSession {
  id: string
  token: string
  attendantId: string
  employeeCode: string
  fullName: string
  createdAt: string
  expiresAt: string
}

export interface Supervisor {
  id: string
  employeeCode: string
  fullName: string
  pinSalt: string
  pinHash: string
  role: 'SUPERVISOR' | 'ACCOUNTANT'
  active: boolean
  createdAt: string
}

export interface SupervisorSession {
  id: string
  token: string
  supervisorId: string
  employeeCode: string
  fullName: string
  createdAt: string
  expiresAt: string
}

export interface Shift {
  id: string
  number: string
  stationId: string
  stationName: string
  attendantId: string
  attendantName: string
  pumpId: string
  openedAt: string
  closedAt: string | null
  openingReadings: Record<string, MeterReading>
  closingReadings: Record<string, MeterReading> | null
  sales: FuelSale[]
  payments: PaymentsBreakdown
  readingsTotal: number
  salesTotal: number
  actualTotal: number
  variance: number
  status: ShiftStatus
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  syncQueueKey?: string | null
  syncStatus: SyncStatus
  updatedAt: string
  version: number
}

export interface SyncQueueItem {
  id: string
  type: SyncEntityType
  entityType: 'SHIFT' | 'TRANSACTION' | 'RECEIPT'
  refId: string
  payload: unknown
  status: SyncStatus
  attempts: number
  createdAt: string
  updatedAt: string
  lastError?: string | null
}

export interface AuditEntry {
  id: string
  action: string
  actorId: string
  actorRole: string
  targetId: string
  notes?: string
  timestamp: string
}
