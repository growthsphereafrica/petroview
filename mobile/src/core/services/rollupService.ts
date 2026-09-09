/**
 * Native head-office rollup — live aggregates over stored shifts.
 * Fetches real-time multi-station data from cloud when online,
 * with resilient offline fallback to local repositories.
 */

import { listShifts, listAttendants } from '../infra/repositories'
import { getCloudApiBase, getCloudToken } from '../infra/cloudApi'
import type { Shift } from '../domain/types'

export interface StationRollup {
  stationId: string
  name: string
  region: string
  shiftCount: number
  litres: number
  sales: number
  netVariance: number
  pendingReview: number
}

export interface AttendantRollup {
  employeeCode: string
  name: string
  stationName: string
  shiftsClosed: number
  litres: number
  sales: number
}

export interface HqSummary {
  generatedAt: string
  totalShifts: number
  openShifts: number
  litresToday: number
  salesToday: number
  netVariance: number
  pendingReview: number
  approved: number
  rejected: number
  stations: StationRollup[]
  attendants: AttendantRollup[]
  recentShifts: Shift[]
}

function startOfToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export class RollupService {
  async summary(): Promise<HqSummary> {
    const base = getCloudApiBase()
    const token = await getCloudToken()

    // 1. Try live backend cloud summary first
    if (base && token) {
      try {
        const resp = await fetch(`${base}/api/headoffice/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (resp.ok) {
          const c = (await resp.json()) as {
            generatedAt: string
            totalShifts: number
            shiftsToday: number
            litresToday: number
            salesToday: number
            netVariance: number
            pendingReview: number
            approved: number
            rejected: number
            stations: Array<{
              stationId: string
              name: string
              region: string
              shiftCount: number
              litresToday: number
              salesToday: number
              netVariance: number
              pendingReview: number
            }>
            attendants: Array<{
              employeeCode: string
              name: string
              shiftsClosed: number
              litres: number
              sales: number
            }>
            recentShifts: Shift[]
          }
          if (c && c.stations) {
            return {
              generatedAt: c.generatedAt || new Date().toISOString(),
              totalShifts: c.totalShifts || 0,
              openShifts: c.shiftsToday || 0,
              litresToday: c.litresToday || 0,
              salesToday: c.salesToday || 0,
              netVariance: c.netVariance || 0,
              pendingReview: c.pendingReview || 0,
              approved: c.approved || 0,
              rejected: c.rejected || 0,
              stations: c.stations.map(st => ({
                stationId: st.stationId,
                name: st.name,
                region: st.region,
                shiftCount: st.shiftCount,
                litres: st.litresToday,
                sales: st.salesToday,
                netVariance: st.netVariance,
                pendingReview: st.pendingReview,
              })),
              attendants: (c.attendants || []).map(a => ({
                employeeCode: a.employeeCode,
                name: a.name,
                stationName: 'Forecourt Network',
                shiftsClosed: a.shiftsClosed,
                litres: a.litres,
                sales: a.sales,
              })),
              recentShifts: c.recentShifts || [],
            }
          }
        }
      } catch {
        // Fall back to local aggregation
      }
    }

    // 2. Offline local aggregation fallback
    const all = await listShifts()
    const today = startOfToday()

    const closed = all.filter(s => s.closedAt)
    const closedToday = closed.filter(s => (s.closedAt ?? '').slice(0, 10) === today)
    const litresToday = Math.round(closedToday.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0))
    const salesToday = closedToday.reduce((a, s) => a + s.actualTotal, 0)
    const netVariance = Math.round(closed.reduce((a, s) => a + s.variance, 0) * 100) / 100

    const stations: StationRollup[] = []
    for (const shift of closed) {
      let agg = stations.find(s => s.stationId === shift.stationId)
      if (!agg) {
        agg = {
          stationId: shift.stationId,
          name: shift.stationName || `Station ${shift.stationId}`,
          region: 'Active Region',
          shiftCount: 0,
          litres: 0,
          sales: 0,
          netVariance: 0,
          pendingReview: 0,
        }
        stations.push(agg)
      }
      agg.shiftCount += 1
      agg.litres += Math.round(shift.sales.reduce((x, y) => x + y.litres, 0))
      agg.sales += shift.actualTotal
      agg.netVariance += shift.variance
      if (shift.status === 'CLOSED') agg.pendingReview += 1
    }
    for (const st of stations) st.netVariance = Math.round(st.netVariance * 100) / 100

    const attendants = await listAttendants()
    const attendantRollups: AttendantRollup[] = attendants
      .filter(a => a.active)
      .map(a => {
        const shifts = closed.filter(s => s.attendantId === a.id)
        return {
          employeeCode: a.employeeCode,
          name: a.fullName,
          stationName: a.stationId || 'Main Station',
          shiftsClosed: shifts.length,
          litres: Math.round(shifts.reduce((acc, s) => acc + s.sales.reduce((x, y) => x + y.litres, 0), 0)),
          sales: shifts.reduce((acc, s) => acc + s.actualTotal, 0),
        }
      })
      .sort((x, y) => y.sales - x.sales)

    return {
      generatedAt: new Date().toISOString(),
      totalShifts: all.length,
      openShifts: all.filter(s => s.status === 'OPEN').length,
      litresToday,
      salesToday,
      netVariance,
      pendingReview: closed.filter(s => s.status === 'CLOSED').length,
      approved: closed.filter(s => s.status === 'APPROVED').length,
      rejected: closed.filter(s => s.status === 'REJECTED').length,
      stations,
      attendants: attendantRollups,
      recentShifts: all.slice().sort((a, b) => new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime()).slice(0, 6),
    }
  }
}

export const rollupService = new RollupService()