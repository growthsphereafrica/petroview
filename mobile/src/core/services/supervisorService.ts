/**
 * Native supervisor service — review shifts, manage attendants, audit trail.
 * Mirrors the web build's supervisorService with identical business rules.
 */

import { DomainError } from '../domain/errors'
import { uid } from '../domain/config'
import { hashPin } from '../infra/password'
import type { AuditEntry, Shift } from '../domain/types'
import {
  listShifts,
  saveShift,
  listSyncQueue,
  updateSyncItem,
  listAttendants,
  upsertAttendant,
  findAttendantByCode,
  addAudit,
  listAudit,
} from '../infra/repositories'

export type ReviewDecision = 'APPROVED' | 'REJECTED'

export interface Reviewer {
  id: string
  name: string
  code: string
}

export class SupervisorService {
  async listShifts(): Promise<Shift[]> {
    const all = await listShifts()
    return all.slice().sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
  }

  async reviewShift(shiftId: string, decision: ReviewDecision, reviewer: Reviewer, notes?: string): Promise<Shift> {
    const shift = await listShifts().then(all => all.find(s => s.id === shiftId))
    if (!shift) throw new DomainError('SHIFT_NOT_FOUND', 'Shift not found.')
    if (shift.status !== 'CLOSED') throw new DomainError('SHIFT_NOT_REVIEWABLE', 'Only closed shifts can be reviewed.')

    const now = new Date().toISOString()
    const reviewed: Shift = {
      ...shift,
      status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      reviewNotes: notes ?? null,
      reviewedBy: reviewer.name,
      reviewedAt: now,
      updatedAt: now,
      version: shift.version + 1,
    }
    await saveShift(reviewed)

    // Keep the queued upload payload in sync with the reviewed state.
    const queue = await listSyncQueue()
    const item = queue.find(i => i.type === 'SHIFT' && i.refId === shiftId)
    if (item) {
      await updateSyncItem({ ...item, payload: reviewed, updatedAt: now })
    }

    await addAudit({
      id: uid('audit'),
      action: decision === 'APPROVED' ? 'REVIEW_APPROVED' : 'REJECTED',
      actorId: reviewer.id,
      actorRole: 'SUPERVISOR',
      targetId: shiftId,
      notes: notes
        ? `${decision} shift ${shift.number} — ${notes}`
        : `${decision} shift ${shift.number}`,
      timestamp: now,
    })
    return reviewed
  }

  async resetAttendantPin(employeeCode: string, newPin: string, reviewer: Reviewer): Promise<void> {
    if (!/^\d{4}$/.test(newPin)) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 digits.')
    const attendant = await findAttendantByCode(employeeCode)
    if (!attendant) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Attendant not found.')
    const { salt, hash } = await hashPin(newPin)
    await upsertAttendant({ ...attendant, pinSalt: salt, pinHash: hash, failedAttempts: 0, lockoutUntil: null })
    await addAudit({
      id: uid('audit'),
      action: 'PIN_RESET',
      actorId: reviewer.id,
      actorRole: 'SUPERVISOR',
      targetId: attendant.id,
      notes: `PIN reset for ${attendant.employeeCode} (${attendant.fullName})`,
      timestamp: new Date().toISOString(),
    })
  }

  async registerAttendant(input: { employeeCode: string; fullName: string; pin: string; pumpId?: string; stationId?: string }, actor: Reviewer): Promise<void> {
    const code = input.employeeCode.trim().toUpperCase()
    if (!/^ATT\d{4}$/.test(code)) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Code must be ATT followed by 4 digits (e.g. ATT1005).')
    }
    if (!input.fullName.trim()) throw new DomainError('UNKNOWN', 'Full name is required.')
    if (!/^\d{4}$/.test(input.pin)) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 digits.')
    if (await findAttendantByCode(code)) {
      throw new DomainError('ATTENDANT_CODE_EXISTS', 'An attendant with this employee code is already registered.')
    }
    const { salt, hash } = await hashPin(input.pin)
    await upsertAttendant({
      id: uid('att'),
      employeeCode: code,
      fullName: input.fullName.trim(),
      pinSalt: salt,
      pinHash: hash,
      pumpId: input.pumpId ?? 'pump-1',
      stationId: input.stationId ?? 'STN-GV-042',
      active: true,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: new Date().toISOString(),
    })
    await addAudit({
      id: uid('audit'),
      action: 'ATTENDANT_REGISTERED',
      actorId: actor.id,
      actorRole: 'SUPERVISOR',
      targetId: code,
      notes: `Registered ${code} — ${input.fullName.trim()}`,
      timestamp: new Date().toISOString(),
    })
  }

  async deactivateAttendant(employeeCode: string, actor: Reviewer): Promise<void> {
    const attendant = await findAttendantByCode(employeeCode)
    if (!attendant) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Attendant not found.')
    await upsertAttendant({ ...attendant, active: false })
    await addAudit({
      id: uid('audit'),
      action: 'ATTENDANT_DEACTIVATED',
      actorId: actor.id,
      actorRole: 'SUPERVISOR',
      targetId: attendant.id,
      notes: `Deactivated ${attendant.employeeCode} (${attendant.fullName})`,
      timestamp: new Date().toISOString(),
    })
  }

  async auditLog(): Promise<AuditEntry[]> {
    return listAudit()
  }
}

export const supervisorService = new SupervisorService()