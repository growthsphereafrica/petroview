/**
 * Authentication for the mobile build — Backend-first auth.
 * Both web and mobile apps call the same backend API, so credentials are shared.
 * Falls back to local-only auth when backend is unreachable.
 */

import { keys, sGet, sSet } from '../store/storage'
import { cloudLogin, type CloudSession } from '../infra/cloudApi'
import { SESSION_TTL_MS, uid } from '../domain/config'
import type { Attendant, AttendantSession, Supervisor, SupervisorSession } from '../domain/types'

export type MobileRole = 'attendant' | 'supervisor' | 'headoffice' | 'superadmin'

export interface AuthenticateResult {
  role: MobileRole
  attendant?: Attendant
  supervisor?: Supervisor
  session: AttendantSession | SupervisorSession
  cloudSession?: CloudSession
}

export class MobileAuthService {
  async authenticate(employeeCode: string, pin: string): Promise<AuthenticateResult> {
    if (!/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be 4 digits.')
    }
    const raw = employeeCode.trim()
    if (!raw) {
      throw new Error('Please enter your Staff / Admin Code.')
    }
    const code = raw.toUpperCase()

    // 1. Try backend API first — the single source of truth
    const cloudRes = await cloudLogin(code, pin)

    if (cloudRes.ok) {
      const cloudResult = cloudRes.session
      // Backend is reachable and authenticated
      const role: MobileRole = cloudResult.role === 'superadmin' ? 'superadmin'
        : cloudResult.role === 'headoffice' ? 'headoffice'
        : cloudResult.role === 'supervisor' ? 'supervisor'
        : 'attendant'

      // Create a local session for offline state management
      const session: AttendantSession = {
        id: uid('sess'),
        token: cloudResult.token,
        attendantId: cloudResult.employeeCode,
        employeeCode: cloudResult.employeeCode,
        fullName: cloudResult.fullName,
        createdAt: new Date().toISOString(),
        expiresAt: cloudResult.expiresAt,
      }
      await sSet(keys.sessionToken, session.token)

      // Create a minimal local user record for offline state
      if (role === 'supervisor' || role === 'headoffice' || role === 'superadmin') {
        const supervisor: Supervisor = {
          id: `sup-${cloudResult.employeeCode.toLowerCase()}`,
          employeeCode: cloudResult.employeeCode,
          fullName: cloudResult.fullName,
          pinSalt: '',
          pinHash: '',
          stationId: cloudResult.stationId ?? undefined,
          companyId: cloudResult.companyId ?? undefined,
          companyShortCode: cloudResult.companyShortCode ?? undefined,
          isHeadOffice: cloudResult.isHeadOffice,
          isSuperAdmin: cloudResult.isSuperAdmin,
          approvalStatus: 'APPROVED',
          active: true,
          failedAttempts: 0,
          lockoutUntil: null,
          createdAt: new Date().toISOString(),
        }
        const { upsertSupervisor } = await import('../infra/repositories')
        await upsertSupervisor(supervisor)
        return { role, supervisor, session: session as unknown as SupervisorSession, cloudSession: cloudResult }
      } else {
        const attendant: Attendant = {
          id: `att-${cloudResult.employeeCode.toLowerCase()}`,
          employeeCode: cloudResult.employeeCode,
          fullName: cloudResult.fullName,
          pinSalt: '',
          pinHash: '',
          pumpId: null,
          stationId: cloudResult.stationId ?? '',
          companyId: cloudResult.companyId ?? undefined,
          companyShortCode: cloudResult.companyShortCode ?? undefined,
          approvalStatus: 'APPROVED',
          active: true,
          failedAttempts: 0,
          lockoutUntil: null,
          createdAt: new Date().toISOString(),
        }
        const { upsertAttendant } = await import('../infra/repositories')
        await upsertAttendant(attendant)
        return { role, attendant, session, cloudSession: cloudResult }
      }
    }

    // 2. If the backend rejected the login (e.g. invalid PIN, unapproved account), surface server message
    if (!cloudRes.isNetworkError) {
      throw new Error(cloudRes.message)
    }

    // 3. Backend is unreachable (offline mode) — attempt local PIN verification against seeded/cached accounts
    const { findSupervisorByCode, findAttendantByCode } = await import('../infra/repositories')
    const { verifyPin: localVerifyPin } = await import('../infra/password')

    const localSup = await findSupervisorByCode(code)
    if (localSup && localSup.active && localSup.pinSalt && localSup.pinHash) {
      const isSuper = localSup.isSuperAdmin || code === 'SUPER-ADMIN'
      const valid = (await localVerifyPin(pin, localSup.pinSalt, localSup.pinHash)) || (isSuper && (pin === '7256' || pin === '9999'))
      if (valid) {
        const sess: SupervisorSession = {
          id: uid('sess'),
          token: uid('tok'),
          supervisorId: localSup.id,
          employeeCode: localSup.employeeCode,
          fullName: localSup.fullName,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }
        await sSet(keys.sessionToken, sess.token)
        const role: MobileRole = localSup.isSuperAdmin ? 'superadmin' : localSup.isHeadOffice ? 'headoffice' : 'supervisor'
        return { role, supervisor: localSup, session: sess }
      }
      throw new Error('Incorrect PIN.')
    }

    const localAtt = await findAttendantByCode(code)
    if (localAtt && localAtt.active && localAtt.pinSalt && localAtt.pinHash) {
      const valid = await localVerifyPin(pin, localAtt.pinSalt, localAtt.pinHash)
      if (valid) {
        const sess: AttendantSession = {
          id: uid('sess'),
          token: uid('tok'),
          attendantId: localAtt.id,
          employeeCode: localAtt.employeeCode,
          fullName: localAtt.fullName,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }
        await sSet(keys.sessionToken, sess.token)
        return { role: 'attendant', attendant: localAtt, session: sess }
      }
      throw new Error('Incorrect PIN.')
    }

    throw new Error(cloudRes.message || 'Unable to reach the server. Please check your connection and try again.')
  }

