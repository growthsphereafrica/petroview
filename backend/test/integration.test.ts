/**
 * Integration tests that boot the real server against a throwaway SQLite file.
 *
 * These exist because the defects they cover were invisible to review and to
 * the type checker:
 *  - GET /api/audit supplied 7 bind parameters to an 8-placeholder statement,
 *    so every Head Office request failed with a 500.
 *  - The sync route trusted the device-supplied unitPrice, so a sale at
 *    0.01/litre reconciled to zero variance.
 *  - Several tenant listing routes were reachable with no session at all.
 */

import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import Database from 'better-sqlite3'

let child: ChildProcess
let tempDir: string
let db: InstanceType<typeof Database>

function openDb(): InstanceType<typeof Database> {
  return new Database(path.join(tempDir, 'test.sqlite'))
}

/**
 * Overwrites the demo attendant's credential with a v1-scheme hash of `pin`,
 * runs `body`, then restores the original row so later tests are unaffected.
 */
async function withSeededCredential(pin: string, body: () => Promise<void>): Promise<void> {
  const original = db
    .prepare('SELECT pinSalt, pinHash, failedAttempts, lockoutUntil FROM attendants WHERE employeeCode = ?')
    .get(DEMO_ATTENDANT_CODE) as { pinSalt: string; pinHash: string; failedAttempts: number; lockoutUntil: string | null }
  const salt = randomBytes(16).toString('hex')
  const legacyHash = pbkdf2Sync(`mvp-v1:${pin}`, salt, 210_000, 32, 'sha256').toString('hex')
  db.prepare('UPDATE attendants SET pinSalt = ?, pinHash = ?, failedAttempts = 0, lockoutUntil = NULL WHERE employeeCode = ?')
    .run(salt, legacyHash, DEMO_ATTENDANT_CODE)
  try {
    await body()
  } finally {
    db.prepare('UPDATE attendants SET pinSalt = ?, pinHash = ?, failedAttempts = ?, lockoutUntil = ? WHERE employeeCode = ?')
      .run(original.pinSalt, original.pinHash, original.failedAttempts, original.lockoutUntil, DEMO_ATTENDANT_CODE)
  }
}

const PORT = 4399
const BASE = `http://127.0.0.1:${PORT}`
// Must be 4 digits (the login route rejects anything else) and must not be one
// of the PINs the server refuses to start with.
const SUPER_ADMIN_PIN = '8402'
const DEMO_HQ_PIN = '999988'
const DEMO_ATTENDANT_PIN = '123477'
const DEMO_ATTENDANT_CODE = 'PV001A'

async function waitForHealth(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Backend did not become healthy in time.')
}

async function login(employeeCode: string, pin: string): Promise<{ token: string; userId: string; companyId: string | null; stationId: string | null; role: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeCode, pin }),
  })
  const body = (await res.json()) as Record<string, any>
  if (!res.ok) throw new Error(`login ${employeeCode} failed: ${res.status} ${JSON.stringify(body)}`)
  const token = body.token ?? body.session?.token
  if (!token) throw new Error(`login ${employeeCode} returned no token: ${JSON.stringify(body)}`)
  return {
    token,
    userId: body.userId ?? body.session?.userId ?? body.id ?? body.session?.id,
    companyId: body.companyId ?? body.session?.companyId ?? null,
    stationId: body.stationId ?? body.session?.stationId ?? null,
    role: body.role ?? body.session?.role,
  }
}

function auth(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'masterview-test-'))
  child = spawn(process.execPath, [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      // Not "production": seedDefaultCompanies refuses to seed tenants in a
      // production environment, and the tests need real companies, stations and
      // staff to exercise tenant scoping. SUPER_ADMIN_PIN is still supplied
      // explicitly so the no-default-PIN behaviour is what gets tested.
      NODE_ENV: 'test',
      PORT: String(PORT),
      DB_PATH: path.join(tempDir, 'test.sqlite'),
      SUPER_ADMIN_PIN,
      DEMO_HQ_PIN,
      DEMO_ATTENDANT_PIN,
      SEED_DEMO_DATA: 'true',
      ENABLE_DESTRUCTIVE_OPERATIONS: 'false',
      CORS_ORIGINS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  await waitForHealth()
  db = openDb()
}, 90_000)

