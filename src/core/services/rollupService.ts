/**
 * Production Head-Office & OMC Rollup Service.
 * Computes live enterprise & company aggregates from the production database
 * for specified date ranges and scoped company tenants.
 */

import { PRODUCTION_STATION, PRODUCTION_STATIONS, getStationName, registerDynamicStations } from '../domain/config'
import { shiftRepo, attendantRepo } from '../infra/repositories'
import { prodDb } from '../infra/db'
import type { Shift, CompanyStation, Attendant } from '../domain/types'

async function countTransactionsForShifts(shiftIds: string[]): Promise<number> {
  if (shiftIds.length === 0) return 0
  const txns = await prodDb.transactions.where('shiftId').anyOf(shiftIds).count()
  return txns
}

export interface StationRollup {
  stationId: string
  name: string
  code: string
  region: string
  location: string
  shiftCount: number
  litresToday: number
  salesToday: number
  carsServedToday: number
  carsServedTotal: number
  netVariance: number
  pendingReview: number
  pendingSync: number
  lastSync: string | null
}

export interface AttendantRollup {
  id?: string
  employeeCode: string
  name: string
  stationId?: string
  stationName: string
  phone?: string
  shiftsClosed: number
  litres: number
  sales: number
  carsServed: number
  variance: number
  approved: number
  rejected: number
  avgShiftSales: number
  active: boolean
  approvalStatus: string
  cashTotal?: number
  momoTotal?: number
  creditTotal?: number
  voucherTotal?: number
}

export interface HeadOfficeSummary {
  generatedAt: string
  currency: string
  rangeDays: number | null
  startDate?: string
  endDate?: string
  stationCount: number
  totalShifts: number
  shiftsToday: number
  litresToday: number
  salesToday: number
  carsServedToday: number
  carsServedTotal: number
  netVariance: number
  approved: number
  rejected: number
  pendingReview: number
  pendingSync: number
  syncCompliancePct: number
  stations: StationRollup[]
  attendants: AttendantRollup[]
  recentShifts: Shift[]
  paymentTotals?: {
    cash: number
    momo: number
    credit: number
    voucher: number
  }
}

function startOfTodayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export class RollupService {
  async summary(options?: {
    days?: number | null
    companyId?: string
    stationId?: string
    startDate?: string
    endDate?: string
  }): Promise<HeadOfficeSummary> {
    const today = startOfTodayIso()

    // 1. Fetch real company stations
    let targetStations: { id: string; name: string; code: string; location: string; region: string }[] = []

    if (options?.stationId) {
      const dbStation = await prodDb.companyStations.get(options.stationId)
      if (dbStation) {
        targetStations = [
          {
            id: dbStation.id,
            name: dbStation.name,
            code: dbStation.code,
            location: dbStation.location,
            region: dbStation.region,
          },
        ]
      } else {
        const staticStn = PRODUCTION_STATIONS.find(s => s.id === options.stationId)
        if (staticStn) {
          targetStations = [
            {
              id: staticStn.id,
              name: staticStn.name,
              code: staticStn.code,
              location: staticStn.location,
              region: staticStn.region,
            },
          ]
        }
      }
    } else if (options?.companyId) {
      const dbCompanyStations = await prodDb.companyStations.where('companyId').equals(options.companyId).toArray()
      targetStations = dbCompanyStations.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        location: s.location,
        region: s.region,
      }))
    } else {
      const allCompStations = await prodDb.companyStations.toArray()
      targetStations = allCompStations.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        location: s.location,
        region: s.region,
      }))
    }

    if (targetStations.length > 0) {
      registerDynamicStations(targetStations)
    }

    const stationIdSet = new Set(targetStations.map(s => s.id))

    // 2. Fetch all shifts and filter by company stations and date range
    const allShifts = await shiftRepo.listAll()

    let companyShifts = options?.companyId
      ? allShifts.filter(s => stationIdSet.has(s.stationId))
      : allShifts

    // If no shifts matched target stations but companyId is set, check if shifts match any station or attendant company
    if (options?.companyId && companyShifts.length === 0) {
      companyShifts = allShifts.filter(s => stationIdSet.has(s.stationId))
    }

    // Filter by Date Range
    let inRangeShifts = companyShifts

    if (options?.startDate && options?.endDate) {
      const startIso = options.startDate.includes('T') ? options.startDate : `${options.startDate}T00:00:00.000Z`
      const endIso = options.endDate.includes('T') ? options.endDate : `${options.endDate}T23:59:59.999Z`
      inRangeShifts = companyShifts.filter(s => {
        const d = s.closedAt || s.openedAt
        return d >= startIso && d <= endIso
      })
    } else if (options?.days != null) {
      const cutoffDate = new Date(Date.now() - options.days * 86_400_000).toISOString()
      inRangeShifts = companyShifts.filter(s => (s.closedAt || s.openedAt) >= cutoffDate)
    }

    const closed = inRangeShifts.filter(s => s.closedAt)
    const closedToday = closed.filter(s => (s.closedAt || '').slice(0, 10) === today)
    const litresToday = closed.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0)
    const salesToday = Math.round(closed.reduce((a, s) => a + s.actualTotal, 0))
    const netVariance = Math.round(closed.reduce((a, s) => a + s.variance, 0) * 100) / 100

    const paymentTotals = {
      cash: Math.round(closed.reduce((a, s) => a + (s.payments?.CASH || 0), 0)),
      momo: Math.round(closed.reduce((a, s) => a + (s.payments?.MOMO || 0), 0)),
      credit: Math.round(closed.reduce((a, s) => a + (s.payments?.CREDIT || 0), 0)),
      voucher: Math.round(closed.reduce((a, s) => a + (s.payments?.VOUCHER || 0), 0)),
    }

    const pendingReview = closed.filter(s => s.status === 'CLOSED').length
    const approved = closed.filter(s => s.status === 'APPROVED').length
    const rejected = closed.filter(s => s.status === 'REJECTED').length

    // Cars served = total transactions across closed shifts
    const carsServedToday = await countTransactionsForShifts(closedToday.map(s => s.id))
    const carsServedTotal = await countTransactionsForShifts(closed.map(s => s.id))

    const pendingShiftSync = inRangeShifts.filter(s => s.syncStatus === 'PENDING').length
    const totalSyncUnits = inRangeShifts.length + 1
    const syncCompliancePct = Math.round(((inRangeShifts.length + 1 - pendingShiftSync) / totalSyncUnits) * 1000) / 10

    // 3. Compute Per-Station Rollup
    const stationRollups: StationRollup[] = targetStations.map(st => {
      const shifts = inRangeShifts.filter(s => s.stationId === st.id)
      const siteClosed = shifts.filter(s => s.closedAt)
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
        litresToday: siteClosed.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0),
        salesToday: Math.round(siteClosed.reduce((a, s) => a + s.actualTotal, 0)),
        carsServedToday: 0,
        carsServedTotal: 0,
        netVariance: Math.round(siteClosed.reduce((a, s) => a + s.variance, 0) * 100) / 100,
        pendingReview: siteClosed.filter(s => s.status === 'CLOSED').length,
        pendingSync: shifts.filter(s => s.syncStatus === 'PENDING').length,
        lastSync: lastSyncTimes.length ? lastSyncTimes[lastSyncTimes.length - 1] : null,
      }
    })

    // Compute cars served per station
    for (const st of stationRollups) {
      const siteClosed = inRangeShifts.filter(s => s.stationId === st.stationId && s.closedAt)
      const siteClosedToday = siteClosed.filter(s => (s.closedAt || '').slice(0, 10) === today)
      st.carsServedToday = await countTransactionsForShifts(siteClosedToday.map(s => s.id))
      st.carsServedTotal = await countTransactionsForShifts(siteClosed.map(s => s.id))
    }

    // 4. Compute Attendant Staff Rollup
    const allAttendants = await prodDb.attendants.toArray()
    const targetAttendants = options?.stationId
      ? allAttendants.filter(a => a.stationId === options.stationId)
      : options?.companyId
      ? allAttendants.filter(a => a.companyId === options.companyId || (stationIdSet.size > 0 && stationIdSet.has(a.stationId)))
      : allAttendants

    const attendantRollups: AttendantRollup[] = (await Promise.all(targetAttendants
      .map(async att => {
        const shifts = inRangeShifts.filter(s => s.attendantId === att.id || s.attendantName === att.fullName)
        const closedShifts = shifts.filter(s => s.closedAt)
        const totalSales = Math.round(closedShifts.reduce((a, s) => a + s.actualTotal, 0))
        const totalLitres = closedShifts.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0)
        const totalVar = Math.round(closedShifts.reduce((a, s) => a + s.variance, 0) * 100) / 100

        const stn = targetStations.find(s => s.id === att.stationId)
        const stationName = stn?.name || getStationName(att.stationId)

        return {
          id: att.id,
          employeeCode: att.employeeCode,
          name: att.fullName,
          stationId: att.stationId,
          stationName,
          phone: att.phone,
          shiftsClosed: closedShifts.length,
          litres: totalLitres,
          sales: totalSales,
          carsServed: await countTransactionsForShifts(closedShifts.map(s => s.id)),
          variance: totalVar,
          approved: closedShifts.filter(s => s.status === 'APPROVED').length,
          rejected: closedShifts.filter(s => s.status === 'REJECTED').length,
          avgShiftSales: closedShifts.length > 0 ? Math.round(totalSales / closedShifts.length) : 0,
          active: att.active,
          approvalStatus: att.approvalStatus,
          cashTotal: Math.round(closedShifts.reduce((a, s) => a + (s.payments?.CASH || 0), 0)),
          momoTotal: Math.round(closedShifts.reduce((a, s) => a + (s.payments?.MOMO || 0), 0)),
          creditTotal: Math.round(closedShifts.reduce((a, s) => a + (s.payments?.CREDIT || 0), 0)),
          voucherTotal: Math.round(closedShifts.reduce((a, s) => a + (s.payments?.VOUCHER || 0), 0)),
        }
      }))).sort((a, b) => b.sales - a.sales)

    return {
      generatedAt: new Date().toISOString(),
      currency: PRODUCTION_STATION.currency,
      rangeDays: options?.days ?? null,
      startDate: options?.startDate,
      endDate: options?.endDate,
      stationCount: targetStations.length,
      totalShifts: inRangeShifts.length,
      shiftsToday: inRangeShifts.filter(s => (s.openedAt || '').slice(0, 10) === today).length,
      litresToday,
      salesToday,
      carsServedToday,
      carsServedTotal,
      netVariance,
      approved,
      rejected,
      pendingReview,
      pendingSync: pendingShiftSync,
      syncCompliancePct,
      stations: stationRollups,
      attendants: attendantRollups,
      recentShifts: [...inRangeShifts]
        .sort((a, b) => new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime())
        .slice(0, 10),
      paymentTotals,
    }
  }
}

export const rollupService = new RollupService()