/**
 * Tank Readings — record daily dip/stock readings per tank and review the
 * history of readings stored on the shared backend.
 */

import React, { useEffect, useState } from 'react'
import { Droplets, Gauge, Plus, History, RefreshCw, Save } from 'lucide-react'
import { useSupervisorSession } from '../providers'
import { Badge, BigActionButton, Card, ScreenHeader, StatusBar, TappableRow } from '../../shared/ui'
import { formatDateTime, formatLitres } from '../../../utils/currencyFormatter'
import { FUEL_META } from '../../../core/domain/config'
import { backendGetTankReadings, backendRecordTankReadings } from '../../../services/backendApiService'
import { prodDb } from '../../../core/infra/db'
import { syncQueueRepo } from '../../../core/infra/repositories'
import { syncService } from '../../../core/services/syncService'
import type { SyncStatus, TankReadingRecord } from '../../../core/domain/types'

interface TankReadingEntry {
  tankId: string
  fuelCode: string
  openingLevel: number
  closingLevel: number
  dipStock: number
  received: number
  notes?: string
}

interface ReadingRow {
  id: string
  stationId: string
  companyId: string | null
  recordedBy: string
  recordedByName: string
  readings: TankReadingEntry[]
  recordedAt: string
  notes: string | null
  createdAt: string
  syncStatus?: SyncStatus
}

const TANK_ID_PREFIX = /^[A-Z]{3}(\d)?$/