afterAll(() => {
  child?.kill()
  try {
    db?.close()
  } catch {
    /* best effort */
  }
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

/**
 * One server and one throwaway database serve the whole file, so a shift left
 * open by one test is still open for the next. That was invisible until the
 * sync route started refusing a second concurrent open shift for the same
 * attendant, at which point every later test failed on its predecessor's
 * leftover. Clearing the demo attendant's open shifts between tests keeps the
 * invariant under test instead of the order tests happen to run in.
 */
afterEach(() => {
  try {
    const attendant = db.prepare('SELECT id FROM attendants WHERE employeeCode = ?').get(DEMO_ATTENDANT_CODE) as { id: string } | undefined
    if (!attendant) return
    db.prepare("DELETE FROM transactions WHERE shiftId IN (SELECT id FROM shifts WHERE attendantId = ? AND status = 'OPEN')").run(attendant.id)
    db.prepare("DELETE FROM shifts WHERE attendantId = ? AND status = 'OPEN'").run(attendant.id)
  } catch {
    /* best effort: a failing assertion is the signal, not a cleanup error */
  }
})

describe('tenant directory exposure', () => {
  it('serves a narrow OMC directory without a session', async () => {
    const res = await fetch(`${BASE}/api/companies/directory/omcs`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<Record<string, unknown>>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    for (const omc of body) {
      expect(Object.keys(omc).sort()).toEqual(['id', 'name', 'shortCode'])
    }
  })

  it('refuses the full company list without a session', async () => {
    const res = await fetch(`${BASE}/api/companies`)
    expect(res.status).toBe(401)
  })

  it('refuses the full station list without a session', async () => {
    const res = await fetch(`${BASE}/api/companies/all/stations`)
    expect(res.status).toBe(401)
  })

  it('no longer serves company data from the duplicated /list route', async () => {
    const res = await fetch(`${BASE}/api/companies/list`)
    // It is caught by the authenticated `/:id` route rather than the removed
    // public `/list` route, which is the outcome that matters: no data.
    expect(res.ok).toBe(false)
    const text = await res.text()
    expect(text).not.toContain('shortCode')
  })
})

describe('GET /api/audit', () => {
  it('returns 200 for a head office session', async () => {
    const session = await login('PV-HQ01', DEMO_HQ_PIN)
    const res = await fetch(`${BASE}/api/audit?limit=50`, { headers: auth(session.token) })
    // Previously this was a 500: the scope condition had 8 placeholders and
    // only 7 bound parameters, so the statement threw before returning a row.
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries?: unknown[] }
    expect(Array.isArray(body.entries)).toBe(true)
  })

  it('returns 200 for a super admin session', async () => {
    const session = await login('SUPER-ADMIN', SUPER_ADMIN_PIN)
    const res = await fetch(`${BASE}/api/audit?limit=50`, { headers: auth(session.token) })
    expect(res.status).toBe(200)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await fetch(`${BASE}/api/audit`)
    expect(res.status).toBe(401)
  })

  it('rejects an out-of-range limit', async () => {
    const session = await login('SUPER-ADMIN', SUPER_ADMIN_PIN)
    const res = await fetch(`${BASE}/api/audit?limit=99999`, { headers: auth(session.token) })
    expect(res.status).toBe(400)
  })
})

describe('fuel price enforcement on sync', () => {
  async function syncTransaction(unitPrice: number, amount: number) {
    const session = await login('PV001A', DEMO_ATTENDANT_PIN)
    const stationRes = await fetch(`${BASE}/api/companies/directory/omcs/${session.companyId}/stations`)
    const stations = (await stationRes.json()) as Array<{ id: string }>
    expect(stations.length).toBeGreaterThan(0)

    const shiftId = `test-shift-${Math.random().toString(36).slice(2, 10)}`
    const shiftRes = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'SHIFT',
          data: {
            id: shiftId,
            number: shiftId,
            stationId: stations[0].id,
            attendantId: session.userId,
            pumpId: '',
            status: 'OPEN',
            openedAt: new Date(Date.now() - 3_600_000).toISOString(),
            openingReadings: [{ fuelCode: 'PMS', value: 1000 }],
            closingReadings: [],
            sales: [],
            expectedTotal: 0,
            payments: {},
            actualTotal: 0,
            variance: 0,
          },
        }],
      }),
    })
    const shiftBody = (await shiftRes.json()) as Record<string, any>
    expect(shiftBody.accepted, JSON.stringify(shiftBody)).toContain(shiftId)

    const txRes = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'TRANSACTION',
          data: {
            id: `test-tx-${Math.random().toString(36).slice(2, 10)}`,
            shiftId,
            fuelCode: 'PMS',
            litres: 20,
            unitPrice,
            amount,
            method: 'CASH',
            recordedAt: new Date(Date.now() - 1_800_000).toISOString(),
          },
        }],
      }),
    })
    return (await txRes.json()) as { accepted: string[]; rejected: Array<{ reason: string }> }
  }

  it('rejects a device that invents its own price', async () => {
    // 20L at 0.01 = 0.20, which is internally consistent, so the old
    // self-consistency check accepted it and the shift reconciled to zero
    // variance on a fraction of the real takings.
    const result = await syncTransaction(0.01, 0.2)
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toMatch(/company price/i)
  })

  it('rejects a grossly inflated price', async () => {
    const result = await syncTransaction(140, 2800)
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected[0].reason).toMatch(/company price/i)
  })
})

