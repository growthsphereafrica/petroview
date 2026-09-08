/**
 * Staff Code Generation Service.
 * Automatically generates sequential employee codes per Oil Marketing Company:
 * Format: {SHORTCODE}{001...999}{A|M} (e.g. GOIL001A, GOIL002M, PV001A, TOT001A, ZEN001A).
 */

import { prodDb } from '../infra/db'
import type { UnifiedRole } from '../domain/types'

export async function generateNextStaffCode(
  role: 'attendant' | 'supervisor',
  companyShortCode = 'PV',
): Promise<string> {
  try {
    const prefix = companyShortCode.trim().toUpperCase() || 'PV'

    const [attendants, supervisors] = await Promise.all([
      prodDb.attendants.toArray(),
      prodDb.supervisors.toArray(),
    ])

    let maxIndex = 0

    const allCodes = [
      ...attendants.map(a => a.employeeCode),
      ...supervisors.map(s => s.employeeCode),
    ]

    const pattern = new RegExp(`^${prefix}(\\d+)[AM]?$`, 'i')

    for (const code of allCodes) {
      const match = code.match(pattern)
      if (match) {
        const val = parseInt(match[1], 10)
        if (!isNaN(val) && val > maxIndex) {
          maxIndex = val
        }
      }
    }

    const nextIndex = maxIndex + 1
    const padded = String(nextIndex).padStart(3, '0')
    const suffix = role === 'attendant' ? 'A' : 'M'

    return `${prefix}${padded}${suffix}`
  } catch {
    const prefix = companyShortCode.trim().toUpperCase() || 'PV'
    const suffix = role === 'attendant' ? 'A' : 'M'
    return `${prefix}001${suffix}`
  }
}

/**
 * Returns role type inferred from employee code:
 * - SUPER-ADMIN or PETRO-MASTER -> 'superadmin'
 * - ...-HQ... or HQ-... -> 'headoffice'
 * - ...M or SUP... -> 'supervisor'
 * - ...A or ATT... -> 'attendant'
 */
export function inferRoleFromCode(code: string): UnifiedRole {
  const trimmed = code.trim().toUpperCase()

  if (trimmed === 'SUPER-ADMIN' || trimmed === 'PETRO-MASTER' || trimmed.startsWith('SUPER-')) {
    return 'superadmin'
  }

  if (trimmed.includes('HQ') || trimmed.startsWith('ADMIN') || trimmed === 'HQ-ADMIN') {
    return 'headoffice'
  }

  if (trimmed.endsWith('M') || trimmed.startsWith('SUP') || trimmed.startsWith('MGR')) {
    return 'supervisor'
  }

  return 'attendant'
}
