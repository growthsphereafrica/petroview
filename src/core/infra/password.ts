/**
 * PIN password hashing using PBKDF2-SHA256 (Web Crypto).
 * Never stores plaintext PINs. Salt is random per attendant.
 */

const ITERATIONS = 210_000
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

async function derive(pin: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(`mvp-v1:${pin}`), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH,
  )
}

export async function hashPin(pin: string, saltHex: string = randomSaltHex()): Promise<{ salt: string; hash: string }> {
  const salt = fromHex(saltHex)
  const bits = await derive(pin, salt)
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

export async function verifyPin(pin: string, saltHex: string, hashHex: string): Promise<boolean> {
  try {
    const salt = fromHex(saltHex)
    const bits = await derive(pin, salt)
    const candidate = toHex(new Uint8Array(bits))
    return constantTimeEqual(candidate, hashHex)
  } catch {
    return false
  }
}