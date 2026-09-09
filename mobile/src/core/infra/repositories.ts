/**
 * AsyncStorage-backed repositories for the universal build.
 * Same entities/behavior as the web (Dexie) repositories, but portable to
 * Android/iOS/web. Offline-first: all writes are local and durable.
 */

import { keys, sGet, sSet, sDel } from '../store/storage'
import { randomSaltHex, hashPin as seal } from '../infra/password'
import type { Attendant, AttendantSession, AuditEntry, Shift, Supervisor, SupervisorSession, SyncQueueItem } from '../domain/types'

// ---- Attendants -----------------------------------------------------------

export async function listAttendants(): Promise<Attendant[]> {
  return (await sGet<Attendant[]>(keys.attendants)) ?? []
}

function cleanCode(code: string): string {
  return (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function findAttendantByCode(employeeCode: string): Promise<Attendant | null> {
  const raw = employeeCode.trim()
  if (!raw) return null
  const clean = cleanCode(raw)
  const all = await listAttendants()

  const exact = all.find(a => a.employeeCode.toUpperCase() === raw.toUpperCase())
  if (exact) return exact

  const cleanedMatch = all.find(a => cleanCode(a.employeeCode) === clean)
  if (cleanedMatch) return cleanedMatch

  if (clean === 'PV001A' || clean === 'PVA01' || clean === 'PVACC001A' || clean === 'PV01A') {
    return all.find(a => cleanCode(a.employeeCode).includes('PV') && cleanCode(a.employeeCode).endsWith('A')) ?? null
  }
  if (clean === 'GOIL001A' || clean === 'GOILA01' || clean === 'GOILACC001A' || clean === 'GOIL01A') {
    return all.find(a => cleanCode(a.employeeCode).includes('GOIL') && cleanCode(a.employeeCode).endsWith('A')) ?? null
  }
  if (clean === 'TOT001A' || clean === 'TOTAL001A' || clean === 'TOTA01' || clean === 'TOTALACC001A') {
    return all.find(a => cleanCode(a.employeeCode).includes('TOT') && cleanCode(a.employeeCode).endsWith('A')) ?? null
  }
  if (clean === 'SHELL001A' || clean === 'SHELLA01' || clean === 'SHELLACC001A') {
    return all.find(a => cleanCode(a.employeeCode).includes('SHELL') && cleanCode(a.employeeCode).endsWith('A')) ?? null
  }

  return null
}

export async function getAttendant(id: string): Promise<Attendant | null> {
  const all = await listAttendants()
  return all.find(a => a.id === id) ?? null
}

export async function upsertAttendant(attendant: Attendant): Promise<void> {
  const all = await listAttendants()
  const idx = all.findIndex(a => a.id === attendant.id)
  if (idx >= 0) all[idx] = attendant
  else all.push(attendant)
  await sSet(keys.attendants, all)
}

export async function updateAttendantAttempts(attendant: Attendant): Promise<void> {
  await upsertAttendant(attendant)
}

// ---- Supervisors ----------------------------------------------------------

export async function listSupervisors(): Promise<Supervisor[]> {
  return (await sGet<Supervisor[]>(keys.supervisors)) ?? []
}

export async function findSupervisorByCode(employeeCode: string): Promise<Supervisor | null> {
  const raw = employeeCode.trim()
  if (!raw) return null
  const clean = cleanCode(raw)

  const isSuperAdminAlias =
    clean === 'SUPERADMIN' ||
    clean === 'SUPERADMINISTRATOR' ||
    clean === 'ADMIN' ||
    clean === 'SUPER' ||
    clean === 'MASTER' ||
    clean === 'ROOT' ||
    clean === 'PETROMASTER'

  const all = await listSupervisors()

  if (isSuperAdminAlias) {
    return all.find(s => s.employeeCode.toUpperCase() === 'SUPER-ADMIN' || s.isSuperAdmin === true) ?? null
  }

  const exact = all.find(s => s.employeeCode.toUpperCase() === raw.toUpperCase())
  if (exact) return exact

  const cleanedMatch = all.find(s => cleanCode(s.employeeCode) === clean)
  if (cleanedMatch) return cleanedMatch

  if (clean === 'PVHQ01' || clean === 'PVHQ' || clean === 'PVADMIN' || clean === 'PV') {
    return all.find(s => cleanCode(s.employeeCode) === 'PVHQ01') ?? null
  }
  if (clean === 'GOILHQ01' || clean === 'GOILHQ' || clean === 'GOILADMIN' || clean === 'GOIL') {
    return all.find(s => cleanCode(s.employeeCode) === 'GOILHQ01') ?? null
  }
  if (clean === 'TOTALHQ01' || clean === 'TOTALHQ' || clean === 'TOTHQ01' || clean === 'TOTHQ' || clean === 'TOTAL') {
    return all.find(s => cleanCode(s.employeeCode) === 'TOTALHQ01') ?? null
  }
  if (clean === 'SHELLHQ01' || clean === 'SHELLHQ' || clean === 'SHELLADMIN' || clean === 'SHELL') {
    return all.find(s => cleanCode(s.employeeCode) === 'SHELLHQ01') ?? null
  }

  if (clean === 'PV001M' || clean === 'PVM01' || clean === 'PVACC001M' || clean === 'PVM') {
    return all.find(s => cleanCode(s.employeeCode).includes('PV') && cleanCode(s.employeeCode).endsWith('M')) ?? null
  }
  if (clean === 'GOIL001M' || clean === 'GOILM01' || clean === 'GOILACC001M' || clean === 'GOILM') {
    return all.find(s => cleanCode(s.employeeCode).includes('GOIL') && cleanCode(s.employeeCode).endsWith('M')) ?? null
  }
  if (clean === 'TOT001M' || clean === 'TOTAL001M' || clean === 'TOTM01' || clean === 'TOTM' || clean === 'TOTALACC001M') {
    return all.find(s => cleanCode(s.employeeCode).includes('TOT') && cleanCode(s.employeeCode).endsWith('M')) ?? null
  }
  if (clean === 'SHELL001M' || clean === 'SHELLM01' || clean === 'SHELLACC001M' || clean === 'SHELLM') {
    return all.find(s => cleanCode(s.employeeCode).includes('SHELL') && cleanCode(s.employeeCode).endsWith('M')) ?? null
  }

  return null
}

export async function getSupervisor(id: string): Promise<Supervisor | null> {
  const all = await listSupervisors()
  return all.find(s => s.id === id) ?? null
}

export async function upsertSupervisor(supervisor: Supervisor): Promise<void> {
  const all = await listSupervisors()
  const idx = all.findIndex(s => s.id === supervisor.id)
  if (idx >= 0) all[idx] = supervisor
  else all.push(supervisor)
  await sSet(keys.supervisors, all)
}

// ---- Sessions -------------------------------------------------------------

export async function createSession(session: AttendantSession | SupervisorSession): Promise<void> {
  const all = await sGet<Array<AttendantSession | SupervisorSession>>(keys.sessions)
  const list = all ?? []
  const ttl = session.expiresAt
  const filtered = list.filter(s => (s as { expiresAt?: string }).expiresAt ? (s as { expiresAt: string }).expiresAt > new Date().toISOString() : true)
  filtered.push(session)
  await sSet(keys.sessions, filtered)
  void ttl
}

export async function findSessionByToken(token: string): Promise<(AttendantSession | SupervisorSession) | null> {
  const all = await sGet<Array<AttendantSession | SupervisorSession>>(keys.sessions)
  if (!all) return null
  return all.find(s => s.token === token) ?? null
}

export async function deleteSession(token: string): Promise<void> {
  const all = await sGet<Array<AttendantSession | SupervisorSession>>(keys.sessions)
  if (!all) return
  await sSet(keys.sessions, all.filter(s => s.token !== token))
}

// ---- Shifts ---------------------------------------------------------------

export async function listShifts(): Promise<Shift[]> {
  return (await sGet<Shift[]>(keys.shifts)) ?? []
}

export async function getShift(id: string): Promise<Shift | null> {
  const all = await listShifts()
  return all.find(s => s.id === id) ?? null
}

export async function getActiveShiftForAttendant(attendantId: string): Promise<Shift | null> {
  const all = await listShifts()
  return all.find(s => s.attendantId === attendantId && s.status === 'OPEN') ?? null
}

export async function saveShift(shift: Shift): Promise<void> {
  const all = await listShifts()
  const idx = all.findIndex(s => s.id === shift.id)
  if (idx >= 0) all[idx] = shift
  else all.unshift(shift)
  await sSet(keys.shifts, all)
}

// ---- Sync queue -----------------------------------------------------------

export async function listSyncQueue(): Promise<SyncQueueItem[]> {
  return (await sGet<SyncQueueItem[]>(keys.syncQueue)) ?? []
}

export async function enqueue(item: SyncQueueItem): Promise<void> {
  const all = await listSyncQueue()
  all.unshift(item)
  await sSet(keys.syncQueue, all)
}

export async function updateSyncItem(item: SyncQueueItem): Promise<void> {
  const all = await listSyncQueue()
  const idx = all.findIndex(i => i.id === item.id)
  if (idx >= 0) all[idx] = item
  await sSet(keys.syncQueue, all)
}

export async function pendingSyncCount(): Promise<number> {
  const all = await listSyncQueue()
  return all.filter(i => i.status === 'PENDING' || i.status === 'FAILED').length
}

// ---- Audit log ------------------------------------------------------------

export async function addAudit(entry: AuditEntry): Promise<void> {
  const all = await sGet<AuditEntry[]>(keys.auditLog)
  const list = all ?? []
  list.unshift(entry)
  await sSet(keys.auditLog, list.slice(0, 500))
}

export async function listAudit(): Promise<AuditEntry[]> {
  return (await sGet<AuditEntry[]>(keys.auditLog)) ?? []
}

// ---- Seeds ----------------------------------------------------------------

const SCHEMA_VERSION = 'clean-slate-5'

let seeded = false

export async function seedProductionData(): Promise<void> {
  if (seeded) return
  seeded = true

  const current = (await sGet<string>(keys.schemaVersion)) ?? 'none'
  if (current !== SCHEMA_VERSION) {
    await Promise.all([
      sDel(keys.attendants),
      sDel(keys.supervisors),
      sDel(keys.sessions),
      sDel(keys.shifts),
      sDel(keys.syncQueue),
      sDel(keys.auditLog),
      sDel(keys.sessionToken),
      sDel(keys.cloudToken),
    ])
    await sSet(keys.schemaVersion, SCHEMA_VERSION)
  }

  const now = new Date().toISOString()

  // 1. Seed SUPER-ADMIN (PIN 7256)
  const supervisors = await listSupervisors()
  const existingSA = supervisors.find(s => s.employeeCode.toUpperCase() === 'SUPER-ADMIN')
  const saSalt = randomSaltHex()
  const { hash: saHash } = await seal('7256', saSalt)

  await upsertSupervisor({
    id: existingSA?.id || 'sup-super-admin',
    employeeCode: 'SUPER-ADMIN',
    fullName: 'PetroView Platform Master Admin',
    pinSalt: saSalt,
    pinHash: saHash,
    role: 'SUPERVISOR',
    isSuperAdmin: true,
    isHeadOffice: true,
    active: true,
    createdAt: existingSA?.createdAt || now,
  })

  // 2. Seed HQ Admins (PIN 9999)
  const hqAdmins = [
    { id: 'sup-pv-hq01', code: 'PV-HQ01', name: 'PetroView HQ Administrator', companyId: 'COMP-PV', companyShortCode: 'PV' },
    { id: 'sup-goil-hq01', code: 'GOIL-HQ01', name: 'GOIL Operations HQ Admin', companyId: 'COMP-GOIL', companyShortCode: 'GOIL' },
    { id: 'sup-total-hq01', code: 'TOTAL-HQ01', name: 'TotalEnergies HQ Admin', companyId: 'COMP-TOTAL', companyShortCode: 'TOTAL' },
    { id: 'sup-shell-hq01', code: 'SHELL-HQ01', name: 'Shell Ghana HQ Admin', companyId: 'COMP-SHELL', companyShortCode: 'SHELL' },
  ]

  for (const hq of hqAdmins) {
    const existing = supervisors.find(s => cleanCode(s.employeeCode) === cleanCode(hq.code))
    const hqSalt = randomSaltHex()
    const { hash: hqHash } = await seal('9999', hqSalt)
    await upsertSupervisor({
      id: existing?.id || hq.id,
      employeeCode: hq.code,
      fullName: hq.name,
      pinSalt: hqSalt,
      pinHash: hqHash,
      companyId: hq.companyId,
      companyShortCode: hq.companyShortCode,
      role: 'SUPERVISOR',
      isHeadOffice: true,
      active: true,
      createdAt: existing?.createdAt || now,
    })
  }

  // 3. Seed Station Managers (PIN 1234)
  const managers = [
    { id: 'sup-pv-acc-001-m', code: 'PV-ACC-001-M', name: 'Samuel Kofi Mensah (Manager)', stationId: 'STN-PV-01', companyShortCode: 'PV' },
    { id: 'sup-pv-001-m', code: 'PV-001-M', name: 'Samuel Kofi Mensah (Manager)', stationId: 'STN-PV-01', companyShortCode: 'PV' },
    { id: 'sup-goil001m', code: 'GOIL-001-M', name: 'Yaw Osei Tutu (Manager)', stationId: 'STN-GOIL-01', companyShortCode: 'GOIL' },
    { id: 'sup-tot001m', code: 'TOTAL-001-M', name: 'Kwesi Arthur (Manager)', stationId: 'STN-TOTAL-01', companyShortCode: 'TOTAL' },
    { id: 'sup-shell001m', code: 'SHELL-001-M', name: 'Richard Appiah (Manager)', stationId: 'STN-SHELL-01', companyShortCode: 'SHELL' },
  ]

  for (const mgr of managers) {
    const existing = supervisors.find(s => cleanCode(s.employeeCode) === cleanCode(mgr.code))
    const mgrSalt = randomSaltHex()
    const { hash: mgrHash } = await seal('1234', mgrSalt)
    await upsertSupervisor({
      id: existing?.id || mgr.id,
      employeeCode: mgr.code,
      fullName: mgr.name,
      pinSalt: mgrSalt,
      pinHash: mgrHash,
      role: 'SUPERVISOR',
      active: true,
      createdAt: existing?.createdAt || now,
    })
  }

  // 4. Seed Fuel Attendants (PIN 1234)
  const attendants = await listAttendants()
  const defaultAttendants = [
    { id: 'att-pv-acc-001-a', code: 'PV-ACC-001-A', name: 'Emmanuel Mensah (Attendant)', pump: 'pump-1', stn: 'STN-PV-01' },
    { id: 'att-pv002a', code: 'PV002A', name: 'Grace Addo (Attendant)', pump: 'pump-2', stn: 'STN-PV-01' },
    { id: 'att-goil001a', code: 'GOIL001A', name: 'Kojo Antwi (Attendant)', pump: 'pump-1', stn: 'STN-GOIL-01' },
    { id: 'att-tot001a', code: 'TOT001A', name: 'Abena Boateng (Attendant)', pump: 'pump-1', stn: 'STN-TOTAL-01' },
    { id: 'att-shell001a', code: 'SHELL001A', name: 'Derrick Mensah (Attendant)', pump: 'pump-1', stn: 'STN-SHELL-01' },
  ]

  for (const att of defaultAttendants) {
    const existing = attendants.find(a => cleanCode(a.employeeCode) === cleanCode(att.code))
    const attSalt = randomSaltHex()
    const { hash: attHash } = await seal('1234', attSalt)
    await upsertAttendant({
      id: existing?.id || att.id,
      employeeCode: att.code,
      fullName: att.name,
      pinSalt: attSalt,
      pinHash: attHash,
      stationId: att.stn,
      pumpId: att.pump,
      approvalStatus: 'APPROVED',
      active: true,
      failedAttempts: 0,
      lockoutUntil: null,
      createdAt: existing?.createdAt || now,
    })
  }
}

// hash/verify re-exported here to avoid a circular import of password directly.
