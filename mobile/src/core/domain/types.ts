/**
 * Mobile domain types. Mirrors the production web build's own `src/core/domain/types.ts`
 * so both platforms share an identical business contract. Business rules and
 * validation are enforced by the shared service layer.
 */

export type FuelCode = 'PMS' | 'AGO' | 'DPK' | 'KERO' | string

export type ProductCategory = 'FUEL' | 'LUBRICANT' | 'LPG' | 'OTHER'

export interface Product {
  id: string
  companyId?: string
  code: string
  name: string
  category: ProductCategory
  unitPrice: number
  unit: string
  color?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type PaymentMethod = 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'

export type ShiftStatus = 'OPEN' | 'CLOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED'

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'

export type SyncEntityType = 'SHIFT' | 'TRANSACTION' | 'RECEIPT' | 'EXPENSE'

export type ExpensePaymentSource = 'CASH' | 'MOMO' | 'STATION_ACCOUNT' | 'OTHER'

export interface StationExpense {
  id: string
  companyId: string
  companyShortCode?: string
  stationId: string
  stationName: string
  category: string
  amount: number
  paymentSource: ExpensePaymentSource
  payee?: string
  referenceNumber?: string
  notes?: string
  date: string // YYYY-MM-DD
  recordedBy: {
    id: string
    name: string
    employeeCode: string
  }
  status: 'APPROVED' | 'PENDING' | 'REJECTED'
  createdAt: string
  updatedAt: string
}

export interface MeterReading {
  fuelCode: FuelCode
  value: number
  nozzleIndex?: number
  nozzleLabel?: string
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

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface Attendant {
  id: string
  employeeCode: string
  fullName: string
  pinSalt: string
  pinHash: string
  pumpId: string | null
  stationId: string
  companyId?: string
  companyShortCode?: string
  phone?: string
  approvalStatus?: ApprovalStatus
  approvedAt?: string | null
  approvedBy?: string | null
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
  stationId?: string
  companyId?: string
  createdAt: string
  expiresAt: string
}

export interface Supervisor {
  id: string
  employeeCode: string
  fullName: string
  pinSalt: string
  pinHash: string
  stationId?: string
  companyId?: string
  companyShortCode?: string
  phone?: string
  role?: 'SUPERVISOR' | 'ACCOUNTANT'
  isHeadOffice?: boolean
  isSuperAdmin?: boolean
  approvalStatus?: ApprovalStatus
  approvedAt?: string | null
  approvedBy?: string | null
  active: boolean
  failedAttempts?: number
  lockoutUntil?: string | null
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
  pumpName?: string
  assignedNozzles?: string[]
  openedAt: string
  closedAt: string | null
  openingReadings: Record<string, MeterReading>
  closingReadings: Record<string, MeterReading> | null
  sales: FuelSale[]
  payments: PaymentsBreakdown
  readingsTotal: number
  salesTotal: number
  expectedTotal?: number
  actualTotal: number
  variance: number
  status: ShiftStatus
  reviewNotes: string | null
  reviewerNotes?: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  companyId?: string | null
  companyShortCode?: string | null
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
