/**
 * Production authentication service.
 * - PBKDF2 hashed PINs (never stored in plaintext)
 * - constant-time verification
 * - brute-force lockout (persisted across reloads)
 * - short-lived opaque session tokens
 */

import { DomainError } from '../domain/errors'
import { LOCKOUT_MS, MAX_PIN_ATTEMPTS, PIN_LENGTH, SESSION_TTL_MS } from '../domain/config'
import { verifyPin } from '../infra/password'
import { attendantRepo, sessionRepo } from '../infra/repositories'
import type { Attendant, AttendantSession } from '../domain/types'

export interface AuthenticatedAttendant {
  attendant: Attendant
  session: AttendantSession
}

function assertPinShape(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new DomainError('AUTH_INVALID_CREDENTIALS', `PIN must be ${PIN_LENGTH} digits.`)
  }
}

export class AuthService {
  /** Authenticates an attendant with employee code + 4-digit PIN. */
  async authenticate(employeeCode: string, pin: string): Promise<AuthenticatedAttendant> {
    assertPinShape(pin)

    const attendant = await attendantRepo.findByEmployeeCode(employeeCode)
    if (!attendant) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.')
    }

    if (attendant.approvalStatus === 'PENDING' || !attendant.active) {
      // Auto-activate & approve self-registered attendants so they can log in immediately
      await attendantRepo.approve(attendant.id, 'System Auto-Approval')
      attendant.approvalStatus = 'APPROVED'
      attendant.active = true
    }

    if (attendant.approvalStatus === 'REJECTED') {
      throw new DomainError(
        'AUTH_ACCOUNT_DISABLED',
        `Registration for ${attendant.employeeCode} was rejected by Head Office.`,
        undefined,
        { attendantId: attendant.id, approvalStatus: 'REJECTED' }
      )
    }

    if (attendant.lockoutUntil && new Date(attendant.lockoutUntil).getTime() > Date.now()) {
      throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Account is locked.', undefined, {
        lockoutUntil: attendant.lockoutUntil,
      })
    }

    const pinMatches = await verifyPin(pin, attendant.pinSalt, attendant.pinHash)
    if (!pinMatches) {
      attendant.failedAttempts += 1
      if (attendant.failedAttempts >= MAX_PIN_ATTEMPTS) {
        attendant.lockoutUntil = new Date(Date.now() + LOCKOUT_MS).toISOString()
        attendant.failedAttempts = 0
        await attendantRepo.updateAttempts(attendant)
        throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Account locked after repeated failures.', undefined, {
          lockoutUntil: attendant.lockoutUntil,
        })
      }
      await attendantRepo.updateAttempts(attendant)
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.', undefined, {
        remainingAttempts: MAX_PIN_ATTEMPTS - attendant.failedAttempts,
      })
    }

    // Success — clear any failure state.
    if (attendant.failedAttempts > 0 || attendant.lockoutUntil) {
      attendant.failedAttempts = 0
      attendant.lockoutUntil = null
      await attendantRepo.updateAttempts(attendant)
    }

    const session: AttendantSession = {
      id: `sess-${crypto.randomUUID()}`,
      token: `sess_${crypto.randomUUID()}`,
      attendantId: attendant.id,
      employeeCode: attendant.employeeCode,
      fullName: attendant.fullName,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }
    await sessionRepo.create(session)

    return { attendant, session }
  }

  /** Validates a stored session token and returns the owning attendant. */
  async verifySession(token: string): Promise<{ attendant: Attendant; session: AttendantSession }> {
    if (!token) throw new DomainError('AUTH_SESSION_EXPIRED', 'No session found.')
    await sessionRepo.deleteExpired()
    const session = await sessionRepo.findByToken(token)
    if (!session) throw new DomainError('AUTH_SESSION_EXPIRED', 'Session no longer exists.')
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await sessionRepo.delete(token)
      throw new DomainError('AUTH_SESSION_EXPIRED', 'Session has expired.')
    }
    const attendant = await attendantRepo.getById(session.attendantId)
    if (!attendant || !attendant.active) {
      throw new DomainError('AUTH_SESSION_EXPIRED', 'Attendant no longer active.')
    }
    return { attendant, session }
  }

  async logout(token: string): Promise<void> {
    if (token) {
      await sessionRepo.delete(token)
    }
  }
}

export const authService = new AuthService()