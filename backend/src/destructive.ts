import { db } from './db'
import { ENV } from './config'
import { isSecretShape, verifyPin } from './auth'

export const SUPER_ADMIN_EMPLOYEE_CODE = 'SUPER-ADMIN'

/**
 * Re-authenticates an irreversible action against the SUPER-ADMIN credential.
 *
 * Holding a super admin session is not by itself sufficient evidence that the
 * person at the keyboard wants a permanent change. Sessions are long lived, and
 * a borrowed or unattended session must not be able to remove accounts or
 * overwrite the ledger. This mirrors the check /api/auth/wipe-database already
 * requires, so every destructive path in the app has the same bar.
 */
export function superAdminPinAccepted(pin: unknown): boolean {
  if (typeof pin !== 'string' || !isSecretShape(pin)) return false
  const admin = db.prepare('SELECT pinSalt, pinHash FROM supervisors WHERE employeeCode = ? COLLATE NOCASE').get(SUPER_ADMIN_EMPLOYEE_CODE) as
    | { pinSalt: string; pinHash: string }
    | undefined
  if (!admin) return false
  return verifyPin(pin, admin.pinSalt, admin.pinHash)
}

export function destructiveOperationsEnabled(): boolean {
  return ENV.ENABLE_DESTRUCTIVE_OPERATIONS
}

/**
 * How much of the ledger still points at this attendant.
 *
 * Removing an attendant that has run shifts would leave sales rows and closed
 * shifts referencing an account that no longer exists, which quietly breaks
 * attribution in every historical report. Those accounts are deactivated
 * instead so the money stays attributable to a real person.
 */
export function attendantFinancialFootprint(attendantId: string): { shifts: number; transactions: number } {
  const shifts = (db.prepare('SELECT COUNT(*) AS c FROM shifts WHERE attendantId = ?').get(attendantId) as { c: number }).c
  const transactions = (db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE attendantId = ?').get(attendantId) as { c: number }).c
  return { shifts, transactions }
}

/**
 * Supervisors own no ledger rows, so the only thing a hard delete can orphan is
 * the record of which accounts they approved. Stations reference a supervisor
 * by display name, not by id, so there is no foreign key to break there.
 */
export function supervisorApprovalFootprint(supervisorId: string): { approvedAccounts: number } {
  const approvedAccounts =
    ((db.prepare('SELECT COUNT(*) AS c FROM attendants WHERE approvedBy = ?').get(supervisorId) as { c: number }).c) +
    ((db.prepare('SELECT COUNT(*) AS c FROM supervisors WHERE approvedBy = ?').get(supervisorId) as { c: number }).c)
  return { approvedAccounts }
}
