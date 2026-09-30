/**
 * Data access repositories over the production Dexie database.
 */

import { prodDb } from './db'
import type {
  AuditEntry,
  Attendant,
  AttendantSession,
  ReceiptRecord,
  Shift,
  ShiftStatus,
  ShiftTransaction,
  Supervisor,
  SupervisorSession,
  SyncEntityType,
  SyncQueueItem,
  StationExpense,
} from '../domain/types'

function cleanCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const attendantRepo = {
  async findByEmployeeCode(employeeCode: string): Promise<Attendant | undefined> {
    const raw = employeeCode.trim()
    if (!raw) return undefined
    const clean = cleanCode(raw)

    try {
      const direct = await prodDb.attendants.where('employeeCode').equalsIgnoreCase(raw).first()
      if (direct) return direct
    } catch {
      // index query fallback
    }

    const all = await prodDb.attendants.toArray()
    // 1. Exact case-insensitive match
    const exact = all.find(a => a.employeeCode.trim().toUpperCase() === raw.toUpperCase())
    if (exact) return exact

    // 2. Cleaned alphanumeric match (handles missing/extra dashes or spaces)
    const cleanedMatch = all.find(a => cleanCode(a.employeeCode) === clean)
    if (cleanedMatch) return cleanedMatch

    // 3. Known shorthand mappings (e.g. PV001A <-> PV-ACC-001-A)
    if (clean === 'PV001A' || clean === 'PVA01' || clean === 'PVACC001A') {
      return all.find(a => cleanCode(a.employeeCode).includes('PV') && cleanCode(a.employeeCode).endsWith('A'))
    }
    if (clean === 'GOIL001A' || clean === 'GOILA01' || clean === 'GOILACC001A') {
      return all.find(a => cleanCode(a.employeeCode).includes('GOIL') && cleanCode(a.employeeCode).endsWith('A'))
    }
    if (clean === 'TOT001A' || clean === 'TOTAL001A' || clean === 'TOTA01') {
      return all.find(a => cleanCode(a.employeeCode).includes('TOT') && cleanCode(a.employeeCode).endsWith('A'))
    }
    if (clean === 'SHELL001A' || clean === 'SHELLA01') {
      return all.find(a => cleanCode(a.employeeCode).includes('SHELL') && cleanCode(a.employeeCode).endsWith('A'))
    }

    return undefined
  },
  async getById(id: string): Promise<Attendant | undefined> {
    return prodDb.attendants.get(id)
  },
  async add(attendant: Attendant): Promise<void> {
    await prodDb.attendants.add(attendant)
  },
  async updateAttempts(attendant: Attendant): Promise<void> {
    await prodDb.attendants.update(attendant.id, {
      failedAttempts: attendant.failedAttempts,
      lockoutUntil: attendant.lockoutUntil,
    })
  },
  async deactivate(id: string): Promise<void> {
    await prodDb.attendants.update(id, { active: false })
  },
  async listActive(): Promise<Attendant[]> {
    return prodDb.attendants.filter(a => a.active === true).toArray()
  },
  async listPending(): Promise<Attendant[]> {
    return prodDb.attendants.filter(a => a.approvalStatus === 'PENDING').toArray()
  },
  async listAll(): Promise<Attendant[]> {
    return prodDb.attendants.toArray()
  },
  async approve(id: string, approverName: string): Promise<void> {
    await prodDb.attendants.update(id, {
      approvalStatus: 'APPROVED',
      active: true,
      approvedAt: new Date().toISOString(),
      approvedBy: approverName,
    })
  },
  async reject(id: string, approverName: string): Promise<void> {
    await prodDb.attendants.update(id, {
      approvalStatus: 'REJECTED',
      active: false,
      approvedAt: new Date().toISOString(),
      approvedBy: approverName,
    })
  },
}

