/**
 * AsyncStorage-backed repositories for the universal build.
 * Same entities/behavior as the web (Dexie) repositories, but portable to
 * Android/iOS/web. Offline-first: all writes are local and durable.
 */

import { keys, sGet, sSet } from '../store/storage'
import { randomSaltHex, hashPin as seal } from '../infra/password'
import type { Attendant, AttendantSession, AuditEntry, Shift, Supervisor, SupervisorSession, SyncQueueItem } from '../domain/types'

// ---- Attendants -----------------------------------------------------------

export async function listAttendants(): Promise<Attendant[]> {
  return (await sGet<Attendant[]>(keys.attendants)) ?? []
}

export async function findAttendantByCode(employeeCode: string): Promise<Attendant | null> {
  const all = await listAttendants()
  return all.find(a => a.employeeCode === employeeCode) ?? null
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
  const all = await listSupervisors()
  return all.find(s => s.employeeCode === employeeCode) ?? null
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

let seeded = false

export async function seedProductionData(): Promise<void> {
  if (seeded) return
  seeded = true

  const attendants = await listAttendants()
  if (attendants.length === 0) {
    await Promise.all(
      SEED_ATTENDANTS.map(async seed => {
        const salt = randomSaltHex()
        const { hash } = await seal(seed.pin, salt)
        await upsertAttendant({
          id: `att-${seed.employeeCode}`,
          employeeCode: seed.employeeCode,
          fullName: seed.fullName,
          pinSalt: salt,
          pinHash: hash,
          pumpId: seed.pumpId,
          stationId: 'STN-GV-042',
          active: true,
          failedAttempts: 0,
          lockoutUntil: null,
          createdAt: new Date().toISOString(),
        })
      }),
    )
  }

  const supervisors = await listSupervisors()
  if (supervisors.length === 0) {
    await Promise.all(
      SEED_SUPERVISORS.map(async (seed, i) => {
        const salt = randomSaltHex()
        const { hash } = await seal(seed.pin, salt)
        await upsertSupervisor({
          id: `sup-${seed.employeeCode}`,
          employeeCode: seed.employeeCode,
          fullName: seed.fullName,
          pinSalt: salt,
          pinHash: hash,
          role: i === 0 ? 'ACCOUNTANT' : 'SUPERVISOR',
          active: true,
          createdAt: new Date().toISOString(),
        })
      }),
    )
  }
}

// hash/verify re-exported here to avoid a circular import of password directly.

export const SEED_ATTENDANTS = [
  { employeeCode: 'ATT1001', fullName: 'Kwame Mensah', pin: '2024', pumpId: 'pump-1' },
  { employeeCode: 'ATT1002', fullName: 'Ama Serwaa', pin: '3319', pumpId: 'pump-2' },
  { employeeCode: 'ATT1003', fullName: 'Kofi Boateng', pin: '1187', pumpId: 'pump-3' },
  { employeeCode: 'ATT1004', fullName: 'Akosua Owusu', pin: '5520', pumpId: 'pump-4' },
  { employeeCode: 'ATT2001', fullName: 'Yaw Darko', pin: '4726', pumpId: 'pump-2' },
  { employeeCode: 'ATT3001', fullName: 'Efua Asante', pin: '8391', pumpId: 'pump-1' },
]

export const SEED_SUPERVISORS = [
  { employeeCode: 'SUP1001', fullName: 'Daniel Osei', pin: '5678' },
  { employeeCode: 'SUP1002', fullName: 'Grace Addo', pin: '5678' },
  { employeeCode: 'SUP1003', fullName: 'Samuel Tetteh', pin: '5678' },
]
