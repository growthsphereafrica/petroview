/**
 * Head-office rollup service.
 * Computes live enterprise aggregates from the production database —
 * replacing the hard-coded demo stats with real, derived numbers.
 */

import { PRODUCTION_STATION, PRODUCTION_STATIONS } from '../domain/config'
import { shiftRepo, attendantRepo } from '../infra/repositories'
import type { Shift } from '../domain/types'

export interface StationRollup {
  stationId: string
  name: string
  code: string
  region: string
  location: string
  shiftCount: number
  litresToday: number
  salesToday: number
  netVariance: number
  pendingReview: number
  pendingSync: number
  lastSync: string | null
}

export interface AttendantRollup {
  employeeCode: string
  name: string
  stationName: string
  shiftsClosed: number
  litres: number
  sales: number
  variance: number
  approved: number
}

export interface HeadOfficeSummary {
  generatedAt: string
  currency: string
  rangeDays: number | null
  stationCount: number
  totalShifts: number
  shiftsToday: number
  litresToday: number
  salesToday: number
  netVariance: number
  approved: number
  rejected: number
  pendingReview: number
  pendingSync: number
  syncCompliancePct: number
  stations: StationRollup[]
  attendants: AttendantRollup[]
  recentShifts: Shift[]
}

function startOfTodayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export class RollupService {
  async summary(options?: { days?: number }): Promise<HeadOfficeSummary> {
    const all = await shiftRepo.listAll()
    const today = startOfTodayIso()

    const cutoffDate = options?.days != null ? new Date(Date.now() - options.days * 86_400_000).toISOString() : null
    const inRange = cutoffDate ? all.filter(s => s.openedAt >= cutoffDate) : all

    const closed = inRange.filter(s => s.closedAt)
    const closedToday = closed.filter(s => (s.closedAt || '').slice(0, 10) === today)
    const litresToday = closedToday.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0)
    const salesToday = Math.round(closedToday.reduce((a, s) => a + s.actualTotal, 0))
    const netVariance = Math.round(closed.reduce((a, s) => a + s.variance, 0) * 100) / 100

    const pendingReview = closed.filter(s => s.status === 'CLOSED').length
    const approved = closed.filter(s => s.status === 'APPROVED').length
    const rejected = closed.filter(s => s.status === 'REJECTED').length

    const pendingShiftSync = all.filter(s => s.syncStatus === 'PENDING').length
    const totalSyncUnits = all.length + 1
    const syncCompliancePct = Math.round(((all.length + 1 - pendingShiftSync) / totalSyncUnits) * 1000) / 10

    const stations: StationRollup[] = PRODUCTION_STATIONS.map(st => {
      const shifts = inRange.filter(s => s.stationId === st.id)
      const siteClosed = shifts.filter(s => s.closedAt)
      const siteClosedToday = siteClosed.filter(s => (s.closedAt || '').slice(0, 10) === today)
      const lastSyncTimes = shifts
        .map(s => s.updatedAt)
        .filter(Boolean)
        .sort()
      return {
        stationId: st.id,
        name: st.name,
        code: st.code,
        region: st.region,
        location: st.location,
        shiftCount: shifts.length,
        litresToday: siteClosedToday.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0),
        salesToday: Math.round(siteClosedToday.reduce((a, s) => a + s.actualTotal, 0)),
        netVariance: Math.round(siteClosed.reduce((a, s) => a + s.variance, 0) * 100) / 100,
        pendingReview: siteClosed.filter(s => s.status === 'CLOSED').length,
        pendingSync: shifts.filter(s => s.syncStatus === 'PENDING').length,
        lastSync: lastSyncTimes.length ? lastSyncTimes[lastSyncTimes.length - 1] : null,
      }
    })

    const attendants = await attendantRepo.listActive()
    const attendantRollups: AttendantRollup[] = attendants.map(att => {
      const shifts = inRange.filter(s => s.attendantId === att.id)
      const closed = shifts.filter(s => s.closedAt)
      return {
        employeeCode: att.employeeCode,
        name: att.fullName,
        stationName: getStationDisplayName(att.stationId),
        shiftsClosed: closed.length,
        litres: closed.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0),
        sales: Math.round(closed.reduce((a, s) => a + s.actualTotal, 0)),
        variance: Math.round(closed.reduce((a, s) => a + s.variance, 0) * 100) / 100,
        approved: closed.filter(s => s.status === 'APPROVED').length,
      }
    }).sort((a, b) => b.sales - a.sales)

    return {
      generatedAt: new Date().toISOString(),
      currency: PRODUCTION_STATION.currency,
      rangeDays: options?.days ?? null,
      stationCount: PRODUCTION_STATIONS.length,
      totalShifts: inRange.length,
      shiftsToday: inRange.filter(s => (s.openedAt || '').slice(0, 10) === today).length,
      litresToday,
      salesToday,
      netVariance,
      approved,
      rejected,
      pendingReview,
      pendingSync: pendingShiftSync,
      syncCompliancePct,
      stations,
      attendants: attendantRollups,
      recentShifts: [...inRange]
        .sort((a, b) => new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime())
        .slice(0, 6),
    }
  }
}

function getStationDisplayName(stationId: string): string {
  return PRODUCTION_STATIONS.find(s => s.id === stationId)?.name ?? stationId
}

export const rollupService = new RollupService()