/**
 * PIN password hashing using PBKDF2-SHA256 (Web Crypto).
 * Never stores plaintext PINs. Salt is random per attendant.
 *
 * Scheme versions must stay in step with backend/src/auth.ts.
 *
 * Verification accepts BOTH v1 and v2. Staff records created on this device
 * before the KDF was strengthened still carry a v1 hash in IndexedDB, and
 * checking only the current scheme would lock every one of those attendants out
 * of the app with no server-side recovery path.
 */

type KdfVersion = 1 | 2

const ITERATIONS: Record<KdfVersion, number> = { 1: 210_000, 2: 310_000 }
const TAGS: Record<KdfVersion, string> = { 1: 'mvp-v1:', 2: 'mvp-v2:' }
const CURRENT: KdfVersion = 2
const KEY_LENGTH = 256
const enc = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return out
}

export function randomSaltHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return toHex(bytes)
}

async function derive(pin: string, salt: Uint8Array, version: KdfVersion = CURRENT): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(`${TAGS[version]}${pin}`), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS[version], hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH,
  )
}

export async function hashPin(pin: string, saltHex: string = randomSaltHex()): Promise<{ salt: string; hash: string }> {
  const salt = fromHex(saltHex)
  const bits = await derive(pin, salt, CURRENT)
  return { salt: saltHex, hash: toHex(new Uint8Array(bits)) }
}

/** Constant-time comparison to mitigate timing attacks. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Verifies against every known scheme, newest first. See the note at the top of
 * this file for why a v1-only check would be a lockout bug.
 */
export async function verifyPin(pin: string, saltHex: string, hashHex: string): Promise<boolean> {
  try {
    const salt = fromHex(saltHex)
    for (const version of [2, 1] as KdfVersion[]) {
      const bits = await derive(pin, salt, version)
      if (constantTimeEqual(toHex(new Uint8Array(bits)), hashHex)) return true
    }
    return false
  } catch {
    return false
  }
}