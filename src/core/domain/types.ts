/**
 * Production domain types for the Master View Forecourt OS.
 * Framework-agnostic core entities shared across services and UI.
 */

export type FuelCode = 'PMS' | 'AGO' | 'DPK' | 'KERO'

export type PaymentMethod = 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT'

export type ShiftStatus = 'OPEN' | 'CLOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED'

export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'

export type SyncEntityType = 'SHIFT' | 'TRANSACTION' | 'RECEIPT'

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type UnifiedRole = 'attendant' | 'supervisor' | 'headoffice' | 'superadmin'

export interface Company {
  id: string
  name: string
  shortCode: string
  tagline: string
  logoText: string
  primaryColor: string
  primaryDark: string
  accentColor: string
  currency: string
  adminCode: string
  adminName: string
  phone?: string
  active: boolean
  createdAt: string
}

export interface CompanyStation {
  id: string
  companyId: string
  name: string
  code: string
  location: string
  region: string
  pumpsCount: number
  supervisorName?: string
  createdAt: string
}

export type AuditAction =
  | 'REVIEW_APPROVED'
  | 'REJECTED'
  | 'PIN_RESET'
  | 'ATTENDANT_REGISTERED'
  | 'ATTENDANT_DEACTIVATED'
  | 'SHIFT_OPENED'
  | 'SHIFT_CLOSED'
  | 'STAFF_REGISTERED'
  | 'STAFF_APPROVED'
  | 'STAFF_REJECTED'
  | 'STAFF_DEACTIVATED'
  | 'SUPERVISOR_REGISTERED'
  | 'SUPERVISOR_DEACTIVATED'
  | 'COMPANY_CREATED'
  | 'COMPANY_UPDATED'
  | 'STATION_CREATED'

export interface MeterReading {
  fuelCode: FuelCode
  /** Cumulative volume shown on the pump meter in litres */
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
  companyId?: string
  companyShortCode?: string
  phone?: string
  approvalStatus: ApprovalStatus
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
  stationId: string
  companyId?: string
  companyShortCode?: string
  phone?: string
  isHeadOffice?: boolean
  isSuperAdmin?: boolean
  approvalStatus: ApprovalStatus
  approvedAt?: string | null
  approvedBy?: string | null
  active: boolean
  failedAttempts: number
  lockoutUntil: string | null
  createdAt: string
}

export interface SupervisorSession {
  id: string
  token: string
  supervisorId: string
  employeeCode: string
  fullName: string
  stationId: string
  companyId?: string
  isHeadOffice?: boolean
  isSuperAdmin?: boolean
  createdAt: string
  expiresAt: string
}

export interface Shift {
  id: string
  number: string
  attendantId: string
  attendantName: string
  pumpId: string
  pumpName: string
  stationId: string
  stationName: string
  status: ShiftStatus
  openedAt: string
  closedAt: string | null
  openingReadings: MeterReading[]
  closingReadings: MeterReading[]
  sales: FuelSale[]
  expectedTotal: number
  payments: PaymentsBreakdown
  actualTotal: number
  variance: number
  notes: string | null
  reviewerNotes: string | null
  syncStatus: SyncStatus
  createdAt: string
  updatedAt: string
}

export interface ShiftTransaction {
  id: string
  shiftId: string
  attendantId: string
  fuelCode: FuelCode
  litres: number
  amount: number
  unitPrice: number
  method: PaymentMethod
  customerRef?: string
  recordedAt: string
  syncStatus: SyncStatus
}

export interface ReceiptRecord {
  id: string
  shiftId: string
  image: string
  capturedAt: string
  syncStatus: SyncStatus
}

export interface SyncQueueItem {
  id: string
  entityType: SyncEntityType
  entityId: string
  status: SyncStatus
  attempts: number
  nextRetryAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface AuditEntry {
  id: string
  action: AuditAction
  actorId: string
  actorName: string
  actorRole: 'ATTENDANT' | 'SUPERVISOR' | 'SYSTEM'
  targetId: string
  targetDescription: string
  notes: string | null
  timestamp: string
  meta?: Record<string, string | number | boolean | null>
}