export const supervisorRepo = {
  async findByEmployeeCode(employeeCode: string): Promise<Supervisor | undefined> {
    const raw = employeeCode.trim()
    if (!raw) return undefined
    const clean = cleanCode(raw)

    // Normalize superadmin variants
    const isSuperAdminAlias =
      clean === 'SUPERADMIN' ||
      clean === 'SUPERADMINISTRATOR' ||
      clean === 'ADMIN' ||
      clean === 'SUPER' ||
      clean === 'MASTER' ||
      clean === 'ROOT' ||
      clean === 'PETROMASTER' ||
      clean === 'SUPERADMIN1'

    try {
      if (isSuperAdminAlias) {
        const found = await prodDb.supervisors.where('employeeCode').equalsIgnoreCase('SUPER-ADMIN').first()
        if (found) return found
      } else {
        const found = await prodDb.supervisors.where('employeeCode').equalsIgnoreCase(raw).first()
        if (found) return found
      }
    } catch {
      // index query fallback
    }

    const all = await prodDb.supervisors.toArray()

    if (isSuperAdminAlias) {
      const sa = all.find(s => s.employeeCode.trim().toUpperCase() === 'SUPER-ADMIN' || s.isSuperAdmin === true)
      if (sa) return sa
    }

    // 1. Exact case-insensitive match
    const exact = all.find(s => s.employeeCode.trim().toUpperCase() === raw.toUpperCase())
    if (exact) return exact

    // 2. Cleaned alphanumeric match (e.g. PVHQ01 <-> PV-HQ01, PVACC001M <-> PV-ACC-001-M)
    const cleanedMatch = all.find(s => cleanCode(s.employeeCode) === clean)
    if (cleanedMatch) return cleanedMatch

    // 3. Shorthand HQ aliases
    if (clean === 'PVHQ' || clean === 'PVADMIN' || clean === 'PV') {
      const hq = all.find(s => cleanCode(s.employeeCode) === 'PVHQ01')
      if (hq) return hq
    }
    if (clean === 'GOILHQ' || clean === 'GOILADMIN' || clean === 'GOIL') {
      const hq = all.find(s => cleanCode(s.employeeCode) === 'GOILHQ01')
      if (hq) return hq
    }
    if (clean === 'TOTALHQ' || clean === 'TOTHQ' || clean === 'TOTALADMIN' || clean === 'TOTAL' || clean === 'TOT') {
      const hq = all.find(s => cleanCode(s.employeeCode) === 'TOTALHQ01' || cleanCode(s.employeeCode) === 'TOTHQ01')
      if (hq) return hq
    }
    if (clean === 'SHELLHQ' || clean === 'SHELLADMIN' || clean === 'SHELL') {
      const hq = all.find(s => cleanCode(s.employeeCode) === 'SHELLHQ01')
      if (hq) return hq
    }

    // 4. Shorthand Manager aliases
    if (clean === 'PV001M' || clean === 'PVM01' || clean === 'PVACC001M' || clean === 'PVM') {
      const mgr = all.find(s => cleanCode(s.employeeCode).includes('PV') && cleanCode(s.employeeCode).endsWith('M'))
      if (mgr) return mgr
    }
    if (clean === 'GOIL001M' || clean === 'GOILM01' || clean === 'GOILM') {
      const mgr = all.find(s => cleanCode(s.employeeCode).includes('GOIL') && cleanCode(s.employeeCode).endsWith('M'))
      if (mgr) return mgr
    }
    if (clean === 'TOT001M' || clean === 'TOTAL001M' || clean === 'TOTM01' || clean === 'TOTM') {
      const mgr = all.find(s => cleanCode(s.employeeCode).includes('TOT') && cleanCode(s.employeeCode).endsWith('M'))
      if (mgr) return mgr
    }
    if (clean === 'SHELL001M' || clean === 'SHELLM01' || clean === 'SHELLM') {
      const mgr = all.find(s => cleanCode(s.employeeCode).includes('SHELL') && cleanCode(s.employeeCode).endsWith('M'))
      if (mgr) return mgr
    }

    return undefined
  },
  async getById(id: string): Promise<Supervisor | undefined> {
    return prodDb.supervisors.get(id)
  },
  async add(supervisor: Supervisor): Promise<void> {
    await prodDb.supervisors.add(supervisor)
  },
  async updateAttempts(supervisor: Supervisor): Promise<void> {
    await prodDb.supervisors.update(supervisor.id, {
      failedAttempts: supervisor.failedAttempts,
      lockoutUntil: supervisor.lockoutUntil,
    })
  },
  async deactivate(id: string): Promise<void> {
    await prodDb.supervisors.update(id, { active: false })
  },
  async listActive(): Promise<Supervisor[]> {
    return prodDb.supervisors.where('active').equals(1).toArray()
  },
  async listPending(): Promise<Supervisor[]> {
    return prodDb.supervisors.filter(s => s.approvalStatus === 'PENDING').toArray()
  },
  async listAll(): Promise<Supervisor[]> {
    return prodDb.supervisors.toArray()
  },
  async approve(id: string, approverName: string): Promise<void> {
    await prodDb.supervisors.update(id, {
      approvalStatus: 'APPROVED',
      active: true,
      approvedAt: new Date().toISOString(),
      approvedBy: approverName,
    })
  },
  async reject(id: string, approverName: string): Promise<void> {
    await prodDb.supervisors.update(id, {
      approvalStatus: 'REJECTED',
      active: false,
      approvedAt: new Date().toISOString(),
      approvedBy: approverName,
    })
  },
}

