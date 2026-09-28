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
      // Enabled so the guard rails on permanent account removal are exercised
      // against a real server. The database is per-run and thrown away.
      // ENABLE_DESTRUCTIVE_OPERATIONS is deliberately left unset: the database
      // wipe must stay disarmed even when account removal is wanted.
      ENABLE_ACCOUNT_REMOVAL: 'true',
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

    // A close is refused unless the transaction ledger backs the declared sales,
    // so the sale has to be synced before the shift can be closed.
    await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(session.token),
      body: JSON.stringify({
        entities: [{
          type: 'TRANSACTION',
          data: {
            id: `freeze-tx-${Math.random().toString(36).slice(2, 10)}`,
            shiftId,
            fuelCode: 'PMS',
            litres: 20,
            unitPrice: 14.8,
            amount: 296,
            method: 'CASH',
            recordedAt: new Date(Date.now() - 5_400_000).toISOString(),
          },
        }],
      }),
    })

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

describe('an open shift reports the sales it has actually taken', () => {
  it('accumulates litres and takings from synced transactions while still open', async () => {
    // A client cannot know what was sold until the closing meter reading
    // exists, so it sends litres and amount as zero for the whole time the
    // shift is open. Every litres and sales figure in Head Office and on the
    // supervisor dashboard reads that column, so without this a shift with real
    // sales reported 0 litres and GHS 0 for its entire life and the dashboard
    // showed cars served next to zero litres.
    const session = await login(DEMO_ATTENDANT_CODE, DEMO_ATTENDANT_PIN)
    const stations = (await (await fetch(`${BASE}/api/companies/directory/omcs/${session.companyId}/stations`)).json()) as Array<{ id: string }>
    const shiftId = `live-${Math.random().toString(36).slice(2, 10)}`
    const openedAt = new Date(Date.now() - 3_600_000).toISOString()
    const skeleton = [{ fuelCode: 'PMS', litres: 0, amount: 0, unitPrice: 14.8 }, { fuelCode: 'AGO', litres: 0, amount: 0, unitPrice: 15.2 }]

    const send = (entities: unknown[]) => fetch(`${BASE}/api/sync/entities`, {
      method: 'POST', headers: auth(session.token), body: JSON.stringify({ entities }),
    }).then(r => r.json() as Promise<{ accepted: string[]; rejected: Array<{ id: string; reason: string }> }>)

    const opened = await send([{
      type: 'SHIFT',
      data: {
        id: shiftId, number: shiftId, stationId: stations[0].id, attendantId: session.userId,
        pumpId: '', status: 'OPEN', openedAt,
        openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 1000 }],
        closingReadings: [], sales: skeleton, expectedTotal: 0, payments: {}, actualTotal: 0, variance: 0,
      },
    }])
    expect(opened.accepted, JSON.stringify(opened.rejected)).toContain(shiftId)

    const readSales = (): Array<{ fuelCode: string; litres: number; amount: number }> => {
      const row = db.prepare('SELECT sales FROM shifts WHERE id = ?').get(shiftId) as { sales: string }
      return JSON.parse(row.sales) as Array<{ fuelCode: string; litres: number; amount: number }>
    }
    const litresSoFar = (): number => readSales().reduce((sum, s) => sum + Number(s.litres || 0), 0)
    expect(litresSoFar()).toBe(0)

    // Syncing a sale has to move the shift's own aggregate, not just the
    // transactions table, because that is what the dashboards read.
    const sale = await send([{
      type: 'TRANSACTION',
      data: {
        id: `live-tx-${Math.random().toString(36).slice(2, 10)}`,
        shiftId, fuelCode: 'PMS', litres: 40, unitPrice: 14.8, amount: 592,
        method: 'CASH', recordedAt: new Date(Date.now() - 1_800_000).toISOString(),
      },
    }])
    expect(sale.accepted, JSON.stringify(sale.rejected)).toHaveLength(1)
    expect(litresSoFar()).toBe(40)
    expect(readSales().find(s => s.fuelCode === 'PMS')?.amount).toBe(592)
    // A fuel with no sales stays at zero rather than disappearing.
    expect(readSales().find(s => s.fuelCode === 'AGO')?.litres).toBe(0)

    // A second sale accumulates rather than replacing.
    await send([{
      type: 'TRANSACTION',
      data: {
        id: `live-tx-${Math.random().toString(36).slice(2, 10)}`,
        shiftId, fuelCode: 'AGO', litres: 10, unitPrice: 15.2, amount: 152,
        method: 'CASH', recordedAt: new Date(Date.now() - 900_000).toISOString(),
      },
    }])
    expect(litresSoFar()).toBe(50)
  })
})