describe('login hardening', () => {
  it('does not reveal a default super admin PIN', async () => {
    // The published default was 7256; it must never authenticate.
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode: 'SUPER-ADMIN', pin: '7256' }),
    })
    expect(res.ok).toBe(false)
  })

  it('does not leak the database path on the health endpoint', async () => {
    const res = await fetch(`${BASE}/api/health`)
    const text = await res.text()
    expect(text).not.toContain('DB_PATH')
    expect(text).not.toContain('.sqlite')
  })

  it('does not distinguish an unknown code from a wrong PIN', async () => {
    const unknown = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode: 'NOPE999A', pin: '111111' }),
    })
    const wrongPin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode: DEMO_ATTENDANT_CODE, pin: '111111' }),
    })
    // Enumerating valid employee codes used to be possible by reading the
    // response code: INVALID_CREDENTIALS vs INVALID_PIN.
    expect(unknown.status).toBe(wrongPin.status)
    const a = (await unknown.json()) as Record<string, unknown>
    const b = (await wrongPin.json()) as Record<string, unknown>
    expect(a.error).toBe(b.error)
    expect(a.message).toBe(b.message)
  })

  it('accepts a legacy 4-digit PIN at login', async () => {
    // Login must keep working for credentials issued before the length policy.
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode: DEMO_ATTENDANT_CODE, pin: DEMO_ATTENDANT_PIN }),
    })
    expect(res.ok).toBe(true)
  })

  it('still accepts a credential hashed with the superseded KDF scheme', async () => {
    // Regression guard. The KDF was strengthened (mvp-v1 @210k -> mvp-v2 @310k).
    // Every row already in the database was written with the old scheme, so a
    // verify that only accepts the new scheme locks out every attendant,
    // supervisor and the platform admin on the next deploy. This test seeds a
    // v1 credential directly, exactly as the existing rows were written.
    await withSeededCredential('4711', async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeCode: DEMO_ATTENDANT_CODE, pin: '4711' }),
      })
      expect(res.status).toBe(200)
    })
  })

  it('transparently upgrades a superseded credential on successful login', async () => {
    await withSeededCredential('4711', async () => {
      await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeCode: DEMO_ATTENDANT_CODE, pin: '4711' }),
      })

      // The row must now verify under the current scheme, with the same PIN.
      const row = db.prepare('SELECT pinSalt, pinHash FROM attendants WHERE employeeCode = ?').get(DEMO_ATTENDANT_CODE) as {
        pinSalt: string
        pinHash: string
      }
      const current = pbkdf2Sync(`mvp-v2:4711`, row.pinSalt, 310_000, 32, 'sha256').toString('hex')
      expect(row.pinHash).toBe(current)
    })
  })

  it('refuses to issue a new 4-digit credential', async () => {
    const session = await login('SUPER-ADMIN', SUPER_ADMIN_PIN)
    const stations = (await (await fetch(`${BASE}/api/companies/directory/omcs/comp-pv/stations`)).json()) as Array<{ id: string }>
    const res = await fetch(`${BASE}/api/attendants`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        employeeCode: 'PV998A',
        fullName: 'Weak Pin',
        pin: '1234',
        stationId: stations[0].id,
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { message?: string }
    expect(body.message).toMatch(/at least 6 digits/i)
  })
})

