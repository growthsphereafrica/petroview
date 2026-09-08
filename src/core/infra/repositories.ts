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
  SyncQueueItem,
} from '../domain/types'

export const attendantRepo = {
  async findByEmployeeCode(employeeCode: string): Promise<Attendant | undefined> {
    const raw = employeeCode.trim()
    if (!raw) return undefined
    try {
      const found = await prodDb.attendants.where('employeeCode').equalsIgnoreCase(raw).first()
      if (found) return found
    } catch {
      // index query fallback
    }
    const all = await prodDb.attendants.toArray()
    return all.find(a => a.employeeCode.trim().toUpperCase() === raw.toUpperCase())
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
    const normalized = (raw.toUpperCase() === 'SUPERADMIN' || raw.toUpperCase() === 'SUPER ADMIN') ? 'SUPER-ADMIN' : raw
    try {
      const found = await prodDb.supervisors.where('employeeCode').equalsIgnoreCase(normalized).first()
      if (found) return found
    } catch {
      // index query fallback
    }
    const all = await prodDb.supervisors.toArray()
    return all.find(s => {
      const code = s.employeeCode.trim().toUpperCase()
      return code === raw.toUpperCase() || code === normalized.toUpperCase()
    })
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
    await prodDb.transactions.add(tx)
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
    await prodDb.receipts.add(receipt)
  },
  async listForShift(shiftId: string): Promise<ReceiptRecord[]> {
    const rows = await prodDb.receipts.where('shiftId').equals(shiftId).toArray()
    return rows.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
  },
}

export const syncQueueRepo = {
  async add(item: SyncQueueItem): Promise<void> {
    await prodDb.syncQueue.add(item)
  },
  async getPending(): Promise<SyncQueueItem[]> {
    return prodDb.syncQueue
      .filter(q => q.status === 'PENDING' && (q.nextRetryAt === null || new Date(q.nextRetryAt).getTime() <= Date.now()))
      .toArray()
  },
  async getAll(): Promise<SyncQueueItem[]> {
    return prodDb.syncQueue.toArray()
  },
  async getCount(): Promise<number> {
    return prodDb.syncQueue.where('status').equals('PENDING').count()
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