describe('permanent account removal', () => {
  const NEW_PIN = '123477'
  const SUPER_ADMIN_ID = 'sup-super-admin'

  // The login route rate limits by client, and this file already logs in for
  // other suites. One session per role, reused across these cases, keeps the
  // limiter out of the way of what is actually under test.
  let adminToken: string
  let hqToken: string
  let firstStationId: string

  async function sessionFor(employeeCode: string, pin: string): Promise<string> {
    if (employeeCode === 'SUPER-ADMIN') return (adminToken ??= (await login('SUPER-ADMIN', SUPER_ADMIN_PIN)).token)
    return (hqToken ??= (await login('PV-HQ01', DEMO_HQ_PIN)).token)
  }

  async function stationId(): Promise<string> {
    if (firstStationId) return firstStationId
    const stations = (await (await fetch(`${BASE}/api/companies/directory/omcs/comp-pv/stations`)).json()) as Array<{ id: string }>
    firstStationId = stations[0].id
    return firstStationId
  }

  async function createAttendant(code: string, fullName: string): Promise<{ id: string; token: string }> {
    const token = await sessionFor('SUPER-ADMIN', SUPER_ADMIN_PIN)
    const res = await fetch(`${BASE}/api/attendants`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ employeeCode: code, fullName, pin: NEW_PIN, stationId: await stationId() }),
    })
    const body = (await res.json()) as { id?: string }
    if (!res.ok || !body.id) throw new Error(`create ${code} failed: ${res.status} ${JSON.stringify(body)}`)
    return { id: body.id, token }
  }

  function purge(token: string, id: string, pin?: string): Promise<Response> {
    return fetch(`${BASE}/api/attendants/${id}/permanent`, {
      method: 'DELETE', headers: auth(token), body: JSON.stringify(pin === undefined ? {} : { pin }),
    })
  }

  it('is closed to everyone below super admin', async () => {
    // Head office manages staff day to day, so it is the role most likely to be
    // holding a session when an account has to go. It gets deactivate, never this.
    const target = await createAttendant('PV701A', 'Purge Guard Hq')
    const res = await purge(await sessionFor('PV-HQ01', DEMO_HQ_PIN), target.id, SUPER_ADMIN_PIN)
    expect(res.status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS c FROM attendants WHERE id = ?').get(target.id)).toEqual({ c: 1 })
  })

  it('demands the Super Admin PIN be re-entered', async () => {
    const target = await createAttendant('PV702A', 'Purge Guard Pin')
    // Even a valid super admin session is not enough on its own.
    expect((await purge(target.token, target.id)).status).toBe(403)
    expect((await purge(target.token, target.id, '000000')).status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS c FROM attendants WHERE id = ?').get(target.id)).toEqual({ c: 1 })
  })

  it('refuses to remove an account the ledger still points at', async () => {
    // Hard-deleting an attendant that has traded leaves sales and closed shifts
    // referencing an account that no longer exists, which quietly breaks
    // attribution in every historical report. Those get deactivated instead.
    const target = await createAttendant('PV703A', 'Purge Guard Ledger')
    db.prepare(`INSERT INTO shifts (id, number, attendantId, attendantName, pumpId, pumpName, stationId, stationName,
      status, openedAt, openingReadings, closingReadings, sales, expectedTotal, payments, actualTotal, variance, syncStatus, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'purge-ledger-shift', 'PL-1', target.id, 'Purge Guard Ledger', '', '', 'st-1', 'Station',
      'OPEN', new Date().toISOString(), '[]', '[]', '[]', 0, '{}', 0, 0, 'SYNCED', new Date().toISOString(), new Date().toISOString(),
    )

    const res = await purge(target.token, target.id, SUPER_ADMIN_PIN)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { shifts?: number; message?: string }
    expect(body.shifts).toBe(1)
    expect(body.message).toMatch(/deactivate/i)
    expect(db.prepare('SELECT COUNT(*) AS c FROM attendants WHERE id = ?').get(target.id)).toEqual({ c: 1 })
  })

  it('removes a clean account once the PIN checks out, and records it', async () => {
    const target = await createAttendant('PV705A', 'Purge Guard Clean')
    const res = await purge(target.token, target.id, SUPER_ADMIN_PIN)
    const text = await res.text()
    expect(res.status, text).toBe(200)
    expect(JSON.parse(text)).toMatchObject({ success: true, removed: true, employeeCode: 'PV705A' })
    expect(db.prepare('SELECT COUNT(*) AS c FROM attendants WHERE id = ?').get(target.id)).toEqual({ c: 0 })

    const audit = db.prepare('SELECT action FROM audit_log WHERE targetId = ? ORDER BY timestamp DESC').get(target.id) as { action: string } | undefined
    expect(audit?.action).toBe('ATTENDANT_PURGED')
  })

  it('leaves the ordinary delete as a deactivate, not a removal', async () => {
    // The "remove staff member" button in the app is wired to DELETE /:id. It
    // must keep deactivating, so an everyday click can never destroy a row.
    const target = await createAttendant('PV706A', 'Purge Guard Soft')
    const res = await fetch(`${BASE}/api/attendants/${target.id}`, { method: 'DELETE', headers: auth(target.token) })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT active, approvalStatus FROM attendants WHERE id = ?').get(target.id) as { active: number; approvalStatus: string }
    expect(row.active).toBe(0)
    expect(row.approvalStatus).toBe('REJECTED')
  })

  it('keeps supervisor deletion off the head office desk', async () => {
    // Head office could permanently delete a supervisor account with no PIN and
    // no re-authentication, which was a weaker bar than wiping the database.
    const victim = db.prepare('SELECT id FROM supervisors WHERE isSuperAdmin = 0 AND id <> ? LIMIT 1').get(SUPER_ADMIN_ID) as { id: string } | undefined
    expect(victim, 'expected a seeded non-superadmin supervisor').toBeTruthy()

    const hq = await sessionFor('PV-HQ01', DEMO_HQ_PIN)
    const res = await fetch(`${BASE}/api/supervisors/${victim!.id}`, { method: 'DELETE', headers: auth(hq), body: JSON.stringify({}) })
    expect(res.status).toBe(403)
    expect(db.prepare('SELECT COUNT(*) AS c FROM supervisors WHERE id = ?').get(victim!.id)).toEqual({ c: 1 })
  })

  it('will not let a super admin delete the platform admin account', async () => {
    // The SUPER-ADMIN row is the only way back into the system if every tenant
    // account is lost, so it is not deletable from the app even with its own PIN.
    const admin = await sessionFor('SUPER-ADMIN', SUPER_ADMIN_PIN)
    const res = await fetch(`${BASE}/api/supervisors/${SUPER_ADMIN_ID}`, { method: 'DELETE', headers: auth(admin), body: JSON.stringify({ pin: SUPER_ADMIN_PIN }) })
    // Refused as self-deletion, which is checked before anything else.
    expect(res.status).toBe(400)
    expect((await res.json() as { message?: string }).message).toMatch(/signed in with/i)
    expect(db.prepare('SELECT COUNT(*) AS c FROM supervisors WHERE id = ?').get(SUPER_ADMIN_ID)).toEqual({ c: 1 })
  })

  it('does not arm the database wipe just because account removal is on', async () => {
    // The two switches are separate on purpose. Wanting an operator to be able
    // to remove a staff account must never also expose a full ledger wipe, even
    // though both sit behind the same Super Admin PIN.
    const admin = await sessionFor('SUPER-ADMIN', SUPER_ADMIN_PIN)
    const res = await fetch(`${BASE}/api/auth/wipe-database`, {
      method: 'POST', headers: auth(admin), body: JSON.stringify({ pin: SUPER_ADMIN_PIN }),
    })
    expect(res.status).toBe(403)
    expect((await res.json() as { error?: string }).error).toBe('DISABLED')
    expect(db.prepare('SELECT COUNT(*) AS c FROM shifts').get().c).toBeGreaterThan(0)
  })
})

describe('closing a shift end to end', () => {
  // Production had never closed a single shift, so the whole path that produces
  // the money figures a supervisor approves was unproven against real data.
  // These cases drive it the way the app does: real seeded product prices, real
  // per-sale transactions, then a close with meter readings.

  let attendant: { token: string; userId: string; companyId: string }
  let stationId: string

  async function openShift(prefix: string): Promise<{ shiftId: string; openedAt: string }> {
    const shiftId = `${prefix}-${Math.random().toString(36).slice(2, 10)}`
    const openedAt = new Date(Date.now() - 7_200_000).toISOString()
    const res = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(attendant.token),
      body: JSON.stringify({ entities: [{ type: 'SHIFT', data: {
        id: shiftId, number: shiftId, stationId, attendantId: attendant.userId,
        pumpId: '', status: 'OPEN', openedAt,
        openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
        closingReadings: [], sales: [], expectedTotal: 0, payments: {}, actualTotal: 0, variance: 0,
      } }] }),
    })
    expect(((await res.json()) as { accepted: string[] }).accepted).toContain(shiftId)
    return { shiftId, openedAt }
  }

  const sendShift = (shiftId: string, data: Record<string, unknown>) => fetch(`${BASE}/api/sync/entities`, {
    method: 'POST', headers: auth(attendant.token), body: JSON.stringify({ entities: [{ type: 'SHIFT', data }] }),
  }).then(r => r.json() as Promise<{ accepted: string[]; rejected: Array<{ reason: string }> }>)

  // A close is only accepted when the transaction ledger backs the claimed
  // sales, so any case that declares fuel has to record the sale first, exactly
  // as the app does.
  const sendSale = (shiftId: string, fuelCode: string, litres: number, unitPrice: number) => fetch(`${BASE}/api/sync/entities`, {
    method: 'POST', headers: auth(attendant.token),
    body: JSON.stringify({ entities: [{ type: 'TRANSACTION', data: {
      id: `tx-${Math.random().toString(36).slice(2, 10)}`, shiftId, fuelCode, litres, unitPrice,
      amount: Math.round(litres * unitPrice * 100) / 100, method: 'CASH',
      recordedAt: new Date(Date.now() - 1_800_000).toISOString(),
    } }] }),
  }).then(r => r.json() as Promise<{ accepted: string[]; rejected: Array<{ reason: string }> }>)

  beforeAll(async () => {
    const session = await login(DEMO_ATTENDANT_CODE, DEMO_ATTENDANT_PIN)
    attendant = session as unknown as typeof attendant
    const stations = (await (await fetch(`${BASE}/api/companies/directory/omcs/${session.companyId}/stations`)).json()) as Array<{ id: string }>
    stationId = stations[0].id
  })

  it('refuses a sale priced below the company price list', async () => {
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number } | undefined
    expect(price, 'seeded PMS product should exist').toBeTruthy()

    const { shiftId } = await openShift('close-price')
    const litres = 25
    // The highest-value guard in the system. An attendant is the least
    // privileged role and controls the request body, so if the server took the
    // unit price on trust they could sell 25 litres at 0.01, hand in 0.25, and
    // produce a shift that reconciles to zero variance. A supervisor would
    // approve a clean sheet and the revenue would simply never have existed.
    const res = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(attendant.token),
      body: JSON.stringify({ entities: [{ type: 'TRANSACTION', data: {
        id: `tx-${Math.random().toString(36).slice(2, 10)}`, shiftId, fuelCode: 'PMS',
        litres, unitPrice: 0.01, amount: 0.25, method: 'CASH',
        recordedAt: new Date(Date.now() - 3_600_000).toISOString(),
      } }] }),
    })
    const body = await res.json() as { accepted: string[]; rejected: Array<{ reason: string }> }
    expect(body.accepted).toHaveLength(0)
    expect(body.rejected[0].reason).toMatch(/company price is/i)
    expect(db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE shiftId = ?').get(shiftId)).toEqual({ c: 0 })
  })

  it('values a genuine sale at the company price', async () => {
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number }
    const { shiftId } = await openShift('close-priced')
    const litres = 25
    const res = await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST',
      headers: auth(attendant.token),
      body: JSON.stringify({ entities: [{ type: 'TRANSACTION', data: {
        id: `tx-${Math.random().toString(36).slice(2, 10)}`, shiftId, fuelCode: 'PMS',
        litres, unitPrice: price.price, amount: Math.round(litres * price.price * 100) / 100, method: 'CASH',
        recordedAt: new Date(Date.now() - 3_600_000).toISOString(),
      } }] }),
    })
    const body = await res.json() as { accepted: string[]; rejected: Array<{ reason: string }> }
    expect(body.accepted, JSON.stringify(body.rejected)).toHaveLength(1)

    const row = db.prepare('SELECT unitPrice, amount FROM transactions WHERE shiftId = ? AND fuelCode = ?').get(shiftId, 'PMS') as { unitPrice: number; amount: number }
    expect(row.unitPrice).toBe(price.price)
    expect(row.amount).toBeCloseTo(litres * price.price, 2)
  })

  it('closes a shift and lands the variance a supervisor will review', async () => {
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number }
    const { shiftId, openedAt } = await openShift('close-happy')
    const litres = 40
    const saleAmount = Math.round(litres * price.price * 100) / 100

    await fetch(`${BASE}/api/sync/entities`, {
      method: 'POST', headers: auth(attendant.token),
      body: JSON.stringify({ entities: [{ type: 'TRANSACTION', data: {
        id: `tx-${Math.random().toString(36).slice(2, 10)}`, shiftId, fuelCode: 'PMS',
        litres, unitPrice: price.price, amount: saleAmount, method: 'CASH',
        recordedAt: new Date(Date.now() - 3_600_000).toISOString(),
      } }] }),
    })

    // The attendant counted 40 litres, so the closing meters must show 40 more
    // than the opening ones.AGO is unchanged.
    const body = await sendShift(shiftId, {
      id: shiftId, number: shiftId, stationId, attendantId: attendant.userId, pumpId: '',
      status: 'CLOSED', openedAt, closedAt: new Date().toISOString(),
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
      closingReadings: [{ fuelCode: 'PMS', value: 1000 + litres }, { fuelCode: 'AGO', value: 2000 }],
      sales: [{ fuelCode: 'PMS', litres, unitPrice: price.price, amount: saleAmount }],
      expectedTotal: saleAmount,
      payments: { CASH: saleAmount, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
      actualTotal: saleAmount, variance: 0,
    })
    expect(body.accepted, JSON.stringify(body.rejected)).toContain(shiftId)

    const row = db.prepare('SELECT status, closedAt, expectedTotal, actualTotal, variance FROM shifts WHERE id = ?').get(shiftId) as Record<string, number | string>
    expect(row.status).toBe('CLOSED')
    expect(row.closedAt).toBeTruthy()
    expect(Number(row.expectedTotal)).toBeCloseTo(saleAmount, 2)
    expect(Number(row.actualTotal)).toBeCloseTo(saleAmount, 2)
    expect(Number(row.variance)).toBe(0)

    // The server keeps the transaction ledger and the shift in agreement.
    const ledger = db.prepare('SELECT SUM(amount) AS total, COUNT(*) AS n FROM transactions WHERE shiftId = ?').get(shiftId) as { total: number; n: number }
    expect(ledger.n).toBe(1)
    expect(Math.abs(ledger.total - saleAmount)).toBeLessThanOrEqual(0.02)

    // And it reaches the review queue a supervisor actually works from.
    const hq = (await login('PV-HQ01', DEMO_HQ_PIN)).token
    const list = await (await fetch(`${BASE}/api/shifts?status=CLOSED`, { headers: auth(hq) })).json() as { shifts: Array<{ id: string }> }
    expect(list.shifts.map(s => s.id)).toContain(shiftId)
  })

  it('surfaces a genuine shortage as a non-zero variance', async () => {
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number }
    const { shiftId, openedAt } = await openShift('close-short')
    const counted = 40
    const handedIn = counted * price.price - 50
    const sold = await sendSale(shiftId, 'PMS', counted, price.price)
    expect(sold.accepted, JSON.stringify(sold.rejected)).toHaveLength(1)

    const body = await sendShift(shiftId, {
      id: shiftId, number: shiftId, stationId, attendantId: attendant.userId, pumpId: '',
      status: 'CLOSED', openedAt, closedAt: new Date().toISOString(),
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
      closingReadings: [{ fuelCode: 'PMS', value: 1000 + counted }, { fuelCode: 'AGO', value: 2000 }],
      sales: [{ fuelCode: 'PMS', litres: counted, unitPrice: price.price, amount: counted * price.price }],
      expectedTotal: counted * price.price,
      payments: { CASH: handedIn, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
      actualTotal: handedIn, variance: -50,
    })
    expect(body.accepted, JSON.stringify(body.rejected)).toContain(shiftId)

    const row = db.prepare('SELECT variance FROM shifts WHERE id = ?').get(shiftId) as { variance: number }
    expect(Number(row.variance)).toBeCloseTo(-50, 2)
  })

  it('refuses to hide a shortage behind a clean variance', async () => {
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number }
    const { shiftId, openedAt } = await openShift('close-tamper')
    const sold = await sendSale(shiftId, 'PMS', 40, price.price)
    expect(sold.accepted, JSON.stringify(sold.rejected)).toHaveLength(1)

    // The real fraud, and the reason variance is recomputed server side: 40
    // litres really moved and are really in the ledger, so the meters check
    // passes. But the attendant hands in GHS 200 less than the sale was worth
    // and reports a variance of zero. A supervisor reading the shift would see a
    // clean sheet and approve it, and the missing cash would only surface much
    // later if at all.
    const body = await sendShift(shiftId, {
      id: shiftId, number: shiftId, stationId, attendantId: attendant.userId, pumpId: '',
      status: 'CLOSED', openedAt, closedAt: new Date().toISOString(),
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
      closingReadings: [{ fuelCode: 'PMS', value: 1040 }, { fuelCode: 'AGO', value: 2000 }],
      sales: [{ fuelCode: 'PMS', litres: 40, unitPrice: price.price, amount: 40 * price.price }],
      expectedTotal: 40 * price.price,
      payments: { CASH: 40 * price.price - 200, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
      actualTotal: 40 * price.price - 200,
      variance: 0,
    })
    expect(body.accepted).toHaveLength(0)
    expect(body.rejected[0].reason).toMatch(/variance does not match/i)
    expect(db.prepare('SELECT status FROM shifts WHERE id = ?').get(shiftId)).toEqual({ status: 'OPEN' })
  })

  it('refuses a close whose declared sales no transaction backs', async () => {
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number }
    const { shiftId, openedAt } = await openShift('close-unbacked')
    // 40 litres of real money claimed, with no sale ever recorded. The meters
    // agree, so nothing else in the close catches it.
    const body = await sendShift(shiftId, {
      id: shiftId, number: shiftId, stationId, attendantId: attendant.userId, pumpId: '',
      status: 'CLOSED', openedAt, closedAt: new Date().toISOString(),
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
      closingReadings: [{ fuelCode: 'PMS', value: 1040 }, { fuelCode: 'AGO', value: 2000 }],
      sales: [{ fuelCode: 'PMS', litres: 40, unitPrice: price.price, amount: 40 * price.price }],
      expectedTotal: 40 * price.price,
      payments: { CASH: 40 * price.price, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
      actualTotal: 40 * price.price, variance: 0,
    })
    expect(body.accepted).toHaveLength(0)
    expect(body.rejected[0].reason).toMatch(/transactions are incomplete/i)
    expect(db.prepare('SELECT status FROM shifts WHERE id = ?').get(shiftId)).toEqual({ status: 'OPEN' })
    expect(db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE shiftId = ?').get(shiftId)).toEqual({ c: 0 })
  })

  it('refuses a close that omits one of the fuels opened', async () => {
    const { shiftId, openedAt } = await openShift('close-missing-fuel')
    const body = await sendShift(shiftId, {
      id: shiftId, number: shiftId, stationId, attendantId: attendant.userId, pumpId: '',
      status: 'CLOSED', openedAt, closedAt: new Date().toISOString(),
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
      closingReadings: [{ fuelCode: 'PMS', value: 1000 }],
      sales: [], expectedTotal: 0, payments: {}, actualTotal: 0, variance: 0,
    })
    expect(body.accepted).toHaveLength(0)
    expect(body.rejected[0].reason).toMatch(/same fuel codes/i)
  })

  it('records an approval against a closed shift and freezes its money figures', async () => {
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number }
    const { shiftId, openedAt } = await openShift('close-approve')
    const amount = Math.round(20 * price.price * 100) / 100
    const sold = await sendSale(shiftId, 'PMS', 20, price.price)
    expect(sold.accepted, JSON.stringify(sold.rejected)).toHaveLength(1)
    const closeResult = await sendShift(shiftId, {
      id: shiftId, number: shiftId, stationId, attendantId: attendant.userId, pumpId: '',
      status: 'CLOSED', openedAt, closedAt: new Date().toISOString(),
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
      closingReadings: [{ fuelCode: 'PMS', value: 1020 }, { fuelCode: 'AGO', value: 2000 }],
      sales: [{ fuelCode: 'PMS', litres: 20, unitPrice: price.price, amount }],
      expectedTotal: amount, payments: { CASH: amount, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
      actualTotal: amount, variance: 0,
    })
    expect(closeResult.accepted, JSON.stringify(closeResult.rejected)).toContain(shiftId)

    const hq = (await login('PV-HQ01', DEMO_HQ_PIN)).token
    const res = await fetch(`${BASE}/api/shifts/${shiftId}/review`, {
      method: 'POST', headers: auth(hq), body: JSON.stringify({ status: 'APPROVED' }),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT status, expectedTotal, actualTotal, variance FROM shifts WHERE id = ?').get(shiftId) as Record<string, unknown>
    expect(row.status).toBe('APPROVED')
    expect(Number(row.expectedTotal)).toBeCloseTo(amount, 2)
    expect(Number(row.variance)).toBe(0)

    // The shifts table has no reviewer column, so attribution lives only in the
    // audit log. If that write is ever dropped, a disputed approval has no
    // record of who signed it off.
    const closed = db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'SHIFT_CLOSED' AND targetId = ?").get(shiftId) as { c: number }
    expect(closed.c).toBeGreaterThan(0)
    const approval = db.prepare("SELECT actorId, actorRole FROM audit_log WHERE action = 'REVIEW_APPROVED' AND targetId = ?").get(shiftId) as { actorId: string; actorRole: string } | undefined
    expect(approval?.actorId, 'the approval must name the supervisor who signed it').toBeTruthy()
  })

  it('lets a supervisor approve a shift that came up genuinely short', async () => {
    // The regression this guards: a cash shortage is the normal case a variance
    // is for. It used to be rejected as a ledger mismatch, which would have left
    // the very shifts that most need review permanently stuck.
    const price = db.prepare("SELECT unitPrice AS price FROM products WHERE active = 1 AND UPPER(code) = ? AND (companyId IS NULL OR companyId = ?) ORDER BY companyId IS NULL ASC LIMIT 1").get('PMS', attendant.companyId) as { price: number }
    const { shiftId, openedAt } = await openShift('close-short-approve')
    const counted = 30
    const amount = Math.round(counted * price.price * 100) / 100
    const sold = await sendSale(shiftId, 'PMS', counted, price.price)
    expect(sold.accepted, JSON.stringify(sold.rejected)).toHaveLength(1)
    const closeResult = await sendShift(shiftId, {
      id: shiftId, number: shiftId, stationId, attendantId: attendant.userId, pumpId: '',
      status: 'CLOSED', openedAt, closedAt: new Date().toISOString(),
      openingReadings: [{ fuelCode: 'PMS', value: 1000 }, { fuelCode: 'AGO', value: 2000 }],
      closingReadings: [{ fuelCode: 'PMS', value: 1000 + counted }, { fuelCode: 'AGO', value: 2000 }],
      sales: [{ fuelCode: 'PMS', litres: counted, unitPrice: price.price, amount }],
      expectedTotal: amount,
      payments: { CASH: amount - 75, MOMO: 0, VOUCHER: 0, CREDIT: 0 },
      actualTotal: amount - 75, variance: -75,
    })
    expect(closeResult.accepted, JSON.stringify(closeResult.rejected)).toContain(shiftId)

    const hq = (await login('PV-HQ01', DEMO_HQ_PIN)).token
    const res = await fetch(`${BASE}/api/shifts/${shiftId}/review`, {
      method: 'POST', headers: auth(hq), body: JSON.stringify({ status: 'REVIEWED', reviewerNotes: 'Confirmed shortage with the attendant.' }),
    })
    expect(res.status, 'a genuine shortage must remain reviewable').toBe(200)
    const row = db.prepare('SELECT status, variance, reviewerNotes FROM shifts WHERE id = ?').get(shiftId) as Record<string, unknown>
    expect(row.status).toBe('REVIEWED')
    expect(Number(row.variance)).toBeCloseTo(-75, 2)
    expect(row.reviewerNotes).toBeTruthy()
  })
})
