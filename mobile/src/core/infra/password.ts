/**
 * Pure-TS PBKDF2-HMAC-SHA256 hashing (no Web Crypto dependency), so the same
 * PIN-hashing scheme works identically on Android, iOS and web.
 * Compatible with Node.js crypto and WebCrypto PBKDF2-SHA256.
 */

const ITERATIONS = 20_000
const KEY_LENGTH_BYTES = 32

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
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return toHex(bytes)
}

/**
 * UTF-8 encode without relying on the global TextEncoder, which is not
 * guaranteed to exist in every Hermes/React Native runtime.
 */
function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str)
  }
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i) as number
    if (code > 0xffff) i++
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return new Uint8Array(bytes)
}

const H = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

function sha256(message: Uint8Array): Uint8Array {
  const l = message.length
  const bitLen = l * 8
  const withOne = l + 1
  const padZeros = (56 - (withOne % 64) + 64) % 64
  const total = new Uint8Array(withOne + padZeros + 8)
  total.set(message)
  total[l] = 0x80
  const dv = new DataView(total.buffer, total.byteOffset, total.byteLength)
  dv.setUint32(total.length - 4, bitLen >>> 0, false)
  dv.setUint32(total.length - 8, Math.floor(bitLen / 0x100000000), false)

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const wv = new Uint32Array(64)
  for (let i = 0; i < total.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      wv[t] = dv.getUint32(i + t * 4, false)
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(wv[t - 15], 7) ^ rotr(wv[t - 15], 18) ^ (wv[t - 15] >>> 3)
      const s1 = rotr(wv[t - 2], 17) ^ rotr(wv[t - 2], 19) ^ (wv[t - 2] >>> 10)
      wv[t] = (wv[t - 16] + s0 + wv[t - 7] + s1) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3
    let e = h4, f = h5, g = h6, h = h7
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + H[t] + wv[t]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer, out.byteOffset, out.byteLength)
  odv.setUint32(0, h0, false); odv.setUint32(4, h1, false); odv.setUint32(8, h2, false); odv.setUint32(12, h3, false)
  odv.setUint32(16, h4, false); odv.setUint32(20, h5, false); odv.setUint32(24, h6, false); odv.setUint32(28, h7, false)
  return out
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  let k = key
  if (k.length > 64) {
    k = sha256(k)
  }
  const paddedKey = new Uint8Array(64)
  paddedKey.set(k)
  const oKeyPad = new Uint8Array(64)
  const iKeyPad = new Uint8Array(64)
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c
    iKeyPad[i] = paddedKey[i] ^ 0x36
  }
  const inner = new Uint8Array(64 + message.length)
  inner.set(iKeyPad)
  inner.set(message, 64)
  const innerHash = sha256(inner)

  const outer = new Uint8Array(64 + 32)
  outer.set(oKeyPad)
  outer.set(innerHash, 64)
  return sha256(outer)
}

function pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number, keyLenBytes: number): Uint8Array {
  const blocks = Math.ceil(keyLenBytes / 32)
  const out = new Uint8Array(blocks * 32)
  for (let block = 1; block <= blocks; block++) {
    const salted = new Uint8Array(salt.length + 4)
    salted.set(salt)
    salted[salt.length] = (block >> 24) & 0xff
    salted[salt.length + 1] = (block >> 16) & 0xff
    salted[salt.length + 2] = (block >> 8) & 0xff
    salted[salt.length + 3] = block & 0xff
    let u = hmacSha256(password, salted)
    const t = new Uint8Array(u.length)
    t.set(u)
    for (let it = 1; it < iterations; it++) {
      u = hmacSha256(password, u)
      for (let k = 0; k < t.length; k++) t[k] ^= u[k]
    }
    out.set(t, (block - 1) * 32)
  }
  return out.slice(0, keyLenBytes)
}

export async function hashPin(pin: string, saltHex: string = randomSaltHex()): Promise<{ salt: string; hash: string }> {
  const salt = fromHex(saltHex)
  const bits = pbkdf2(utf8Encode(`mvp-v1:${pin}`), salt, ITERATIONS, KEY_LENGTH_BYTES)
  return { salt: saltHex, hash: toHex(bits) }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyPin(pin: string, saltHex: string, hashHex: string): Promise<boolean> {
  try {
    const salt = fromHex(saltHex)
    const bits = pbkdf2(utf8Encode(`mvp-v1:${pin}`), salt, ITERATIONS, KEY_LENGTH_BYTES)
    return constantTimeEqual(toHex(bits), hashHex)
  } catch {
    return false
  }
}