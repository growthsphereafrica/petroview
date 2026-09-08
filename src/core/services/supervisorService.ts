/**
 * Production supervisor service.
 * - supervisor authentication (PBKDF2, lockout, sessions) — same hardening as attendants
 * - shift review workflow: closed shifts are approved or rejected with notes
 * - attendant registration & deactivation
 * - dashboard statistics
 */

import { DomainError } from '../domain/errors'
import { LOCKOUT_MS, MAX_PIN_ATTEMPTS, PIN_LENGTH, SESSION_TTL_MS } from '../domain/config'
import { verifyPin, hashPin } from '../infra/password'
import { prodDb } from '../infra/db'
import { attendantRepo, auditLogRepo, shiftRepo, supervisorRepo, supervisorSessionRepo } from '../infra/repositories'
import { liveSyncBus } from './liveSyncBus'
import { generateNextStaffCode } from './staffCodeService'
import { getStationName } from '../domain/config'
import type { AuditEntry, Attendant, Shift, ShiftStatus, Supervisor, SupervisorSession } from '../domain/types'

export interface SupervisorStats {
  shiftsToday: number
  salesToday: number
  litresToday: number
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
  if (!/^\d{4}$/.test(pin)) {
    throw new DomainError('AUTH_INVALID_CREDENTIALS', `PIN must be ${PIN_LENGTH} digits.`)
  }
}

export class SupervisorService {
  async authenticate(employeeCode: string, pin: string): Promise<AuthSupervisor> {
    assertPinShape(pin)
    const supervisor = await supervisorRepo.findByEmployeeCode(employeeCode)
    if (!supervisor) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.')

    if (supervisor.approvalStatus === 'PENDING') {
      throw new DomainError(
        'AUTH_ACCOUNT_DISABLED',
        `Manager account (${supervisor.employeeCode}) is pending HQ approval. Please contact Head Office.`,
        undefined,
        { supervisorId: supervisor.id, approvalStatus: 'PENDING' }
      )
    }

    if (supervisor.approvalStatus === 'REJECTED') {
      throw new DomainError(
        'AUTH_ACCOUNT_DISABLED',
        `Registration for Manager ${supervisor.employeeCode} was rejected by Head Office.`,
        undefined,
        { supervisorId: supervisor.id, approvalStatus: 'REJECTED' }
      )
    }

    if (!supervisor.active) throw new DomainError('AUTH_ACCOUNT_DISABLED', 'Account is deactivated.')
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

  /** All shifts across stations, newest first. */
  async listAllShifts(): Promise<Shift[]> {
    return shiftRepo.listAll()
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
   */
  async reviewShift(shiftId: string, verdict: Extract<ShiftStatus, 'APPROVED' | 'REJECTED'>, notes: string, reviewer?: Pick<Supervisor, 'id' | 'fullName'>): Promise<Shift> {
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

  async listAuditLog(): Promise<AuditEntry[]> {
    return auditLogRepo.list()
  }

  async dashboardStats(): Promise<SupervisorStats> {
    const all = await shiftRepo.listAll()
    const today = new Date().toISOString().slice(0, 10)
    const todayShifts = all.filter(s => (s.openedAt || '').slice(0, 10) === today)
    const closed = all.filter(s => s.closedAt)
    const todayClosed = closed.filter(s => (s.closedAt || '').slice(0, 10) === today)
    const attendants = await attendantRepo.listActive()

    return {
      shiftsToday: todayShifts.length,
      salesToday: Math.round(todayClosed.reduce((a, s) => a + s.actualTotal, 0)),
      litresToday: todayClosed.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0),
      pendingReviews: all.filter(s => s.status === 'CLOSED').length,
      activeAttendants: attendants.length,
      approved: closed.filter(s => s.status === 'APPROVED').length,
      rejected: closed.filter(s => s.status === 'REJECTED').length,
    }
  }

  async listAttendants(): Promise<Attendant[]> {
    const all = await attendantRepo.listActive()
    return all.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
  }

  async registerAttendant(input: { fullName: string; employeeCode: string; pin: string; pumpId: string; stationId?: string }, registrar?: Pick<Supervisor, 'id' | 'fullName'>): Promise<Attendant> {
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

    const { salt, hash } = await hashPin(input.pin)
    const stationId = input.stationId ?? 'STN-GV-042'
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
        pumpId: input.pumpId || null,
        stationId: input.stationId,
        companyId,
        companyShortCode: companyPrefix,
        phone: input.phone.trim() || '024 000 0000',
        approvalStatus: 'PENDING',
        approvedAt: null,
        approvedBy: null,
        active: false,
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
        approvalStatus: 'PENDING',
        approvedAt: null,
        approvedBy: null,
        active: false,
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

  /** Lists all pending staff waiting for HQ Super Admin approval, optionally scoped by company. */
  async listPendingStaff(companyId?: string): Promise<{ attendants: Attendant[]; supervisors: Supervisor[] }> {
    const [attendants, supervisors] = await Promise.all([
      attendantRepo.listPending(),
      supervisorRepo.listPending(),
    ])
    return {
      attendants: companyId ? attendants.filter(a => a.companyId === companyId) : attendants,
      supervisors: companyId ? supervisors.filter(s => s.companyId === companyId) : supervisors,
    }
  }

  /** Lists all staff across all stations with role & approval status, optionally scoped by company. */
  async listAllStaff(companyId?: string): Promise<{ attendants: Attendant[]; supervisors: Supervisor[] }> {
    const [attendants, supervisors] = await Promise.all([
      attendantRepo.listAll(),
      supervisorRepo.listAll(),
    ])
    const filteredAttendants = companyId ? attendants.filter(a => a.companyId === companyId) : attendants
    const filteredSupervisors = companyId ? supervisors.filter(s => s.companyId === companyId) : supervisors

    return {
      attendants: filteredAttendants.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)),
      supervisors: filteredSupervisors.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)),
    }
  }

  /** Approves a pending staff account (Attendant or Manager). */
  async approveStaff(id: string, role: 'attendant' | 'supervisor', approverName = 'HQ Super Admin'): Promise<void> {
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
      notes: 'Authorized by HQ Super Admin',
      timestamp: new Date().toISOString(),
    })
  }

  /** Rejects a pending staff account. */
  async rejectStaff(id: string, role: 'attendant' | 'supervisor', approverName = 'HQ Super Admin', reason?: string): Promise<void> {
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
      notes: reason || 'Rejected by HQ Super Admin',
      timestamp: new Date().toISOString(),
    })
  }

  async deactivateAttendant(id: string, actor?: Pick<Supervisor, 'id' | 'fullName'>): Promise<void> {
    const attendant = await attendantRepo.getById(id)
    if (!attendant) throw new DomainError('ATTENDANT_NOT_FOUND', 'Attendant not found.')
    await attendantRepo.deactivate(id)
    liveSyncBus.publish({ table: 'ATTENDANTS', reason: 'UPDATE', key: attendant.id })
    liveSyncBus.publish({ table: 'AUDIT_LOG', reason: 'INSERT', key: `audit-${crypto.randomUUID()}` })
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
    if (!/^\d{4}$/.test(newPin)) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 digits.')
    }
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

  async stationName(stationId: string): Promise<string> {
    return getStationName(stationId)
  }
}

export const supervisorService = new SupervisorService()