export const supervisorSessionRepo = {
  async create(session: SupervisorSession): Promise<void> {
    await prodDb.supervisorSessions.add(session)
  },
  async findByToken(token: string): Promise<SupervisorSession | undefined> {
    return prodDb.supervisorSessions.where('token').equals(token).first()
  },
  async delete(token: string): Promise<void> {
    await prodDb.supervisorSessions.where('token').equals(token).delete()
  },
  async deleteExpired(): Promise<void> {
    await prodDb.supervisorSessions
      .filter(s => new Date(s.expiresAt).getTime() <= Date.now())
      .delete()
  },
}

export const sessionRepo = {
  async create(session: AttendantSession): Promise<void> {
    await prodDb.sessions.add(session)
  },
  async findByToken(token: string): Promise<AttendantSession | undefined> {
    return prodDb.sessions.where('token').equals(token).first()
  },
  async delete(token: string): Promise<void> {
    await prodDb.sessions.where('token').equals(token).delete()
  },
  async deleteExpired(): Promise<void> {
    await prodDb.sessions
      .filter(s => new Date(s.expiresAt).getTime() <= Date.now())
      .delete()
  },
}

export const shiftRepo = {
  async getById(id: string): Promise<Shift | undefined> {
    return prodDb.shifts.get(id)
  },
  async getActiveForAttendant(attendantId: string): Promise<Shift | undefined> {
    return prodDb.shifts.where('attendantId').equals(attendantId).and(s => s.status === 'OPEN').first()
  },
  async listForAttendant(attendantId: string): Promise<Shift[]> {
    const rows = await prodDb.shifts.where('attendantId').equals(attendantId).toArray()
    return rows.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  },
  async listForStation(stationId: string): Promise<Shift[]> {
    const rows = await prodDb.shifts.where('stationId').equals(stationId).toArray()
    return rows.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  },
  async listAll(): Promise<Shift[]> {
    const rows = await prodDb.shifts.toArray()
    return rows.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  },
  async listByStatuses(statuses: ShiftStatus[]): Promise<Shift[]> {
    const rows = await prodDb.shifts.filter(s => statuses.includes(s.status)).toArray()
    return rows.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  },
  async countForDate(attendantId: string, dateIso: string): Promise<number> {
    const day = dateIso.slice(0, 10)
    return prodDb.shifts
      .where('attendantId')
      .equals(attendantId)
      .filter(s => (s.openedAt || '').slice(0, 10) === day)
      .count()
  },
  async review(shiftId: string, status: ShiftStatus, reviewerNotes: string): Promise<Shift | undefined> {
    await prodDb.shifts.update(shiftId, { status, reviewerNotes, updatedAt: new Date().toISOString() })
    return prodDb.shifts.get(shiftId)
  },
  async upsert(shift: Shift): Promise<void> {
    await prodDb.shifts.put(shift)
  },
}

export const transactionRepo = {
  async add(tx: ShiftTransaction): Promise<void> {
    await prodDb.transactions.put(tx)
  },
  async getById(id: string): Promise<ShiftTransaction | undefined> {
    return prodDb.transactions.get(id)
  },
  async update(tx: ShiftTransaction): Promise<void> {
    await prodDb.transactions.put(tx)
  },
  async delete(id: string): Promise<void> {
    await prodDb.transactions.delete(id)
  },
  async listForShift(shiftId: string): Promise<ShiftTransaction[]> {
    const rows = await prodDb.transactions.where('shiftId').equals(shiftId).toArray()
    return rows.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
  },
}

export const receiptRepo = {
  async add(receipt: ReceiptRecord): Promise<void> {
    await prodDb.receipts.put(receipt)
  },
  async listForShift(shiftId: string): Promise<ReceiptRecord[]> {
    const rows = await prodDb.receipts.where('shiftId').equals(shiftId).toArray()
    return rows.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
  },
}

