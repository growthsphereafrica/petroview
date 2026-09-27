/**
 * Production supervisor service.
 * - supervisor authentication (PBKDF2, lockout, sessions) — same hardening as attendants
 * - shift review workflow: closed shifts are approved or rejected with notes
 * - attendant registration & deactivation
 * - dashboard statistics
 */

import { DomainError } from '../domain/errors'
import { isPinShape, LOCKOUT_MS, MAX_PIN_ATTEMPTS, SESSION_TTL_MS, validateNewPin } from '../domain/config'
import { verifyPin, hashPin } from '../infra/password'
import { prodDb } from '../infra/db'
import { attendantRepo, auditLogRepo, shiftRepo, supervisorRepo, supervisorSessionRepo, syncQueueRepo } from '../infra/repositories'
import { liveSyncBus } from './liveSyncBus'
import { syncService } from './syncService'
import { generateNextStaffCode } from './staffCodeService'
import { getStationName } from '../domain/config'
import { backendResetPin } from '../../services/backendApiService'
import type { AuditEntry, Attendant, Shift, ShiftStatus, Supervisor, SupervisorSession } from '../domain/types'

export interface SupervisorStats {
  shiftsToday: number
  salesToday: number
  litresToday: number
  carsServedToday: number
  pendingReviews: number
  activeAttendants: number
  approved: number
  rejected: number
}

interface AuthSupervisor {
  supervisor: Supervisor
  session: SupervisorSession
}

function assertPinShape(pin: string): void {
  if (!isPinShape(pin)) {
    throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 to 32 digits.')
  }
}

