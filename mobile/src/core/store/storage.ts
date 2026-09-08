/**
 * Cross-platform KV store for the universal app.
 * - Native (iOS/Android): AsyncStorage
 * - Web: localStorage
 * Single async interface used by the mobile repositories.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const IS_WEB = Platform.OS === 'web'

export interface StorageLike {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  getAllKeys(): Promise<readonly string[]>
}

async function webGetAllKeys(): Promise<readonly string[]> {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    keys.push(localStorage.key(i) as string)
  }
  return keys
}

export const storage: StorageLike = IS_WEB
  ? {
      getItem: async key => localStorage.getItem(key),
      setItem: async (key, value) => {
        localStorage.setItem(key, value)
      },
      removeItem: async key => {
        localStorage.removeItem(key)
      },
      getAllKeys: webGetAllKeys,
    }
  : AsyncStorage

/** In-memory cache to make reads fast across repos within a session. */
const memoryCache = new Map<string, string>()

export async function sGet<T>(key: string): Promise<T | null> {
  if (memoryCache.has(key)) {
    try {
      return JSON.parse(memoryCache.get(key) as string) as T
    } catch {
      memoryCache.delete(key)
    }
  }
  const raw = await storage.getItem(key)
  if (raw == null) return null
  memoryCache.set(key, raw)
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function sSet<T>(key: string, value: T): Promise<void> {
  const raw = JSON.stringify(value)
  memoryCache.set(key, raw)
  await storage.setItem(key, raw)
}

export async function sDel(key: string): Promise<void> {
  memoryCache.delete(key)
  await storage.removeItem(key)
}

/** Prefix scopes keys per role/entity type. */
export const keys = {
  attendants: 'mvp_m_attendants',
  supervisors: 'mvp_m_supervisors',
  sessions: 'mvp_m_sessions',
  shifts: 'mvp_m_shifts',
  syncQueue: 'mvp_m_sync_queue',
  auditLog: 'mvp_m_audit_log',
  sessionToken: 'mvp_m_session_token',
}