export const syncQueueRepo = {
  async add(item: SyncQueueItem): Promise<void> {
    await prodDb.syncQueue.put(item)
  },
  async getPending(forceAll = false): Promise<SyncQueueItem[]> {
    // DEAD_LETTER is excluded: it is terminal and must not be retried.
    // If forceAll is true (e.g. user pressed Push or manual retry), include all pending/failed items immediately
    const rows = await prodDb.syncQueue
      .filter(q => (q.status === 'PENDING' || q.status === 'FAILED') && (forceAll || q.nextRetryAt === null || new Date(q.nextRetryAt).getTime() <= Date.now()))
      .toArray()
    const priority = (item: SyncQueueItem) => item.entityType === 'SHIFT' ? 0 : 1
    return rows.sort((a, b) => {
      // SHIFTS must ALWAYS be synced before TRANSACTIONS so referenced shifts exist on the server
      const pDiff = priority(a) - priority(b)
      if (pDiff !== 0) return pDiff
      const created = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (created !== 0) return created
      return a.id.localeCompare(b.id)
    })
  },
  async getAll(): Promise<SyncQueueItem[]> {
    return prodDb.syncQueue.toArray()
  },
  async getCount(): Promise<number> {
    return prodDb.syncQueue.filter(q => q.status === 'PENDING' || q.status === 'FAILED').count()
  },
  /** Records that exhausted their retry budget and need operator attention. */
  async getDeadLettered(): Promise<SyncQueueItem[]> {
    const rows = await prodDb.syncQueue.filter(q => q.status === 'DEAD_LETTER').toArray()
    return rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  },
  async getByEntity(entityType: SyncEntityType, entityId: string): Promise<SyncQueueItem | undefined> {
    return prodDb.syncQueue.filter(q => q.entityType === entityType && q.entityId === entityId).first()
  },
  /** Returns a dead-lettered record to the retry queue. */
  async revive(id: string): Promise<void> {
    const item = await prodDb.syncQueue.get(id)
    if (!item) return
    await prodDb.syncQueue.put({
      ...item,
      status: 'PENDING',
      attempts: 0,
      nextRetryAt: null,
      updatedAt: new Date().toISOString(),
    })
  },
  /** Returns all dead-lettered records to the retry queue. */
  async reviveAllDeadLettered(): Promise<number> {
    const rows = await prodDb.syncQueue.filter(q => q.status === 'DEAD_LETTER').toArray()
    const now = new Date().toISOString()
    for (const item of rows) {
      await prodDb.syncQueue.put({
        ...item,
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: null,
        updatedAt: now,
      })
    }
    return rows.length
  },
  /** Revives dead-lettered records that were blocked specifically due to expired or missing auth. */
  async reviveUnauthorized(): Promise<number> {
    const rows = await prodDb.syncQueue
      .filter(q => q.status === 'DEAD_LETTER' && typeof q.lastError === 'string' && q.lastError.toUpperCase().includes('UNAUTHORIZED'))
      .toArray()
    const now = new Date().toISOString()
    for (const item of rows) {
      await prodDb.syncQueue.put({
        ...item,
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: null,
        updatedAt: now,
      })
    }
    return rows.length
  },
  /**
   * Discards a dead-lettered record from the queue. The underlying entity stays
   * in its own table, so this discards only the upload, not the sale — the
   * operator has already inspected the rejection reason.
   */
  async discard(id: string): Promise<void> {
    await prodDb.syncQueue.delete(id)
  },
  /** Trims SYNCED rows so the queue table does not grow for the life of the install. */
  async pruneSynced(keep = 500): Promise<number> {
    const synced = await prodDb.syncQueue.filter(q => q.status === 'SYNCED').toArray()
    if (synced.length <= keep) return 0
    const ordered = synced.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    const doomed = ordered.slice(keep).map(q => q.id)
    await prodDb.syncQueue.bulkDelete(doomed)
    return doomed.length
  },
  async update(item: SyncQueueItem): Promise<void> {
    await prodDb.syncQueue.put(item)
  },
}

export const auditLogRepo = {
  async add(entry: AuditEntry): Promise<void> {
    await prodDb.auditLog.add(entry)
  },
  async list(): Promise<AuditEntry[]> {
    const rows = await prodDb.auditLog.toArray()
    return rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  },
  async listForTarget(targetId: string): Promise<AuditEntry[]> {
    const rows = await prodDb.auditLog.where('targetId').equals(targetId).toArray()
    return rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  },
}

export const expenseRepo = {
  async add(expense: StationExpense): Promise<void> {
    await prodDb.expenses.put(expense)
  },
  async get(id: string): Promise<StationExpense | undefined> {
    return prodDb.expenses.get(id)
  },
  async update(expense: StationExpense): Promise<void> {
    await prodDb.expenses.put(expense)
  },
  async delete(id: string): Promise<void> {
    await prodDb.expenses.delete(id)
  },
  async listAll(): Promise<StationExpense[]> {
    const rows = await prodDb.expenses.toArray()
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },
  async listForStation(stationId: string): Promise<StationExpense[]> {
    const rows = await prodDb.expenses.where('stationId').equals(stationId).toArray()
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },
  async listForCompany(companyId: string): Promise<StationExpense[]> {
    const rows = await prodDb.expenses.where('companyId').equals(companyId).toArray()
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },
}