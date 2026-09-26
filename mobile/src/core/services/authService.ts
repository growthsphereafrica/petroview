import { keys, sDel, sGet, sSet } from '../store/storage'
import { cloudGetMe, cloudLogin, cloudLogout, type CloudSession } from '../infra/cloudApi'

export type MobileRole = 'attendant' | 'supervisor'

export type AuthenticatedCloudSession = CloudSession & {
  role: 'attendant' | 'supervisor'
  stationId: string
  companyId: string
  companyShortCode: string | null
}

export interface AuthenticateResult {
  role: 'attendant' | 'supervisor'
  session: AuthenticatedCloudSession
}

function isStoredSession(value: unknown): value is AuthenticatedCloudSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<CloudSession>
  return typeof session.token === 'string' && session.token.length > 0
    && typeof session.userId === 'string' && session.userId.length > 0
    && (session.role === 'attendant' || session.role === 'supervisor')
    && typeof session.employeeCode === 'string' && session.employeeCode.length > 0
    && typeof session.fullName === 'string' && session.fullName.length > 0
    && typeof session.stationId === 'string' && session.stationId.length > 0
    && typeof session.companyId === 'string' && session.companyId.length > 0
    && (session.companyShortCode === null || typeof session.companyShortCode === 'string')
    && typeof session.expiresAt === 'string'
    && Number.isFinite(Date.parse(session.expiresAt))
}

export class MobileAuthService {
  private async clearLocalSession(): Promise<void> {
    await Promise.all([
      sDel(keys.activeSession),
      sDel(keys.cloudToken),
      sDel(keys.sessionToken),
      sDel(keys.sessions),
    ])
  }

  private async persistSession(session: CloudSession): Promise<void> {
    await Promise.all([
      sSet(keys.cloudToken, session.token),
      sSet(keys.activeSession, session),
    ])
  }

  async authenticate(employeeCode: string, pin: string): Promise<AuthenticateResult> {
    if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits.')
    const code = employeeCode.trim().toUpperCase()
    if (!code) throw new Error('Please enter your Staff / Admin Code.')

    const result = await cloudLogin(code, pin)
    if (!result.ok) throw new Error(result.message)

    const session = result.session
    if (session.role !== 'attendant' && session.role !== 'supervisor') {
      await cloudLogout()
      await this.clearLocalSession()
      throw new Error('This mobile app is exclusively for Forecourt Attendants and Station Supervisors.')
    }
    if (!session.stationId || !session.companyId || session.isHeadOffice || session.isSuperAdmin) {
      await cloudLogout()
      await this.clearLocalSession()
      throw new Error('Your account is not assigned to an active forecourt station.')
    }

    const authenticatedSession: AuthenticatedCloudSession = {
      ...session,
      role: session.role,
      stationId: session.stationId,
      companyId: session.companyId,
    }
    await this.persistSession(authenticatedSession)
    return { role: authenticatedSession.role, session: authenticatedSession }
  }

  async restore(): Promise<AuthenticateResult | null> {
    const session = await sGet<CloudSession>(keys.activeSession)
    const token = await sGet<string>(keys.cloudToken)
    if (!session || !token || session.token !== token || !isStoredSession(session) || Date.parse(session.expiresAt) <= Date.now()) {
      await this.clearLocalSession()
      return null
    }

    const result = await cloudGetMe()
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        await this.clearLocalSession()
        return null
      }
      throw new Error(result.message)
    }

    const account = result.account
    const role = account.role
    if (role !== 'attendant' && role !== 'supervisor') {
      await cloudLogout()
      await this.clearLocalSession()
      return null
    }
    if (!account.stationId || !account.companyId) {
      await cloudLogout()
      await this.clearLocalSession()
      return null
    }
    if (account.userId !== session.userId
      || role !== session.role
      || account.employeeCode !== session.employeeCode
      || account.stationId !== session.stationId
      || account.companyId !== session.companyId) {
      await cloudLogout()
      await this.clearLocalSession()
      throw new Error('Your account scope changed. Please sign in again.')
    }

    const refreshed: AuthenticatedCloudSession = {
      ...account,
      token: session.token,
      role,
      stationId: account.stationId,
      companyId: account.companyId,
    }
    await this.persistSession(refreshed)
    return { role, session: refreshed }
  }

  async logout(): Promise<void> {
    try {
      await cloudLogout()
    } finally {
      await this.clearLocalSession()
    }
  }
}

export const mobileAuth = new MobileAuthService()