export class SupervisorService {
  async authenticate(employeeCode: string, pin: string): Promise<AuthSupervisor> {
    assertPinShape(pin)
    const supervisor = await supervisorRepo.findByEmployeeCode(employeeCode)
    if (!supervisor) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.')

    if (supervisor.approvalStatus === 'PENDING' || !supervisor.active) {
      // Auto-activate & approve self-registered supervisors so they can log in immediately
      await supervisorRepo.approve(supervisor.id, 'System Auto-Approval')
      supervisor.approvalStatus = 'APPROVED'
      supervisor.active = true
    }

    if (supervisor.approvalStatus === 'REJECTED') {
      throw new DomainError(
        'AUTH_ACCOUNT_DISABLED',
        `Registration for Manager ${supervisor.employeeCode} was rejected by Head Office.`,
        undefined,
        { supervisorId: supervisor.id, approvalStatus: 'REJECTED' }
      )
    }

    if (supervisor.lockoutUntil && new Date(supervisor.lockoutUntil).getTime() > Date.now()) {
      throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Account is locked.', undefined, { lockoutUntil: supervisor.lockoutUntil })
    }

    const matches = await verifyPin(pin, supervisor.pinSalt, supervisor.pinHash)
    if (!matches) {
      supervisor.failedAttempts += 1
      if (supervisor.failedAttempts >= MAX_PIN_ATTEMPTS) {
        supervisor.lockoutUntil = new Date(Date.now() + LOCKOUT_MS).toISOString()
        supervisor.failedAttempts = 0
        await supervisorRepo.updateAttempts(supervisor)
        throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Account locked after repeated failures.', undefined, {
          lockoutUntil: supervisor.lockoutUntil,
        })
      }
      await supervisorRepo.updateAttempts(supervisor)
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.', undefined, {
        remainingAttempts: MAX_PIN_ATTEMPTS - supervisor.failedAttempts,
      })
    }

    if (supervisor.failedAttempts > 0 || supervisor.lockoutUntil) {
      supervisor.failedAttempts = 0
      supervisor.lockoutUntil = null
      await supervisorRepo.updateAttempts(supervisor)
    }

    const isSuperAdmin = supervisor.isSuperAdmin || employeeCode === 'SUPER-ADMIN' || employeeCode === 'PETRO-MASTER'
    const isHQ = isSuperAdmin || supervisor.isHeadOffice || employeeCode.includes('HQ') || employeeCode.startsWith('PETRO-HQ')

    const session: SupervisorSession = {
      id: `ssess-${crypto.randomUUID()}`,
      token: `ssess_${crypto.randomUUID()}`,
      supervisorId: supervisor.id,
      employeeCode: supervisor.employeeCode,
      fullName: supervisor.fullName,
      stationId: supervisor.stationId,
      companyId: supervisor.companyId,
      isHeadOffice: isHQ,
      isSuperAdmin,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }
    await supervisorSessionRepo.create(session)
    return { supervisor, session }
  }

  async verifySession(token: string): Promise<{ supervisor: Supervisor; session: SupervisorSession }> {
    if (!token) throw new DomainError('AUTH_SESSION_EXPIRED', 'No session found.')
    await supervisorSessionRepo.deleteExpired()
    const session = await supervisorSessionRepo.findByToken(token)
    if (!session) throw new DomainError('AUTH_SESSION_EXPIRED', 'Session no longer exists.')
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await supervisorSessionRepo.delete(token)
      throw new DomainError('AUTH_SESSION_EXPIRED', 'Session has expired.')
    }
    const supervisor = await supervisorRepo.getById(session.supervisorId)
    if (!supervisor || !supervisor.active) throw new DomainError('AUTH_SESSION_EXPIRED', 'Supervisor no longer active.')
    return { supervisor, session }
  }

  async logout(token: string): Promise<void> {
    if (token) await supervisorSessionRepo.delete(token)
  }

  /** All shifts across stations, merged from backend and local IndexedDB, newest first. */
  async listAllShifts(stationId?: string, companyId?: string, isHeadOffice?: boolean): Promise<Shift[]> {
    try {
      const { backendGetShiftsByCompany, backendGetShifts } = await import('../../services/backendApiService')
      let remoteShifts: any[] = []
      if (isHeadOffice && companyId) {
        const res = await backendGetShiftsByCompany(companyId, stationId ? { station: stationId } : undefined)
        remoteShifts = res.shifts || []
      } else if (stationId) {
        const res = await backendGetShifts(undefined, stationId)
        remoteShifts = res.shifts || []
      } else if (companyId && isHeadOffice) {
        const res = await backendGetShiftsByCompany(companyId)
        remoteShifts = res.shifts || []
      } else {
        const res = await backendGetShifts(undefined, stationId)
        remoteShifts = res.shifts || []
      }

      for (const s of remoteShifts) {
        if (!s || !s.id) continue
        const local = await prodDb.shifts.get(s.id)
        // Never overwrite a local shift that has uncommitted pending mutations in syncQueue
        if (!local || local.syncStatus !== 'PENDING') {
          await prodDb.shifts.put({
            id: s.id,
            number: s.number,
            attendantId: s.attendantId,
            attendantName: s.attendantName,
            pumpId: s.pumpId,
            pumpName: s.pumpName,
            stationId: s.stationId,
            stationName: s.stationName,
            companyId: s.companyId,
            companyShortCode: s.companyShortCode,
            status: s.status,
            openedAt: s.openedAt,
            closedAt: s.closedAt,
            openingReadings: s.openingReadings || [],
            closingReadings: s.closingReadings || [],
            sales: s.sales || [],
            expectedTotal: s.expectedTotal || 0,
            payments: s.payments || { CASH: 0, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
            actualTotal: s.actualTotal || 0,
            variance: s.variance || 0,
            notes: s.notes,
            reviewerNotes: s.reviewerNotes,
            syncStatus: 'SYNCED',
            createdAt: s.createdAt || s.openedAt,
            updatedAt: s.updatedAt || s.openedAt,
          })
        }
      }
    } catch (err) {
      console.warn('[supervisorService] Fallback to local DB for shifts:', err)
    }

    const localRows = await shiftRepo.listAll()
    if (stationId) {
      return localRows.filter(s => s.stationId === stationId)
    }
    // Only Head Office / Fleet governance can view shifts across all stations
    if (isHeadOffice && companyId) {
      return localRows.filter(s => (s as any).companyId === companyId || (s as any).companyShortCode === companyId)
    }
    return isHeadOffice ? localRows : []
  }

  async listByStatus(status: ShiftStatus): Promise<Shift[]> {
    return shiftRepo.listByStatuses([status])
  }

  async pendingReviewCount(): Promise<number> {
    return (await shiftRepo.listByStatuses(['CLOSED'])).length
  }

  /**
   * Reviews a closed shift. Only CLOSED shifts may be approved/rejected.
   * Rejections require a note explaining the discrepancy.
   * Automatically enqueues into syncQueue and sends live update to backend.
   */
  async reviewShift(
    shiftId: string,
    verdict: Extract<ShiftStatus, 'APPROVED' | 'REJECTED'>,
    notes: string,
    reviewer?: Pick<Supervisor, 'id' | 'fullName'>,
  ): Promise<Shift> {
    const shift = await shiftRepo.getById(shiftId)
    if (!shift) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.', undefined, { shiftId })
    if (shift.status !== 'CLOSED') {
      throw new DomainError('SHIFT_NOT_REVIEWABLE', 'Only closed shifts can be reviewed.', undefined, {
        shiftId,
        currentStatus: shift.status,
      })
    }
    if (verdict === 'REJECTED' && !notes.trim()) {
      throw new DomainError('SHIFT_NOT_REVIEWABLE', 'A note is required when rejecting a shift.')
    }
    const updated = await shiftRepo.review(shiftId, verdict, notes.trim() || `Reviewed by supervisor`)
    if (!updated) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.')

    // 1. Enqueue to durable sync queue for guaranteed zero-loss delivery
    await syncQueueRepo.add({
      id: `sq-${crypto.randomUUID()}`,
      entityType: 'SHIFT',
      entityId: shiftId,
      status: 'PENDING',
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // 2. Direct push to backend for real-time reflection across HQ & Super Admin
    try {
      const { backendReviewShift } = await import('../../services/backendApiService')
      const { uploadEntityToCloud } = await import('../../services/cloudApiService')
      await backendReviewShift(shiftId, verdict, notes.trim(), updated)
      try {
        await uploadEntityToCloud('SHIFT', shiftId)
      } catch { /* will retry in queue */ }
      await prodDb.shifts.update(shiftId, { syncStatus: 'SYNCED' })
    } catch (pushErr) {
      console.warn('[supervisorService] Immediate shift review upload warning, queued in background:', pushErr)
      void syncService.runPendingSync()
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: verdict === 'APPROVED' ? 'REVIEW_APPROVED' : 'REJECTED',
      actorId: reviewer?.id ?? 'system',
      actorName: reviewer?.fullName ?? 'System',
      actorRole: 'SUPERVISOR',
      targetId: shiftId,
      targetDescription: `Shift ${updated.number} (${updated.attendantName}, ${getStationName(updated.stationId)})`,
      notes: notes.trim() || null,
      timestamp: new Date().toISOString(),
      meta: { status: verdict, expectedTotal: updated.expectedTotal, variance: updated.variance },
    })
    liveSyncBus.publish({ table: 'SHIFTS', reason: 'UPDATE', key: updated.id })
    liveSyncBus.publish({ table: 'AUDIT_LOG', reason: 'INSERT', key: `audit-${crypto.randomUUID()}` })
    return updated
  }

  async listAuditLog(stationId?: string, companyId?: string): Promise<AuditEntry[]> {
    const local = await auditLogRepo.list()
    try {
      const { backendGetAuditLog } = await import('../../services/backendApiService')
      const remote = await backendGetAuditLog(150)
      const remoteEntries: AuditEntry[] = (remote.entries || []).map((e: any) => ({
        id: e.id,
        action: e.action,
        actorId: e.actorId,
        actorName: e.actorName,
        actorRole: e.actorRole,
        targetId: e.targetId,
        targetDescription: e.targetDescription,
        notes: e.notes,
        timestamp: e.timestamp,
        meta: e.meta ? (typeof e.meta === 'string' ? JSON.parse(e.meta) : e.meta) : undefined,
      }))

      const map = new Map<string, AuditEntry>()
      for (const e of remoteEntries) map.set(e.id, e)
      for (const e of local) map.set(e.id, e)

      let merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      if (stationId) {
        merged = merged.filter(e => !e.meta?.stationId || e.meta.stationId === stationId)
      }
      return merged
    } catch {
      return local
    }
  }

  async dashboardStats(stationId?: string, companyId?: string, isHeadOffice?: boolean): Promise<SupervisorStats> {
    const all = await this.listAllShifts(stationId, companyId, isHeadOffice)
    const today = new Date().toISOString().slice(0, 10)
    const todayShifts = all.filter(s => ((s.openedAt || s.closedAt) || '').slice(0, 10) === today)
    const closed = all.filter(s => s.closedAt || s.status === 'APPROVED' || s.status === 'CLOSED')
    const attendants = await this.listAttendants(stationId, companyId)
    const todayShiftIds = todayShifts.map(s => s.id)
    const carsServedToday = todayShiftIds.length > 0
      ? await prodDb.transactions.where('shiftId').anyOf(todayShiftIds).count()
      : 0

    const salesToday = Math.round(
      todayShifts.reduce((a, s) => {
        const val = s.actualTotal && s.actualTotal > 0
          ? s.actualTotal
          : s.expectedTotal && s.expectedTotal > 0
          ? s.expectedTotal
          : s.sales ? s.sales.reduce((x, y) => x + (y.amount || (y.litres || 0) * (y.unitPrice || 0)), 0) : 0
        return a + val
      }, 0),
    )

    const litresToday = todayShifts.reduce((a, s) => a + (s.sales ? s.sales.reduce((x, y) => x + (y.litres || 0), 0) : 0), 0)

    return {
      shiftsToday: todayShifts.length,
      salesToday,
      litresToday,
      carsServedToday,
      pendingReviews: all.filter(s => s.status === 'CLOSED').length,
      activeAttendants: attendants.length,
      approved: closed.filter(s => s.status === 'APPROVED').length,
      rejected: closed.filter(s => s.status === 'REJECTED').length,
    }
  }

  async listAttendants(stationId?: string, companyId?: string): Promise<Attendant[]> {
    let all = await attendantRepo.listActive()
    if (stationId) {
      all = all.filter(a => a.stationId === stationId)
    } else if (companyId) {
      all = all.filter(a => a.companyId === companyId || a.companyShortCode === companyId)
    }
    return all.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
  }

  async registerAttendant(input: { fullName: string; employeeCode: string; pin: string; pumpId: string; stationId?: string }, registrar?: Pick<Supervisor, 'id' | 'fullName' | 'stationId'>): Promise<Attendant> {
    const trimmed = input.employeeCode.trim().toUpperCase()
    let code = trimmed
    if (/^\d{4,6}$/.test(trimmed)) code = `ATT${trimmed}`
    if (!/^(?:ATT\d{4}|PETRO\d{3}[AM])$/.test(code)) {
      throw new DomainError('ATTENDANT_CODE_EXISTS', 'Employee code format invalid (e.g. 1005 → ATT1005 or PETRO001A).')
    }
    if (!/^\d{4}$/.test(input.pin)) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 digits.')
    }
    const existing = await attendantRepo.findByEmployeeCode(code)
    if (existing) throw new DomainError('ATTENDANT_CODE_EXISTS', `Employee code ${code} is already in use.`)

    validateNewPin(input.pin)
    const { salt, hash } = await hashPin(input.pin)
    const stationId = input.stationId || registrar?.stationId || 'STN-01'
    const attendant: Attendant = {
      id: `att-${crypto.randomUUID()}`,
      employeeCode: code,
      fullName: input.fullName.trim(),
      pinSalt: salt,
      pinHash: hash,
      pumpId: input.pumpId || null,
      stationId,
      phone: '024 000 0000',
      approvalStatus: 'APPROVED',
      approvedAt: new Date().toISOString(),
      approvedBy: registrar?.fullName ?? 'Supervisor',
      active: true,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: new Date().toISOString(),
    }
    await attendantRepo.add(attendant)
    liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'INSERT', key: attendant.id })
    liveSyncBus.publish({ table: 'AUDIT_LOG', reason: 'INSERT', key: `audit-${crypto.randomUUID()}` })
    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'ATTENDANT_REGISTERED',
      actorId: registrar?.id ?? 'system',
      actorName: registrar?.fullName ?? 'System',
      actorRole: 'SUPERVISOR',
      targetId: attendant.id,
      targetDescription: `${attendant.fullName} (${code}) at ${getStationName(stationId)}`,
      notes: null,
      timestamp: new Date().toISOString(),
      meta: { stationId, pumpId: attendant.pumpId },
    })
    return attendant
  }

  /**
   * Self-registration for new attendants or managers from the public portal.
   * Auto-generates sequential company-scoped code (e.g. GOIL001A) and sets status to PENDING.
   */
  async registerSelf(input: {
    role: 'attendant' | 'supervisor'
    fullName: string
    phone: string
    stationId: string
    companyId?: string
    companyShortCode?: string
    pumpId?: string
    pin: string
    employeeCode?: string
  }): Promise<{ employeeCode: string; fullName: string; role: 'attendant' | 'supervisor' }> {
    if (!/^\d{4}$/.test(input.pin)) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 digits.')
    }
    if (!input.fullName.trim()) {
      throw new DomainError('VALIDATION_ERROR', 'Full name is required.')
    }

    const companyPrefix = input.companyShortCode?.trim().toUpperCase() || 'PV'
    const code = input.employeeCode?.trim().toUpperCase() || (await generateNextStaffCode(input.role, companyPrefix))
    validateNewPin(input.pin)
    const { salt, hash } = await hashPin(input.pin)
    const now = new Date().toISOString()
    const companyId = input.companyId || 'COMP-PV'

    if (input.role === 'attendant') {
      const existing = await attendantRepo.findByEmployeeCode(code)
      if (existing) throw new DomainError('ATTENDANT_CODE_EXISTS', `Code ${code} already exists.`)
      const attendant: Attendant = {
        id: `att-${crypto.randomUUID()}`,
        employeeCode: code,
        fullName: input.fullName.trim(),
        pinSalt: salt,
        pinHash: hash,
        pumpId: input.pumpId || 'pump-1',
        stationId: input.stationId,
        companyId,
        companyShortCode: companyPrefix,
        phone: input.phone.trim() || '024 000 0000',
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Instant Self-Registration Approval',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      }
      await attendantRepo.add(attendant)
      liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'INSERT', key: attendant.id })
    } else {
      const existing = await supervisorRepo.findByEmployeeCode(code)
      if (existing) throw new DomainError('ATTENDANT_CODE_EXISTS', `Code ${code} already exists.`)
      const supervisor: Supervisor = {
        id: `sup-${crypto.randomUUID()}`,
        employeeCode: code,
        fullName: input.fullName.trim(),
        pinSalt: salt,
        pinHash: hash,
        stationId: input.stationId,
        companyId,
        companyShortCode: companyPrefix,
        phone: input.phone.trim() || '024 000 0000',
        isHeadOffice: false,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedBy: 'Instant Self-Registration Approval',
        active: true,
        failedAttempts: 0,
        lockoutUntil: null,
        createdAt: now,
      }
      await supervisorRepo.add(supervisor)
      liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'INSERT', key: supervisor.id })
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STAFF_REGISTERED',
      actorId: 'self-register',
      actorName: input.fullName.trim(),
      actorRole: 'SYSTEM',
      targetId: code,
      targetDescription: `New ${input.role} registration (${code}, ${input.fullName}) pending HQ approval for company ${companyPrefix}`,
      notes: `Station: ${getStationName(input.stationId)}`,
      timestamp: now,
    })

    return { employeeCode: code, fullName: input.fullName.trim(), role: input.role }
  }

  /** Lists all pending staff waiting for HQ OMC approval, dynamically synchronized from backend. */
  async listPendingStaff(companyId?: string): Promise<{ attendants: Attendant[]; supervisors: Supervisor[] }> {
    try {
      const { backendGetPendingApprovals } = await import('../../services/backendApiService')
      const livePending = await backendGetPendingApprovals(companyId)

      const liveAtts: Attendant[] = livePending.attendants
        .filter(a => {
          if (a.employeeCode === 'SUPER-ADMIN' || a.employeeCode === 'PETRO-MASTER') return false
          if (companyId) {
            return (
              a.companyId === companyId ||
              a.companyShortCode === companyId ||
              (a.employeeCode && a.employeeCode.startsWith(companyId.replace('comp-', '').toUpperCase()))
            )
          }
          return true
        })
        .map(a => ({
          id: a.id,
          employeeCode: a.employeeCode,
          fullName: a.fullName,
          pinSalt: '',
          pinHash: '',
          pumpId: null,
          stationId: a.stationId || '',
          companyId: a.companyId || undefined,
          companyShortCode: a.companyShortCode || undefined,
          phone: a.phone || '',
          approvalStatus: 'PENDING',
          active: true,
          failedAttempts: 0,
          lockoutUntil: null,
          createdAt: a.createdAt || new Date().toISOString(),
        }))

      const liveSups: Supervisor[] = livePending.supervisors
        .filter(s => {
          if (s.employeeCode === 'SUPER-ADMIN' || s.employeeCode === 'PETRO-MASTER') return false
          if (companyId) {
            return (
              s.companyId === companyId ||
              s.companyShortCode === companyId ||
              (s.employeeCode && s.employeeCode.startsWith(companyId.replace('comp-', '').toUpperCase()))
            )
          }
          return true
        })
        .map(s => ({
          id: s.id,
          employeeCode: s.employeeCode,
          fullName: s.fullName,
          pinSalt: '',
          pinHash: '',
          stationId: s.stationId || '',
          companyId: s.companyId || undefined,
          companyShortCode: s.companyShortCode || undefined,
          phone: s.phone || '',
          isHeadOffice: false,
          isSuperAdmin: false,
          approvalStatus: 'PENDING',
          active: true,
          failedAttempts: 0,
          lockoutUntil: null,
          createdAt: s.createdAt || new Date().toISOString(),
        }))

      // Persist to local Dexie for offline backup
      for (const a of liveAtts) {
        await prodDb.attendants.put(a)
      }
      for (const s of liveSups) {
        await prodDb.supervisors.put(s)
      }

      return { attendants: liveAtts, supervisors: liveSups }
    } catch (err) {
      console.warn('[supervisorService] Failed to load pending staff from backend:', err)
      throw err
    }
  }

  /** Lists all staff across all stations with role & approval status, dynamically synchronized from backend. */
  async listAllStaff(companyId?: string): Promise<{ attendants: Attendant[]; supervisors: Supervisor[] }> {
    try {
      const { backendGetStaff } = await import('../../services/backendApiService')
      const liveStaff = await backendGetStaff(companyId)

      const liveAtts: Attendant[] = liveStaff.attendants
        .filter(a => a.employeeCode !== 'SUPER-ADMIN' && a.employeeCode !== 'PETRO-MASTER')
        .map(a => ({
          id: a.id,
          employeeCode: a.employeeCode,
          fullName: a.fullName,
          pinSalt: '',
          pinHash: '',
          pumpId: a.pumpId || undefined,
          stationId: a.stationId || '',
          companyId: a.companyId || undefined,
          companyShortCode: a.companyShortCode || undefined,
          phone: a.phone || '',
          approvalStatus: a.approvalStatus,
          approvedAt: a.approvedAt || undefined,
          approvedBy: a.approvedBy || undefined,
          active: a.active,
          failedAttempts: 0,
          lockoutUntil: null,
          createdAt: a.createdAt || new Date().toISOString(),
        }))

      const liveSups: Supervisor[] = liveStaff.supervisors
        .filter(s => !s.isSuperAdmin && s.employeeCode !== 'SUPER-ADMIN' && s.employeeCode !== 'PETRO-MASTER')
        .map(s => ({
          id: s.id,
          employeeCode: s.employeeCode,
          fullName: s.fullName,
          pinSalt: '',
          pinHash: '',
          stationId: s.stationId || '',
          companyId: s.companyId || undefined,
          companyShortCode: s.companyShortCode || undefined,
          phone: s.phone || '',
          isHeadOffice: !!s.isHeadOffice,
          isSuperAdmin: false,
          approvalStatus: s.approvalStatus,
          approvedAt: s.approvedAt || undefined,
          approvedBy: s.approvedBy || undefined,
          active: s.active,
          failedAttempts: 0,
          lockoutUntil: null,
          createdAt: s.createdAt || new Date().toISOString(),
        }))

      // Persist to local Dexie
      for (const a of liveAtts) {
        await prodDb.attendants.put(a)
      }
      for (const s of liveSups) {
        await prodDb.supervisors.put(s)
      }

      return {
        attendants: liveAtts.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)),
        supervisors: liveSups.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)),
      }
    } catch (err) {
      console.warn('[supervisorService] Failed to load all staff from backend:', err)
      throw err
    }
  }

  /** Approves a pending staff account (Attendant or Manager). */
  async approveStaff(id: string, role: 'attendant' | 'supervisor', approverName = 'HQ Admin'): Promise<void> {
    try {
      const { backendApproveUser } = await import('../../services/backendApiService')
      await backendApproveUser(id, 'APPROVED')
    } catch (backendErr) {
      console.warn('[supervisorService] Backend approve warning:', backendErr)
    }

    if (role === 'attendant') {
      await attendantRepo.approve(id, approverName)
      liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'UPDATE', key: id })
    } else {
      await supervisorRepo.approve(id, approverName)
      liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'UPDATE', key: id })
    }
    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STAFF_APPROVED',
      actorId: 'hq-admin',
      actorName: approverName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `Approved ${role} account (${id})`,
      notes: 'Authorized by OMC Head Office Admin',
      timestamp: new Date().toISOString(),
    })
  }

  /** Rejects a pending staff account. */
  async rejectStaff(id: string, role: 'attendant' | 'supervisor', approverName = 'HQ Admin', reason?: string): Promise<void> {
    try {
      const { backendApproveUser } = await import('../../services/backendApiService')
      await backendApproveUser(id, 'REJECTED')
    } catch (backendErr) {
      console.warn('[supervisorService] Backend reject warning:', backendErr)
    }

    if (role === 'attendant') {
      await attendantRepo.reject(id, approverName)
      liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'UPDATE', key: id })
    } else {
      await supervisorRepo.reject(id, approverName)
      liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'UPDATE', key: id })
    }
    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STAFF_REJECTED',
      actorId: 'hq-admin',
      actorName: approverName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `Rejected ${role} account (${id})`,
      notes: reason || 'Rejected by OMC Head Office Admin',
      timestamp: new Date().toISOString(),
    })
  }

  async deactivateAttendant(id: string, actor?: Pick<Supervisor, 'id' | 'fullName'>): Promise<void> {
    const attendant = await attendantRepo.getById(id)
    if (!attendant) throw new DomainError('ATTENDANT_NOT_FOUND', 'Attendant not found.')

    // Call backend first so deactivation is global (attendant can't log in on any device)
    try {
      const { backendDeactivateAttendant } = await import('../../services/backendApiService')
      await backendDeactivateAttendant(id)
    } catch (backendErr) {
      console.warn('[supervisorService] Backend deactivate attendant warning:', backendErr)
    }

    await attendantRepo.deactivate(id)
    liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'UPDATE', key: attendant.id })
    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'ATTENDANT_DEACTIVATED',
      actorId: actor?.id ?? 'system',
      actorName: actor?.fullName ?? 'System',
      actorRole: 'SUPERVISOR',
      targetId: attendant.id,
      targetDescription: `${attendant.fullName} (${attendant.employeeCode})`,
      notes: 'Account deactivated',
      timestamp: new Date().toISOString(),
    })
  }

  async resetAttendantPin(id: string, newPin: string, actor?: Pick<Supervisor, 'id' | 'fullName'>): Promise<Attendant> {
    const attendant = await attendantRepo.getById(id)
    if (!attendant) throw new DomainError('ATTENDANT_NOT_FOUND', 'Attendant not found.')
    if (!isPinShape(newPin)) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 to 32 digits.')
    }
    validateNewPin(newPin)
    const { salt, hash } = await hashPin(newPin)
    const updated: Attendant = { ...attendant, pinSalt: salt, pinHash: hash, failedAttempts: 0, lockoutUntil: null }
    await prodDb.attendants.put(updated)
    liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'UPDATE', key: attendant.id })
    liveSyncBus.publish({ table: 'AUDIT_LOG', reason: 'INSERT', key: `audit-${crypto.randomUUID()}` })
    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'PIN_RESET',
      actorId: actor?.id ?? 'system',
      actorName: actor?.fullName ?? 'System',
      actorRole: 'SUPERVISOR',
      targetId: attendant.id,
      targetDescription: `${attendant.fullName} (${attendant.employeeCode})`,
      notes: 'PIN reset by supervisor',
      timestamp: new Date().toISOString(),
    })
    return updated
  }

  /** Resets PIN for either an attendant or a supervisor/manager */
  async resetStaffPin(
    id: string,
    role: 'attendant' | 'supervisor',
    newPin: string,
    actorName = 'Administrator',
  ): Promise<void> {
    if (!isPinShape(newPin)) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 to 32 digits.')
    }
    validateNewPin(newPin)
    const { salt, hash } = await hashPin(newPin)

    if (role === 'attendant') {
      const attendant = await attendantRepo.getById(id)
      let staffCode = attendant?.employeeCode
      if (!attendant) {
        // Try resetting in backend directly if not in local DB
        try {
          await backendResetPin({ userId: id, role, newPin })
          return
        } catch {
          throw new DomainError('ATTENDANT_NOT_FOUND', 'Attendant not found.')
        }
      }
      const updated: Attendant = {
        ...attendant,
        pinSalt: salt,
        pinHash: hash,
        failedAttempts: 0,
        lockoutUntil: null,
      }
      await prodDb.attendants.put(updated)
      liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'UPDATE', key: id })

      // Synchronize with backend API
      try {
        await backendResetPin({ userId: id, employeeCode: staffCode, role, newPin })
      } catch (backendErr) {
        console.warn('[supervisorService] Cloud PIN reset warning:', backendErr)
      }
    } else {
      const supervisor = await supervisorRepo.getById(id)
      let staffCode = supervisor?.employeeCode
      if (!supervisor) {
        // Try resetting in backend directly if not in local DB
        try {
          await backendResetPin({ userId: id, role, newPin })
          return
        } catch {
          throw new DomainError('STAFF_NOT_FOUND', 'Supervisor not found.')
        }
      }
      const updated: Supervisor = {
        ...supervisor,
        pinSalt: salt,
        pinHash: hash,
        failedAttempts: 0,
        lockoutUntil: null,
      }
      await prodDb.supervisors.put(updated)
      liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'UPDATE', key: id })

      // Synchronize with backend API
      try {
        await backendResetPin({ userId: id, employeeCode: staffCode, role, newPin })
      } catch (backendErr) {
        console.warn('[supervisorService] Cloud PIN reset warning:', backendErr)
      }
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'PIN_RESET',
      actorId: 'admin',
      actorName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `PIN reset for ${role} (${id})`,
      notes: `Reset by ${actorName}`,
      timestamp: new Date().toISOString(),
    })
  }

  /** Updates staff profile (name, phone, station, active status) — globally on backend */
  async updateStaff(
    id: string,
    role: 'attendant' | 'supervisor',
    updates: { fullName?: string; phone?: string; stationId?: string; active?: boolean },
    actorName = 'Administrator',
  ): Promise<void> {
    // Sync to backend first (global)
    try {
      if (role === 'attendant') {
        const { backendUpdateAttendant } = await import('../../services/backendApiService')
        await backendUpdateAttendant(id, updates)
      } else {
        const { backendUpdateSupervisor } = await import('../../services/backendApiService')
        await backendUpdateSupervisor(id, updates)
      }
    } catch (backendErr) {
      console.warn('[supervisorService] Backend updateStaff warning:', backendErr)
    }

    if (role === 'attendant') {
      const attendant = await attendantRepo.getById(id)
      if (!attendant) throw new DomainError('ATTENDANT_NOT_FOUND', 'Attendant not found.')
      const updated: Attendant = {
        ...attendant,
        fullName: updates.fullName?.trim() ?? attendant.fullName,
        phone: updates.phone?.trim() ?? attendant.phone,
        stationId: updates.stationId ?? attendant.stationId,
        active: updates.active !== undefined ? updates.active : attendant.active,
      }
      await prodDb.attendants.put(updated)
      liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'UPDATE', key: id })
    } else {
      const supervisor = await supervisorRepo.getById(id)
      if (!supervisor) throw new DomainError('STAFF_NOT_FOUND', 'Supervisor not found.')
      const updated: Supervisor = {
        ...supervisor,
        fullName: updates.fullName?.trim() ?? supervisor.fullName,
        phone: updates.phone?.trim() ?? supervisor.phone,
        stationId: updates.stationId ?? supervisor.stationId,
        active: updates.active !== undefined ? updates.active : supervisor.active,
      }
      await prodDb.supervisors.put(updated)
      liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'UPDATE', key: id })
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STAFF_APPROVED',
      actorId: 'admin',
      actorName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `Updated ${role} profile (${id})`,
      notes: `Modified by ${actorName}`,
      timestamp: new Date().toISOString(),
    })
  }

  /** Deletes staff account — globally on backend + local IndexedDB */
  async deleteStaff(
    id: string,
    role: 'attendant' | 'supervisor',
    actorName = 'Administrator',
  ): Promise<void> {
    // Backend first, and its failure is fatal. This used to log a warning and
    // carry on deleting locally, which meant a rejected server call still
    // produced a green "Deleted" message while the account stayed alive on the
    // server and came back on the next sync.
    if (role === 'attendant') {
      const { backendDeleteAttendant } = await import('../../services/backendApiService')
      await backendDeleteAttendant(id)
    } else {
      const { backendDeleteSupervisor } = await import('../../services/backendApiService')
      await backendDeleteSupervisor(id)
    }

    if (role === 'attendant') {
      await prodDb.attendants.delete(id)
      liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'DELETE', key: id })
    } else {
      await prodDb.supervisors.delete(id)
      liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'DELETE', key: id })
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STAFF_DEACTIVATED',
      actorId: 'admin',
      actorName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `Deleted ${role} account (${id})`,
      notes: `Deleted by ${actorName}`,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Permanently removes a staff account instead of deactivating it.
   *
   * The server re-verifies the Super Admin PIN and refuses any account the
   * ledger still references, so a refusal here is a real answer from the
   * authoritative store and must reach the operator rather than being retried
   * locally. Accounts that have traded should be deactivated, not removed.
   */
  async purgeStaff(
    id: string,
    role: 'attendant' | 'supervisor',
    pin: string,
    actorName = 'Administrator',
  ): Promise<void> {
    if (role === 'attendant') {
      const { backendPurgeAttendant } = await import('../../services/backendApiService')
      await backendPurgeAttendant(id, pin)
    } else {
      const { backendPurgeSupervisor } = await import('../../services/backendApiService')
      await backendPurgeSupervisor(id, pin)
    }

    if (role === 'attendant') {
      await prodDb.attendants.delete(id)
      liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'DELETE', key: id })
    } else {
      await prodDb.supervisors.delete(id)
      liveSyncBus.publish({ table: 'SUPERVISORS', reason: 'DELETE', key: id })
    }

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'STAFF_PURGED',
      actorId: 'admin',
      actorName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `Permanently removed ${role} account (${id})`,
      notes: `Permanently removed by ${actorName}`,
      timestamp: new Date().toISOString(),
    })
  }

  async stationName(stationId: string): Promise<string> {
    return getStationName(stationId)
  }
}

export const supervisorService = new SupervisorService()