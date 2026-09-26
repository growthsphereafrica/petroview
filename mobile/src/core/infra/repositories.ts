/**
 * AsyncStorage-backed repositories for the universal build.
 * Same entities/behavior as the web (Dexie) repositories, but portable to
 * Android/iOS/web. Offline-first: all writes are local and durable.
 */

import { keys, sGet, sSet } from '../store/storage'
import type { Attendant, AuditEntry, Shift, SyncQueueItem } from '../domain/types'

// ---- Attendants -----------------------------------------------------------

export async function listAttendants(): Promise<Attendant[]> {
  return (await sGet<Attendant[]>(keys.attendants)) ?? []
}

export async function findAttendantByCode(employeeCode: string): Promise<Attendant | null> {
  const raw = employeeCode.trim().toUpperCase()
  if (!raw) return null
  const all = await listAttendants()
  return all.find(a => a.employeeCode.toUpperCase() === raw) ?? null
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