describe('closed shifts are frozen against new money', () => {
  async function openAndCloseShift() {
    const session = await login(DEMO_ATTENDANT_CODE, DEMO_ATTENDANT_PIN)
    const stations = (await (await fetch(`${BASE}/api/companies/directory/omcs/${session.companyId}/stations`)).json()) as Array<{ id: string }>
    const shiftId = `freeze-${Math.random().toString(36).slice(2, 10)}`
    const openedAt = new Date(Date.now() - 7_200_000).toISOString()
    const closedAt = new Date(Date.now() - 3_600_000).toISOString()

    const openRes = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'SHIFT',
          data: {
            id: shiftId,
            number: shiftId,
            stationId: stations[0].id,
            attendantId: session.userId,
            pumpId: '',
            status: 'OPEN',
            openedAt,
            openingReadings: [{ fuelCode: 'PMS', value: 1000 }],
            closingReadings: [],
            sales: [],
            expectedTotal: 0,
            payments: {},
            actualTotal: 0,
            variance: 0,
          },
        }],
      }),
    })
    expect(((await openRes.json()) as { accepted: string[] }).accepted).toContain(shiftId)

    const closeRes = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'SHIFT',
          data: {
            id: shiftId,
            number: shiftId,
            stationId: stations[0].id,
            attendantId: session.userId,
            pumpId: '',
            status: 'CLOSED',
            openedAt,
            closedAt,
            openingReadings: [{ fuelCode: 'PMS', value: 1000 }],
            closingReadings: [{ fuelCode: 'PMS', value: 1020 }],
            sales: [{ fuelCode: 'PMS', litres: 20, unitPrice: 14.8, amount: 296 }],
            expectedTotal: 296,
            payments: { CASH: 296, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
            actualTotal: 296,
            variance: 0,
          },
        }],
      }),
    })
    expect(((await closeRes.json()) as { accepted: string[] }).accepted).toContain(shiftId)
    return { session, shiftId }
  }

  it('rejects a new backdated sale on a closed shift', async () => {
    const { session, shiftId } = await openAndCloseShift()
    const res = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'TRANSACTION',
          data: {
            id: `backdated-${Math.random().toString(36).slice(2, 10)}`,
            shiftId,
            fuelCode: 'PMS',
            litres: 50,
            unitPrice: 14.8,
            amount: 740,
            method: 'CASH',
            // Inside the shift window, so the recordedAt bounds did not catch it.
            recordedAt: new Date(Date.now() - 5_400_000).toISOString(),
          },
        }],
      }),
    })
    const body = (await res.json()) as { accepted: string[]; rejected: Array<{ reason: string }> }
    expect(body.accepted).toHaveLength(0)
    expect(body.rejected[0].reason).toMatch(/closed shift/i)
  })
})

