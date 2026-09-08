import crypto from 'node:crypto'
import { ENV } from './config'

export function hashPin(pin: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = derive(pin, salt)
  return { salt, hash }
}

export function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  const actual = derive(pin, salt)
  const a = Buffer.from(actual, 'hex')
  const b = Buffer.from(expectedHash, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function derive(pin: string, salt: string): string {
  return crypto.pbkdf2Sync(`mvp-v1:${pin}`, salt, 210_000, 32, 'sha256').toString('hex')
}

export function newToken(): string {
  return crypto.randomUUID()
}

export function sessionExpiry(): string {
  return new Date(Date.now() + ENV.TOKEN_TTL_MS).toISOString()
}