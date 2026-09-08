import Dexie, { type Table } from 'dexie'
import { generateSampleReceiptImage } from '../utils/receiptGenerator'

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
 * Seed initial historical and active shifts matching mockup across companies
 */
export async function seedInitialDatabase() {
  const existingCount = await db.shifts.count()
  if (existingCount > 0) return

  const sampleReceipt1 = generateSampleReceiptImage({
    shiftNumber: 'SHIFT-000123',
    attendantName: 'John Attendant',
    stationName: 'Green Valley Station',
    fuelType: 'Super Petrol (PMS)',
    litres: 13.51,
    pricePerLitre: 14.80,
    totalAmount: 200.00,
    paymentMethod: 'Cash',
    dateStr: 'May 24, 2025 10:30 AM'
  })

  const sampleReceipt2 = generateSampleReceiptImage({
    shiftNumber: 'SHIFT-000123',
    attendantName: 'John Attendant',
    stationName: 'Green Valley Station',
    fuelType: 'Diesel (AGO)',
    litres: 23.03,
    pricePerLitre: 15.20,
    totalAmount: 350.00,
    paymentMethod: 'MoMo',
    dateStr: 'May 24, 2025 02:15 PM'
  })

  // SHIFT-000121 (Approved)
  const shift121: ShiftRecord = {
    id: 'shift-000121',
    companyId: 'COMP-MVP',
    companyName: 'PetroView Petroleum',
    shiftNumber: 'SHIFT-000121',
    attendantId: 'ATT1234',
    attendantName: 'John Attendant',
    stationId: 'STN-001',
    stationName: 'Green Valley Station',
    pumpId: 'Pump 1',
    nozzleAssignment: 'Nozzle 1 (PMS)',
    startTime: '2025-05-24T06:00:00Z',
    endTime: '2025-05-24T16:30:00Z',
    status: 'approved',
    openingMeters: { PMS: 123000.00, AGO: 85000.00, DPK: 44000.00, KERO: 22000.00 },
    closingMeters: { PMS: 124200.00, AGO: 86100.00, DPK: 44800.00, KERO: 22500.00 },
    fuelSales: {
      PMS: { litres: 1200, amount: 17760, price: 14.80 },
      AGO: { litres: 1100, amount: 16720, price: 15.20 },
      DPK: { litres: 800, amount: 11120, price: 13.90 },
      KERO: { litres: 500, amount: 6750, price: 13.50 },
    },
    expectedTotal: 52350.00,
    breakdown: { cash: 32000.00, momo: 18340.00, voucher: 2000.00, credit: 0.00 },
    actualTotal: 52340.00,
    shortage: -10.00,
    shortageBreakdown: { cash: -10.00, momo: 0, voucher: 0, credit: 0 },
    notes: 'Minor coin rounding shortage on cash.',
    supervisorNotes: 'Approved by Kwame Mensah (Supervisor). Minor GHS 10 discrepancy justified.',
    receiptCount: 1,
    receiptUrls: [sampleReceipt1],
    syncStatus: 'synced',
    syncChannel: 'cloud',
    lastSyncAttempt: '10:15 AM',
    createdAt: '2025-05-24T16:30:00Z',
    updatedAt: '2025-05-24T16:35:00Z',
  }

  // SHIFT-000122 (Reviewed)
  const shift122: ShiftRecord = {
    id: 'shift-000122',
    companyId: 'COMP-MVP',
    companyName: 'PetroView Petroleum',
    shiftNumber: 'SHIFT-000122',
    attendantId: 'ATT1235',
    attendantName: 'Mary Attendant',
    stationId: 'STN-001',
    stationName: 'Green Valley Station',
    pumpId: 'Pump 2',
    nozzleAssignment: 'Nozzle 1 (PMS)',
    startTime: '2025-05-24T08:00:00Z',
    endTime: '2025-05-24T17:55:00Z',
    status: 'reviewed',
    openingMeters: { PMS: 98210.00, AGO: 64100.50, DPK: 0, KERO: 0 },
    closingMeters: { PMS: 99410.00, AGO: 65200.50, DPK: 0, KERO: 0 },
    fuelSales: {
      PMS: { litres: 1200, amount: 17760, price: 14.80 },
      AGO: { litres: 1100, amount: 16720, price: 15.20 },
      DPK: { litres: 0, amount: 0, price: 13.90 },
      KERO: { litres: 0, amount: 0, price: 13.50 },
    },
    expectedTotal: 34480.00,
    breakdown: { cash: 20000.00, momo: 14480.00, voucher: 0, credit: 0 },
    actualTotal: 34480.00,
    shortage: 0.00,
    shortageBreakdown: { cash: 0, momo: 0, voucher: 0, credit: 0 },
    notes: 'Perfect shift reconciliation.',
    supervisorNotes: 'Reviewed. Ready for final approval.',
    receiptCount: 1,
    receiptUrls: [sampleReceipt2],
    syncStatus: 'pending',
    syncChannel: 'wifi',
    lastSyncAttempt: '10:18 AM',
    createdAt: '2025-05-24T17:55:00Z',
    updatedAt: '2025-05-24T17:58:00Z',
  }

  // SHIFT-000123 (Current Active / Completed shift from mockup)
  const shift123: ShiftRecord = {
    id: 'shift-000123',
    companyId: 'COMP-MVP',
    companyName: 'PetroView Petroleum',
    shiftNumber: 'SHIFT-000123',
    attendantId: 'ATT1234',
    attendantName: 'John Attendant',
    stationId: 'STN-001',
    stationName: 'Green Valley Station',
    pumpId: 'Pump 1',
    nozzleAssignment: 'Nozzle 1 (PMS)',
    startTime: '2025-05-24T08:00:00Z',
    endTime: '2025-05-24T18:05:00Z',
    status: 'completed',
    openingMeters: {
      PMS: 125340.50,
      AGO: 87340.20,
      DPK: 45320.10,
      KERO: 23010.00,
    },
    closingMeters: {
      PMS: 125890.70,
      AGO: 87890.40,
      DPK: 45670.80,
      KERO: 23120.60,
    },
    fuelSales: {
      PMS: { litres: 550.20, amount: 8142.96, price: 14.80 },
      AGO: { litres: 550.20, amount: 8363.04, price: 15.20 },
      DPK: { litres: 350.70, amount: 4874.73, price: 13.90 },
      KERO: { litres: 110.00, amount: 1485.00, price: 13.50 },
    },
    expectedTotal: 5620.50,
    breakdown: {
      cash: 3200.00,
      momo: 1850.00,
      voucher: 510.00,
      credit: 0.00,
    },
    actualTotal: 5560.00,
    shortage: -60.50,
    shortageBreakdown: {
      cash: -20.00,
      momo: -30.50,
      voucher: 0.00,
      credit: 0.00,
    },
    notes: 'Cash count mismatch at end of shift. Network was down for 2 hours during peak morning flow.',
    receiptCount: 2,
    receiptUrls: [sampleReceipt1, sampleReceipt2],
    syncStatus: 'pending',
    syncChannel: 'none',
    lastSyncAttempt: '10:15 AM',
    createdAt: '2025-05-24T18:05:00Z',
    updatedAt: '2025-05-24T18:05:00Z',
  }

  // GOIL Sample Shift
  const shiftGoil: ShiftRecord = {
    id: 'shift-goil-01',
    companyId: 'COMP-GOIL',
    companyName: 'GOIL Ghana PLC',
    shiftNumber: 'GOIL-SHIFT-084',
    attendantId: 'ATT-G1',
    attendantName: 'Kofi Mensah (GOIL)',
    stationId: 'GOIL-001',
    stationName: 'Accra Ridge Flagship',
    pumpId: 'Pump 1',
    nozzleAssignment: 'Nozzle 1 (PMS)',
    startTime: '2025-05-24T06:00:00Z',
    endTime: '2025-05-24T14:00:00Z',
    status: 'approved',
    openingMeters: { PMS: 340100.00, AGO: 290400.00, DPK: 0, KERO: 0 },
    closingMeters: { PMS: 341500.00, AGO: 291600.00, DPK: 0, KERO: 0 },
    fuelSales: {
      PMS: { litres: 1400, amount: 20860, price: 14.90 },
      AGO: { litres: 1200, amount: 18420, price: 15.35 },
      DPK: { litres: 0, amount: 0, price: 14.00 },
      KERO: { litres: 0, amount: 0, price: 13.60 },
    },
    expectedTotal: 39280.00,
    breakdown: { cash: 24000.00, momo: 15280.00, voucher: 0, credit: 0 },
    actualTotal: 39280.00,
    shortage: 0.00,
    shortageBreakdown: { cash: 0, momo: 0, voucher: 0, credit: 0 },
    notes: 'Busy morning rush on Ridge corridor.',
    supervisorNotes: 'Approved without discrepancy.',
    receiptCount: 1,
    receiptUrls: [sampleReceipt1],
    syncStatus: 'synced',
    syncChannel: 'cloud',
    lastSyncAttempt: '02:30 PM',
    createdAt: '2025-05-24T14:00:00Z',
    updatedAt: '2025-05-24T14:05:00Z',
  }

  // Star Oil Sample Shift
  const shiftStar: ShiftRecord = {
    id: 'shift-star-01',
    companyId: 'COMP-STAR',
    companyName: 'Star Oil Company',
    shiftNumber: 'STAR-SHIFT-052',
    attendantId: 'ATT-S1',
    attendantName: 'Kwesi Appiah (Star)',
    stationId: 'STAR-001',
    stationName: 'Spintex Coastal Station',
    pumpId: 'Pump 1',
    nozzleAssignment: 'Nozzle 1 (PMS)',
    startTime: '2025-05-24T07:00:00Z',
    endTime: '2025-05-24T15:00:00Z',
    status: 'completed',
    openingMeters: { PMS: 189000.00, AGO: 152000.00, DPK: 0, KERO: 0 },
    closingMeters: { PMS: 190100.00, AGO: 153000.00, DPK: 0, KERO: 0 },
    fuelSales: {
      PMS: { litres: 1100, amount: 16115, price: 14.65 },
      AGO: { litres: 1000, amount: 15100, price: 15.10 },
      DPK: { litres: 0, amount: 0, price: 13.80 },
      KERO: { litres: 0, amount: 0, price: 13.40 },
    },
    expectedTotal: 31215.00,
    breakdown: { cash: 18000.00, momo: 13200.00, voucher: 0, credit: 0 },
    actualTotal: 31200.00,
    shortage: -15.00,
    shortageBreakdown: { cash: -15.00, momo: 0, voucher: 0, credit: 0 },
    notes: 'Coin change shortage.',
    receiptCount: 1,
    receiptUrls: [sampleReceipt2],
    syncStatus: 'pending',
    syncChannel: 'wifi',
    lastSyncAttempt: '03:15 PM',
    createdAt: '2025-05-24T15:00:00Z',
    updatedAt: '2025-05-24T15:05:00Z',
  }

  try {
    await db.shifts.bulkPut([shift121, shift122, shift123, shiftGoil, shiftStar])

    // Seed sample transactions for Shift 123
    await db.transactions.bulkPut([
      {
        id: 'tx-1',
        companyId: 'COMP-MVP',
        shiftId: 'shift-000123',
        type: 'Cash',
        amount: 200.00,
        notes: 'Commercial bus refueling',
        timestamp: '2025-05-24T10:30:00Z',
        syncStatus: 'pending',
      },
      {
        id: 'tx-2',
        companyId: 'COMP-MVP',
        shiftId: 'shift-000123',
        type: 'MoMo',
        amount: 150.00,
        momoProvider: 'MTN',
        reference: 'TXN-984321',
        notes: 'Private saloon car',
        timestamp: '2025-05-24T11:15:00Z',
        syncStatus: 'pending',
      },
      {
        id: 'tx-3',
        companyId: 'COMP-MVP',
        shiftId: 'shift-000123',
        type: 'Voucher',
        amount: 510.00,
        reference: 'GOV-VOUCH-882',
        notes: 'Govt agency voucher',
        timestamp: '2025-05-24T14:40:00Z',
        syncStatus: 'pending',
      }
    ])
  } catch (err) {
    console.warn('Seed database fallback warning:', err)
  }
}