describe('audit trail covers money movement', () => {
  it('writes a row when a shift opens, closes, and a sale is recorded', async () => {
    // Record one genuine sale at the authoritative price so the happy path
    // actually runs.
    const session = await login(DEMO_ATTENDANT_CODE, DEMO_ATTENDANT_PIN)
    const stations = (await (await fetch(`${BASE}/api/companies/directory/omcs/${session.companyId}/stations`)).json()) as Array<{ id: string }>
    const shiftId = `audit-${Math.random().toString(36).slice(2, 10)}`
    const openedAt = new Date(Date.now() - 5_400_000).toISOString()

    const openRes = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'SHIFT',
          data: {
            id: shiftId, number: shiftId, stationId: stations[0].id, attendantId: session.userId,
            pumpId: '', status: 'OPEN', openedAt,
            openingReadings: [{ fuelCode: 'PMS', value: 1000 }], closingReadings: [],
            sales: [], expectedTotal: 0, payments: {}, actualTotal: 0, variance: 0,
          },
        }],
      }),
    })
    expect(((await openRes.json()) as { accepted: string[] }).accepted).toContain(shiftId)

    const txRes = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'TRANSACTION',
          data: {
            id: `audit-tx-${Math.random().toString(36).slice(2, 10)}`,
            shiftId, fuelCode: 'PMS', litres: 20, unitPrice: 14.8, amount: 296,
            method: 'CASH', recordedAt: new Date(Date.now() - 1_800_000).toISOString(),
          },
        }],
      }),
    })
    const txBody = (await txRes.json()) as { accepted: string[]; rejected: Array<{ reason: string }> }
    expect(txBody.accepted, JSON.stringify(txBody.rejected)).toHaveLength(1)

    const admin = await login('SUPER-ADMIN', SUPER_ADMIN_PIN)
    const res = await fetch(`${BASE}/api/audit?limit=2000`, { headers: auth(admin.token) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: Array<{ action: string; targetDescription: string; meta: string | null }> }
    const actions = body.entries.map(e => e.action)
    // These three were declared in the AuditAction union but nothing ever
    // wrote them, so there was no server-side record that a sale happened.
    expect(actions).toContain('SHIFT_OPENED')
    expect(actions).toContain('SALE_RECORDED')

    const sale = body.entries.find(e => e.action === 'SALE_RECORDED')!
    const meta = JSON.parse(sale.meta ?? '{}') as Record<string, unknown>
    expect(meta.companyId).toBeTruthy()
    expect(meta.stationId).toBeTruthy()
    expect(meta.amount).toBe(296)
  })
})

describe('one open shift per attendant', () => {
  const openShift = (id: string, stationId: string, userId: string, openedAt: string) => ({
    type: 'SHIFT',
    data: {
      id, number: id, stationId, attendantId: userId,
      pumpId: '', status: 'OPEN', openedAt,
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }], closingReadings: [],
      sales: [], expectedTotal: 0, payments: {}, actualTotal: 0, variance: 0,
    },
  })

  const send = (token: string, entities: unknown[]) => fetch(`${BASE}/api/sync/entities`, {
    method: 'POST', headers: auth(token), body: JSON.stringify({ entities }),
  }).then(r => r.json() as Promise<{ accepted: string[]; rejected: Array<{ id: string; reason: string }> }>)

  it('rejects a second concurrent open shift, but still accepts updates to the first', async () => {
    const session = await login(DEMO_ATTENDANT_CODE, DEMO_ATTENDANT_PIN)
    const stations = (await (await fetch(`${BASE}/api/companies/directory/omcs/${session.companyId}/stations`)).json()) as Array<{ id: string }>
    const first = `dup-${Math.random().toString(36).slice(2, 10)}`
    const second = `dup-${Math.random().toString(36).slice(2, 10)}`
    // Replayed syncs must carry the original openedAt: shift identity, including
    // openedAt, is immutable once written, so a changing timestamp would be
    // rejected for the wrong reason.
    const openedAt = new Date().toISOString()

    const opened = await send(session.token, [openShift(first, stations[0].id, session.userId, openedAt)])
    expect(opened.accepted, JSON.stringify(opened.rejected)).toContain(first)

    // A second open shift for the same attendant has to be refused server-side.
    // The clients already refuse this, so nothing exercised the API path and
    // any other client, or a replayed offline queue, could still do it.
    const clash = await send(session.token, [openShift(second, stations[0].id, session.userId, openedAt)])
    expect(clash.accepted).not.toContain(second)
    expect(clash.rejected.map(r => r.reason).join(' ')).toMatch(/already has an open shift/i)

    // Re-syncing the shift that legitimately holds the open slot still works,
    // so an offline queue replaying a known shift is not self-rejected.
    const replay = await send(session.token, [openShift(first, stations[0].id, session.userId, openedAt)])
    expect(replay.accepted, JSON.stringify(replay.rejected)).toContain(first)
  })
})