export const SupervisorTankReadingsScreen: React.FC<{
  onBack: () => void
  defaultStationId?: string
  defaultStationName?: string
}> = ({ onBack, defaultStationId, defaultStationName }) => {
  const { supervisor } = useSupervisorSession()
  const stationId = defaultStationId ?? supervisor?.stationId ?? ''
  const stationName = defaultStationName ?? ''

  const [mode, setMode] = useState<'record' | 'history'>('history')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [readings, setReadings] = useState<ReadingRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [entries, setEntries] = useState<TankReadingEntry[]>([
    { tankId: 'TK1', fuelCode: 'PMS', openingLevel: 0, closingLevel: 0, dipStock: 0, received: 0 },
    { tankId: 'TK2', fuelCode: 'AGO', openingLevel: 0, closingLevel: 0, dipStock: 0, received: 0 },
  ])
  const [notes, setNotes] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Load local offline records first
      let localRecords: ReadingRow[] = []
      try {
        const local = await prodDb.tankReadings
          .filter(r => !stationId || r.stationId === stationId)
          .toArray()
        localRecords = local.map(r => ({
          id: r.id,
          stationId: r.stationId,
          companyId: r.companyId ?? null,
          recordedBy: r.recordedBy,
          recordedByName: r.recordedByName,
          readings: r.readings,
          recordedAt: r.recordedAt,
          notes: r.notes ?? null,
          createdAt: r.createdAt,
          syncStatus: r.syncStatus,
        }))
      } catch (localErr) {
        console.warn('[TankReadings] Local DB read error:', localErr)
      }

      // 2. Fetch remote records from server if online
      try {
        const res = await backendGetTankReadings(stationId || undefined, 30)
        const remoteList = (res.readings as unknown as ReadingRow[]) || []
        
        // Cache remote records into local Dexie for offline backup
        for (const rem of remoteList) {
          await prodDb.tankReadings.put({
            id: rem.id,
            stationId: rem.stationId,
            companyId: rem.companyId,
            recordedBy: rem.recordedBy,
            recordedByName: rem.recordedByName,
            readings: rem.readings,
            notes: rem.notes,
            recordedAt: rem.recordedAt,
            createdAt: rem.createdAt,
            syncStatus: 'SYNCED',
          })
        }

        // Merge local & remote (remote wins for duplicates)
        const mergedMap = new Map<string, ReadingRow>()
        localRecords.forEach(r => mergedMap.set(r.id, r))
        remoteList.forEach(r => mergedMap.set(r.id, { ...r, syncStatus: 'SYNCED' }))

        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
        )
        setReadings(merged)
      } catch {
        // Offline: display local records
        if (localRecords.length > 0) {
          setReadings(localRecords.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()))
        } else {
          setError('Could not reach server. Showing offline readings.')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId])

  const updateEntry = (index: number, field: keyof TankReadingEntry, value: string) => {
    setEntries(prev =>
      prev.map((e, i) => {
        if (i !== index) return e
        if (field === 'tankId' || field === 'fuelCode' || field === 'notes') {
          return { ...e, [field]: value }
        }
        return { ...e, [field]: Number(value) || 0 }
      }),
    )
  }

  const addEntry = () => {
    setEntries(prev => [...prev, { tankId: '', fuelCode: 'PMS', openingLevel: 0, closingLevel: 0, dipStock: 0, received: 0 }])
  }

  const removeEntry = (index: number) => {
    setEntries(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stationId) {
      setError('A station is not associated with this account. Contact your OMC HQ Admin.')
      return
    }
    const validEntries = entries.filter(en => TANK_ID_PREFIX.test(en.tankId))
    if (validEntries.length === 0) {
      setError('Add at least one tank with a valid ID (e.g. TK1).')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)

    const now = new Date().toISOString()
    const newId = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    // 1. Store in local Dexie database FIRST (zero-data loss guarantee)
    const localRecord: TankReadingRecord = {
      id: newId,
      stationId,
      companyId: supervisor?.companyId || null,
      recordedBy: supervisor?.id || 'supervisor',
      recordedByName: supervisor?.fullName || 'Supervisor',
      readings: validEntries,
      notes: notes || null,
      recordedAt: now,
      createdAt: now,
      syncStatus: 'PENDING',
    }
    await prodDb.tankReadings.put(localRecord)

    // 2. Add to syncQueue
    await syncQueueRepo.add({
      id: `sq-${crypto.randomUUID()}`,
      entityType: 'TANK_READING',
      entityId: newId,
      status: 'PENDING',
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })

    // 3. Attempt cloud push immediately
    let synced = false
    try {
      await backendRecordTankReadings({
        stationId,
        readings: validEntries,
        notes: notes || undefined,
      })
      await prodDb.tankReadings.update(newId, { syncStatus: 'SYNCED' })
      synced = true
      setSuccess(`Saved ${validEntries.length} reading${validEntries.length === 1 ? '' : 's'} (Synced to Cloud).`)
    } catch {
      // Offline fallback
      setSuccess(`Saved ${validEntries.length} reading${validEntries.length === 1 ? '' : 's'} (Saved Offline · Will auto-sync when online).`)
      void syncService.runPendingSync()
    } finally {
      setSaving(false)
      setEntries([
        { tankId: 'TK1', fuelCode: 'PMS', openingLevel: 0, closingLevel: 0, dipStock: 0, received: 0 },
        { tankId: 'TK2', fuelCode: 'AGO', openingLevel: 0, closingLevel: 0, dipStock: 0, received: 0 },
      ])
      setNotes('')
      setMode('history')
      void load()
    }
  }

  const totalDip = readings.reduce((a, r) => a + r.readings.reduce((x, y) => x + (y.dipStock || 0), 0), 0)

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-y-auto">
      <StatusBar online />
      <ScreenHeader
        title="Tank Readings"
        subtitle={stationName || (stationId ? 'Record dip & stock levels' : 'Station readings')}
        onBack={onBack}
        right={
          <button
            onClick={() => setMode(mode === 'history' ? 'record' : 'history')}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-orange-400 transition"
            title={mode === 'history' ? 'Record new readings' : 'View history'}
          >
            {mode === 'history' ? <Plus className="w-4 h-4" /> : <History className="w-4 h-4" />}
          </button>
        }
      />

      <div className="flex-1 px-4 py-4 max-w-4xl w-full mx-auto flex flex-col gap-4">
        <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-1 overflow-hidden">
          {(['history', 'record'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wide transition ${
                mode === m ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {m === 'history' ? 'History' : 'Record'}
            </button>
          ))}
        </div>

        {success && (
          <div className="rounded-2xl bg-emerald-950 border border-emerald-600 px-4 py-3 text-xs font-bold text-emerald-300">
            {success}
          </div>
        )}
        {error && (
          <div className="rounded-2xl bg-rose-950 border border-rose-600 px-4 py-3 text-xs font-bold text-rose-300">
            {error}
          </div>
        )}

        {mode === 'history' && (
          <>
            {loading ? (
              <Card className="p-6 text-center">
                <RefreshCw className="w-6 h-6 text-slate-600 mx-auto mb-2 animate-spin" />
                <p className="text-xs font-bold text-slate-400">Loading readings…</p>
              </Card>
            ) : readings.length === 0 ? (
              <Card className="p-6 text-center">
                <Droplets className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">No readings recorded</p>
                <p className="text-[11px] text-slate-600 mt-1">Tap “Record” to enter today’s dip levels.</p>
              </Card>
            ) : (
              <>
                <Card className="p-4 bg-slate-900/90 shadow-md">
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-4 h-4 text-emerald-400" />
                    <p className="text-[9px] uppercase font-bold text-slate-500">Aggregate dip stock</p>
                  </div>
                  <p className="text-2xl font-black text-emerald-400">{formatLitres(totalDip)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{readings.length} reading set{readings.length === 1 ? '' : 's'} (30 days)</p>
                </Card>

                <Card className="divide-y divide-slate-800/70 overflow-hidden">
                  {readings.map(r => (
                    <div key={r.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] font-bold text-white">{formatDateTime(r.recordedAt)}</p>
                        <div className="flex items-center gap-2">
                          {r.syncStatus === 'PENDING' ? (
                            <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                              OFFLINE PENDING
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                              SYNCED
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">{r.readings.length} tank{r.readings.length === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2">{r.recordedByName}</p>
                      <div className="flex flex-col gap-1.5">
                        {r.readings.map((rd, i) => {
                          const meta = FUEL_META[rd.fuelCode as keyof typeof FUEL_META]
                          return (
                            <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/70 border border-slate-800/60 px-3 py-2">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta?.color ?? '#10B981' }} />
                                <span className="text-[11px] font-bold text-white truncate">{rd.tankId || 'Tank'}</span>
                                <span className="text-[10px] font-mono text-slate-500 shrink-0">{meta?.shortLabel ?? rd.fuelCode}</span>
                              </span>
                              <span className="text-[10px] font-mono text-slate-400 shrink-0">{Math.round(rd.dipStock || 0)}L dip</span>
                            </div>
                          )
                        })}
                      </div>
                      {r.notes && <p className="text-[11px] text-slate-400 mt-2 leading-snug">{r.notes}</p>}
                    </div>
                  ))}
                </Card>
              </>
            )}
          </>
        )}

        {mode === 'record' && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Droplets className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-extrabold text-white">Today’s dip levels</p>
              </div>
              {entries.map((entry, index) => (
                <div key={index} className="mb-4 border-b border-slate-800/70 last:border-0 last:mb-0 pb-4 last:pb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={entry.tankId}
                      onChange={e => updateEntry(index, 'tankId', e.target.value)}
                      placeholder="TK1"
                      className="w-16 rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-mono font-bold text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
                    />
                    <select
                      value={entry.fuelCode}
                      onChange={e => updateEntry(index, 'fuelCode', e.target.value)}
                      className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-bold text-white focus:border-emerald-500 outline-none"
                    >
                      {Object.entries(FUEL_META).map(([code, m]) => (
                        <option key={code} value={code}>{m.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeEntry(index)}
                      disabled={entries.length === 1}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 disabled:opacity-40 text-xs"
                      title="Remove tank"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[9px] uppercase font-bold text-slate-500">Opening (L)</span>
                      <input
                        type="number" min={0} step="any"
                        value={entry.openingLevel || ''}
                        onChange={e => updateEntry(index, 'openingLevel', e.target.value)}
                        placeholder="0"
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[9px] uppercase font-bold text-slate-500">Closing (L)</span>
                      <input
                        type="number" min={0} step="any"
                        value={entry.closingLevel || ''}
                        onChange={e => updateEntry(index, 'closingLevel', e.target.value)}
                        placeholder="0"
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[9px] uppercase font-bold text-slate-500">Dip stock (L)</span>
                      <input
                        type="number" min={0} step="any"
                        value={entry.dipStock || ''}
                        onChange={e => updateEntry(index, 'dipStock', e.target.value)}
                        placeholder="0"
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[9px] uppercase font-bold text-slate-500">Received (L)</span>
                      <input
                        type="number" min={0} step="any"
                        value={entry.received || ''}
                        onChange={e => updateEntry(index, 'received', e.target.value)}
                        placeholder="0"
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-mono text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addEntry}
                className="w-full mt-1 py-2 rounded-lg border border-dashed border-slate-700 text-xs font-bold text-slate-400 hover:text-emerald-400 hover:border-emerald-600 transition"
              >
                + Add tank
              </button>
            </Card>

            <label className="block">
              <span className="text-[9px] uppercase font-bold text-slate-500">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Delivery, pump issues, calibration notes…"
                rows={2}
                className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none resize-none"
              />
            </label>

            <BigActionButton variant="flame" loading={saving}>
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Readings'}
            </BigActionButton>
          </form>
        )}
      </div>
    </div>
  )
}
