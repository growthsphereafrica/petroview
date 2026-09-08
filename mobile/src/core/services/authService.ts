/**
 * Authentication for the universal build — PBKDF2-hashed PINs, brute-force
 * lockout, short-lived session tokens. Same rules as the web authService.
 */

import { DomainError } from './shiftService'
import { keys, sGet, sSet } from '../store/storage'
import { verifyPin } from '../infra/password'
import { MAX_PIN_ATTEMPTS, LOCKOUT_MS, SESSION_TTL_MS, uid } from '../domain/config'
import type { Attendant, AttendantSession, Supervisor, SupervisorSession } from '../domain/types'
import {
  findAttendantByCode,
  findSupervisorByCode,
  updateAttendantAttempts,
  createSession,
  findSessionByToken,
  deleteSession,
} from '../infra/repositories'

export type MobileRole = 'attendant' | 'supervisor'

export interface AuthenticateResult {
  role: MobileRole
  attendant?: Attendant
  supervisor?: Supervisor
  session: AttendantSession | SupervisorSession
}

export class MobileAuthService {
  async authenticate(employeeCode: string, pin: string): Promise<AuthenticateResult> {
    if (!/^\d{4}$/.test(pin)) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'PIN must be 4 digits.')
    }
    const code = employeeCode.trim().toUpperCase()

    if (code.startsWith('SUP')) {
      const supervisor = await findSupervisorByCode(code)
      if (!supervisor) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.')
      const ok = await verifyPin(pin, supervisor.pinSalt, supervisor.pinHash)
      if (!ok) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.')
      const session: SupervisorSession = {
        id: uid('sess'),
        token: `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
        supervisorId: supervisor.id,
        employeeCode: supervisor.employeeCode,
        fullName: supervisor.fullName,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      }
      await createSession(session)
      await sSet(keys.sessionToken, session.token)
      return { role: 'supervisor', supervisor, session }
    }

    const attendant = await findAttendantByCode(code)
    if (!attendant) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.')
    if (!attendant.active) throw new DomainError('AUTH_ACCOUNT_DISABLED', 'Account deactivated.')
    if (attendant.lockoutUntil && new Date(attendant.lockoutUntil).getTime() > Date.now()) {
      throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Account locked.')
    }

    const ok = await verifyPin(pin, attendant.pinSalt, attendant.pinHash)
    if (!ok) {
      attendant.failedAttempts += 1
      if (attendant.failedAttempts >= MAX_PIN_ATTEMPTS) {
        attendant.lockoutUntil = new Date(Date.now() + LOCKOUT_MS).toISOString()
        attendant.failedAttempts = 0
      }
      await updateAttendantAttempts(attendant)
      if (attendant.lockoutUntil) throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Account locked.')
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials.')
    }

    if (attendant.failedAttempts > 0 || attendant.lockoutUntil) {
      attendant.failedAttempts = 0
      attendant.lockoutUntil = null
      await updateAttendantAttempts(attendant)
    }

    const session: AttendantSession = {
      id: uid('sess'),
      token: `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
      attendantId: attendant.id,
      employeeCode: attendant.employeeCode,
      fullName: attendant.fullName,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }
    await createSession(session)
    await sSet(keys.sessionToken, session.token)
    return { role: 'attendant', attendant, session }
  }

  async restore(): Promise<AuthenticateResult | null> {
    const token = await sGet<string>(keys.sessionToken)
    if (!token) return null
    const session = await findSessionByToken(token)
    if (!session) return null
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await deleteSession(token)
      await sSet(keys.sessionToken, null as never)
      return null
    }
    if ('attendantId' in session) {
      const { getAttendant } = await import('../infra/repositories')
      const attendant = await getAttendant(session.attendantId)
      if (!attendant || !attendant.active) return null
      return { role: 'attendant', attendant, session }
    }
    const { getSupervisor } = await import('../infra/repositories')
    const supervisor = await getSupervisor(session.supervisorId)
    if (!supervisor) return null
    return { role: 'supervisor', supervisor, session }
  }

  async logout(): Promise<void> {
    const token = await sGet<string>(keys.sessionToken)
    if (token) await deleteSession(token)
    await sSet(keys.sessionToken, null as never)
  }
}

export const mobileAuth = new MobileAuthService()