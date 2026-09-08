/**
 * Native head-office rollup — live aggregates over stored shifts.
 * Mirrors the web build's rollupService.
 */

import { listShifts, listAttendants } from '../infra/repositories'
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
    const all = await listShifts()
    const today = startOfToday()

    const closed = all.filter(s => s.closedAt)
    const closedToday = closed.filter(s => (s.closedAt ?? '').slice(0, 10) === today)
    const litresToday = Math.round(closedToday.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0))
    const salesToday = closedToday.reduce((a, s) => a + s.actualTotal, 0)
    const netVariance = Math.round(closed.reduce((a, s) => a + s.variance, 0) * 100) / 100

    const stationNames = ['Green Valley Main', 'Airport Bypass Express', 'Takoradi Harbour Hub']
    const stations: StationRollup[] = [
      { stationId: 'STN-GV-042', name: 'Green Valley Main', region: 'Greater Accra', shiftCount: 0, litres: 0, sales: 0, netVariance: 0, pendingReview: 0 },
      { stationId: 'STN-AB-015', name: 'Airport Bypass Express', region: 'Greater Accra', shiftCount: 0, litres: 0, sales: 0, netVariance: 0, pendingReview: 0 },
      { stationId: 'STN-TH-021', name: 'Takoradi Harbour Hub', region: 'Western Region', shiftCount: 0, litres: 0, sales: 0, netVariance: 0, pendingReview: 0 },
    ]
    for (const shift of closed) {
      const agg = stations.find(s => s.stationId === shift.stationId)
      if (!agg) continue
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
          stationName: stationNames[0],
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