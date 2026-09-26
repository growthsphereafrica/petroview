import Dexie, { type Table } from 'dexie'

export interface FuelSaleItem {
  litres: number
  amount: number
  price: number
}

export interface ShiftRecord {
  id: string
  companyId: string
  companyName: string
  shiftNumber: string
  attendantId: string
  attendantName: string
  stationId: string
  stationName: string
  pumpId: string
  nozzleAssignment: string
  startTime: string
  endTime?: string
  status: 'active' | 'completed' | 'reviewed' | 'approved' | 'rejected'
  openingMeters: {
    PMS: number
    AGO: number
    DPK: number
    KERO: number
  }
  closingMeters: {
    PMS: number
    AGO: number
    DPK: number
    KERO: number
  }
  fuelSales: {
    PMS: FuelSaleItem
    AGO: FuelSaleItem
    DPK: FuelSaleItem
    KERO: FuelSaleItem
  }
  expectedTotal: number
  breakdown: {
    cash: number
    momo: number
    voucher: number
    credit: number
  }
  actualTotal: number
  shortage: number
  shortageBreakdown: {
    cash: number
    momo: number
    voucher: number
    credit: number
  }
  notes?: string
  supervisorNotes?: string
  receiptCount: number
  receiptUrls: string[]
  syncStatus: 'saved_local' | 'pending' | 'transferring' | 'synced' | 'failed'
  syncChannel?: 'wifi' | 'qr' | 'cloud' | 'none'
  lastSyncAttempt?: string
  qrPackagePayload?: string
  createdAt: string
  updatedAt: string
}

export interface TransactionRecord {
  id: string
  companyId?: string
  shiftId: string
  type: 'Cash' | 'MoMo' | 'Voucher' | 'Credit'
  amount: number
  momoProvider?: 'MTN' | 'Telecel' | 'AT'
  reference?: string
  notes?: string
  timestamp: string
  syncStatus: 'saved_local' | 'pending' | 'transferring' | 'synced' | 'failed'
}

export interface ReceiptRecord {
  id: string
  companyId?: string
  shiftId: string
  imageUrl: string
  notes?: string
  capturedAt: string
  syncStatus: 'saved_local' | 'pending' | 'transferring' | 'synced' | 'failed'
}

export interface SyncQueueItem {
  id: string
  companyId?: string
  entityType: 'shift' | 'transaction' | 'receipt'
  entityId: string
  payload: any
  status: 'pending' | 'transferring' | 'synced' | 'failed'
  retryCount: number
  lastError?: string
  createdAt: string
  updatedAt: string
}

export class MasterViewDatabase extends Dexie {
  shifts!: Table<ShiftRecord, string>
  transactions!: Table<TransactionRecord, string>
  receipts!: Table<ReceiptRecord, string>
  syncQueue!: Table<SyncQueueItem, string>

  constructor() {
    super('MasterViewForecourtDB')
    this.version(2).stores({
      shifts: 'id, companyId, stationId, shiftNumber, attendantId, status, syncStatus, createdAt',
      transactions: 'id, companyId, shiftId, type, syncStatus, timestamp',
      receipts: 'id, companyId, shiftId, syncStatus, capturedAt',
      syncQueue: 'id, companyId, entityType, entityId, status, createdAt',
    })
  }
}

export const db = new MasterViewDatabase()

/**
 * Seed initial historical and active shifts matching mockup across companies.
 * Hardened: No-op in production to prevent fabricated demo data.
 */
export async function seedInitialDatabase(): Promise<void> {
  // Production hardening: no-op to prevent fabricated/demo data seeding
}
