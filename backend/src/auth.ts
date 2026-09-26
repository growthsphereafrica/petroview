import crypto from 'node:crypto'
import { ENV } from './config'

/**
 * Credential policy.
 *
 * A 4-digit PIN is a 10,000-entry space, so the KDF cost is irrelevant: anyone
 * holding the SQLite file recovers every attendant PIN in hours on a GPU. New
 * credentials must therefore be at least MIN_SECRET_LENGTH digits, which takes
 * the space to 1,000,000.
 *
 * Login still accepts shorter values so that credentials issued before this
 * policy existed keep working. They should be reset to a compliant PIN, and the
 * write paths below will not issue another one.
 */
export const MIN_SECRET_LENGTH = 6
export const MAX_SECRET_LENGTH = 32

/**
 * PIN hashing scheme versions.
 *
 * v1 is the original scheme and is what every existing row in the database was
 * written with. v2 raises the iteration count and re-tags the input.
 *
 * Verification MUST accept both. Changing the derivation without a migration
 * path does not "upgrade" the stored hashes — it invalidates every credential
 * in the database and locks out every attendant, supervisor and the platform
 * admin on the next deploy. v1 is kept here solely so it can be verified and
 * then transparently rewritten to v2 on the next successful login.
 */
export type KdfVersion = 1 | 2
export const CURRENT_KDF_VERSION: KdfVersion = 2

const KDF_ITERATIONS: Record<KdfVersion, number> = {
  1: 210_000,
  2: ENV.PIN_KDF_ITERATIONS,
}

const KDF_TAGS: Record<KdfVersion, string> = {
  1: 'mvp-v1:',
  2: 'mvp-v2:',
}

export function isSecretShape(value: string): boolean {
  return /^\d{4,32}$/.test(value)
}

/** Validates a credential that is about to be stored. Throws with operator-facing text. */
export function validateNewSecret(value: string, field = 'pin'): string {
  if (!/^\d+$/.test(value)) throw new Error(`${field} must contain digits only.`)
  if (value.length < MIN_SECRET_LENGTH) throw new Error(`${field} must be at least ${MIN_SECRET_LENGTH} digits.`)
  if (value.length > MAX_SECRET_LENGTH) throw new Error(`${field} must be at most ${MAX_SECRET_LENGTH} digits.`)
  return value
}

export function hashPin(pin: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  return { salt, hash: derive(pin, salt, CURRENT_KDF_VERSION) }
}

export interface PinVerification {
  valid: boolean
  /** Which scheme matched, or null when nothing matched. */
  version: KdfVersion | null
}

/**
 * Verifies against every known scheme, newest first.
 *
 * A match on an older version is reported so the caller can re-hash the row to
 * the current scheme while the plaintext PIN is momentarily in hand.
 */
export function verifyPinDetailed(pin: string, salt: string, expectedHash: string): PinVerification {
  const order: KdfVersion[] = [2, 1]
  for (const version of order) {
    if (timingSafeHexEqual(derive(pin, salt, version), expectedHash)) {
      return { valid: true, version }
    }
  }
  return { valid: false, version: null }
}

export function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  return verifyPinDetailed(pin, salt, expectedHash).valid
}

/**
 * True when the stored hash verifies but was written with a superseded scheme,
 * i.e. the row is a candidate for a transparent upgrade.
 */
export function needsRehash(pin: string, salt: string, expectedHash: string): boolean {
  const result = verifyPinDetailed(pin, salt, expectedHash)
  return result.valid && result.version !== CURRENT_KDF_VERSION
}

/**
 * Async verification, for request paths that take attacker-controlled input.
 * pbkdf2Sync blocks the event loop for the whole derivation, which let a handful
 * of concurrent login requests stall every other request in the process.
 */
export async function verifyPinAsync(pin: string, salt: string, expectedHash: string): Promise<PinVerification> {
  for (const version of [2, 1] as KdfVersion[]) {
    const derived = await deriveAsync(pin, salt, version)
    if (timingSafeHexEqual(derived, expectedHash)) {
      return { valid: true, version }
    }
  }
  return { valid: false, version: null }
}

function derive(pin: string, salt: string, version: KdfVersion): string {
  return crypto
    .pbkdf2Sync(`${KDF_TAGS[version]}${pin}`, salt, KDF_ITERATIONS[version], 32, 'sha256')
    .toString('hex')
}

function deriveAsync(pin: string, salt: string, version: KdfVersion): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      `${KDF_TAGS[version]}${pin}`,
      salt,
      KDF_ITERATIONS[version],
      32,
      'sha256',
      (err, key) => (err ? reject(err) : resolve(key.toString('hex'))),
    )
  })
}

function timingSafeHexEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || a.length === 0) return false
  return crypto.timingSafeEqual(a, b)
}

export function newToken(): string {
  return crypto.randomUUID()
}

export function sessionExpiry(): string {
  return new Date(Date.now() + ENV.TOKEN_TTL_MS).toISOString()
}