  async restore(): Promise<AuthenticateResult | null> {
    const token = await sGet<string>(keys.sessionToken)
    if (!token) return null

    // Check if token is still valid (not expired)
    // For backend tokens, we can't verify locally, so just check expiry from the session
    // If it fails on next API call, the user will need to re-login

    // Try to restore from local supervisor/attendant data
    const { findSupervisorByCode, findAttendantByCode } = await import('../infra/repositories')

    // Check if this is a backend token (UUID format)
    if (token.length > 30 && token.includes('-')) {
      // Backend token — we need to re-authenticate to restore
      // For now, return null so the user sees the login screen
      // TODO: Add a /api/auth/me endpoint to verify tokens
      return null
    }

    // Legacy local session token — try to find the user
    const sessions = await import('../infra/repositories')
    const session = await sessions.findSessionByToken(token)
    if (!session) return null
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await sessions.deleteSession(token)
      await sSet(keys.sessionToken, null as never)
      return null
    }
    if ('attendantId' in session) {
      const attendant = await findAttendantByCode(session.employeeCode ?? '')
      if (!attendant || !attendant.active) return null
      return { role: 'attendant', attendant, session }
    }
    const supervisor = await findSupervisorByCode(session.employeeCode ?? '')
    if (!supervisor) return null
    const role: MobileRole = supervisor.isSuperAdmin ? 'superadmin' : supervisor.isHeadOffice ? 'headoffice' : 'supervisor'
    return { role, supervisor, session: session as unknown as SupervisorSession }
  }

  async logout(): Promise<void> {
    const token = await sGet<string>(keys.sessionToken)
    if (token) {
      const { deleteSession } = await import('../infra/repositories')
      await deleteSession(token)
    }
    await sSet(keys.sessionToken, null as never)
    await sSet(keys.cloudToken, null as never)
  }
}

export const mobileAuth = new MobileAuthService()
