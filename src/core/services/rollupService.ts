/**
 * Production Head-Office & OMC Rollup Service.
 * Computes live enterprise & company aggregates from the production database
 * for specified date ranges and scoped company tenants.
 */

import { PRODUCTION_STATION, PRODUCTION_STATIONS, getStationName, registerDynamicStations } from '../domain/config'
import { roundLitres, roundMoney } from '../domain/rules'
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
  activeStationCount: number
  stationCoveragePct: number
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
    let targetStations: { id: string; name: string; code: string; location: string; region: string; active: boolean }[] = []

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
            active: dbStation.active,
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
              active: true,
            },
          ]
        }
      }
    } else if (options?.companyId) {
      let dbCompanyStations = await prodDb.companyStations.where('companyId').equals(options.companyId).toArray()
      if (dbCompanyStations.length === 0) {
        try {
          const { backendGetCompanyStations } = await import('../../services/backendApiService')
          const liveStations = await backendGetCompanyStations(options.companyId)
          if (liveStations.length > 0) {
            for (const st of liveStations) {
              await prodDb.companyStations.put({
                id: st.id,
                companyId: st.companyId,
                name: st.name,
                code: st.code,
                location: st.location,
                region: st.region,
                pumpsCount: st.pumpsCount,
                active: st.active,
                createdAt: new Date().toISOString(),
              })
            }
            dbCompanyStations = await prodDb.companyStations.where('companyId').equals(options.companyId).toArray()
          }
        } catch { /* offline */ }
      }
      targetStations = dbCompanyStations.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        location: s.location,
        region: s.region,
        active: s.active,
      }))
    } else {
      const allCompStations = await prodDb.companyStations.toArray()
      targetStations = allCompStations.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        location: s.location,
        region: s.region,
        active: s.active,
      }))
    }

    if (targetStations.length > 0) {
      registerDynamicStations(targetStations)
    }

    const stationIdSet = new Set(targetStations.map(s => s.id))

    // 2. Fetch all shifts from backend API first (global synchronization), then local
    if (options?.companyId) {
      try {
        const { backendGetShiftsByCompany } = await import('../../services/backendApiService')
        const liveShifts = await backendGetShiftsByCompany(options.companyId)
        if (liveShifts?.shifts && Array.isArray(liveShifts.shifts)) {
          for (const s of liveShifts.shifts) {
            await shiftRepo.upsert(s as any)
          }
        }
      } catch { /* offline fallback */ }
    }

    const allShifts = await shiftRepo.listAll()

    const cleanComp = options?.companyId?.toLowerCase().replace('comp-', '') || ''
    let companyShifts = options?.companyId
      ? allShifts.filter(
          s =>
            (s as any).companyId === options.companyId ||
            (s as any).companyShortCode === options.companyId ||
            (s as any).companyShortCode?.toLowerCase() === cleanComp ||
            stationIdSet.has(s.stationId) ||
            s.stationId.toLowerCase().includes(cleanComp) ||
            (s.attendantName && s.attendantName.toUpperCase().startsWith(cleanComp.toUpperCase())) ||
            (targetStations.length > 0 && targetStations.some(st => st.name.toLowerCase() === s.stationName?.toLowerCase())),
        )
      : allShifts

    if (options?.companyId && companyShifts.length === 0 && stationIdSet.size > 0) {
      companyShifts = allShifts.filter(s => stationIdSet.has(s.stationId))
    }

    // Filter by Date Range and Station
    let inRangeShifts = companyShifts

    if (options?.stationId && options.stationId !== 'ALL') {
      inRangeShifts = inRangeShifts.filter(
        s => s.stationId === options.stationId || (s as any).stationCode === options.stationId,
      )
      targetStations = targetStations.filter(st => st.id === options.stationId || st.code === options.stationId)
    }

    if (options?.startDate && options?.endDate) {
      const startIso = options.startDate.includes('T') ? options.startDate : `${options.startDate}T00:00:00.000Z`
      const endIso = options.endDate.includes('T') ? options.endDate : `${options.endDate}T23:59:59.999Z`
      inRangeShifts = inRangeShifts.filter(s => {
        const d = s.closedAt || s.openedAt
        return d >= startIso && d <= endIso
      })
    } else if (options?.days != null) {
      const cutoffDate = new Date(Date.now() - options.days * 86_400_000).toISOString()
      inRangeShifts = inRangeShifts.filter(s => (s.closedAt || s.openedAt) >= cutoffDate)
    }

    const closed = inRangeShifts.filter(s => s.closedAt || s.status === 'APPROVED' || s.status === 'CLOSED')
    const closedToday = closed.filter(s => ((s.closedAt || s.openedAt) || '').slice(0, 10) === today)
    const litresToday = roundLitres(inRangeShifts.reduce((a, s) => a + (s.sales ? s.sales.reduce((x, y) => x + (y.litres || 0), 0) : 0), 0))
    // Money totals must keep their centimes. A bare Math.round here discarded
    // the .00 component, so the "Sales Today" shown to head office did not
    // reconcile with the sum of its own shifts.
    const salesToday = roundMoney(inRangeShifts.reduce((a, s) => a + (s.actualTotal || (s.sales ? s.sales.reduce((x, y) => x + (y.amount || (y.litres || 0) * (y.unitPrice || 0)), 0) : 0)), 0))
    const netVariance = roundMoney(closed.reduce((a, s) => a + (s.variance || 0), 0))

    const paymentTotals = {
      cash: roundMoney(inRangeShifts.reduce((a, s) => a + (s.payments?.CASH || 0), 0)),
      momo: roundMoney(inRangeShifts.reduce((a, s) => a + (s.payments?.MOMO || 0), 0)),
      credit: roundMoney(inRangeShifts.reduce((a, s) => a + (s.payments?.CREDIT || 0), 0)),
      voucher: roundMoney(inRangeShifts.reduce((a, s) => a + (s.payments?.VOUCHER || 0), 0)),
    }

    const pendingReview = closed.filter(s => s.status === 'CLOSED').length
    const approved = closed.filter(s => s.status === 'APPROVED').length
    const rejected = closed.filter(s => s.status === 'REJECTED').length

    // Cars served = total transactions across shifts
    const carsServedToday = await countTransactionsForShifts(inRangeShifts.filter(s => (s.openedAt || '').slice(0, 10) === today).map(s => s.id))
    const carsServedTotal = await countTransactionsForShifts(inRangeShifts.map(s => s.id))

    const pendingShiftSync = inRangeShifts.filter(s => s.syncStatus === 'PENDING').length

    // Replaces a "sync compliance" figure that could not report anything but 100.
    // The server holds the source of truth, so any shift present locally arrived
    // by a completed sync; a percentage derived from it was an assurance that
    // never failed. Station coverage can genuinely be under 100 when a branch is
    // inactive, which is the question a coverage card should be answering.
    //
    // The local station mirror only ever receives active branches (the station
    // endpoints filter active = 1 so closed branches stay out of station
    // pickers), so counting locally would return 100 no matter what. Prefer the
    // server's numbers and fall back to the local count only when offline.
    let activeStations = targetStations.filter(s => s.active !== false).length
    let stationCoveragePct = targetStations.length
      ? Math.round((activeStations / targetStations.length) * 1000) / 10
      : 100
    try {
      const { backendGetStationCoverage } = await import('../../services/backendApiService')
      const live = await backendGetStationCoverage(options?.companyId)
      if (live && live.totalStationCount > 0) {
        activeStations = live.activeStationCount
        stationCoveragePct = live.stationCoveragePct
      }
    } catch { /* offline */ }

    // 3. Compute Per-Station Rollup
    const stationRollups: StationRollup[] = targetStations.map(st => {
      const shifts = inRangeShifts.filter(s => s.stationId === st.id || s.stationName?.toLowerCase() === st.name.toLowerCase())
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
        litresToday: roundLitres(shifts.reduce((a, s) => a + (s.sales ? s.sales.reduce((x, y) => x + y.litres, 0) : 0), 0)),
        salesToday: roundMoney(shifts.reduce((a, s) => a + (s.actualTotal || (s.sales ? s.sales.reduce((x, y) => x + y.amount, 0) : 0)), 0)),
        carsServedToday: 0,
        carsServedTotal: 0,
        netVariance: roundMoney(siteClosed.reduce((a, s) => a + s.variance, 0)),
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
    const targetAttendants = (options?.stationId
      ? allAttendants.filter(a => a.stationId === options.stationId)
      : options?.companyId
      ? allAttendants.filter(
          a =>
            a.companyId === options.companyId ||
            a.companyShortCode === options.companyId ||
            (stationIdSet.size > 0 && stationIdSet.has(a.stationId)) ||
            (a.employeeCode && a.employeeCode.startsWith(options.companyId.replace('comp-', '').toUpperCase())),
        )
      : allAttendants
    ).filter(a => a.employeeCode !== 'SUPER-ADMIN' && a.employeeCode !== 'PETRO-MASTER')

    const attendantRollups: AttendantRollup[] = (await Promise.all(targetAttendants
      .map(async att => {
        const shifts = inRangeShifts.filter(s => s.attendantId === att.id || s.attendantName?.toLowerCase() === att.fullName?.toLowerCase())
        const closedShifts = shifts.filter(s => s.closedAt)
        const totalSales = roundMoney(shifts.reduce((a, s) => a + (s.actualTotal || (s.sales ? s.sales.reduce((x, y) => x + y.amount, 0) : 0)), 0))
        const totalLitres = roundLitres(shifts.reduce((a, s) => a + (s.sales ? s.sales.reduce((x, y) => x + y.litres, 0) : 0), 0))
        const totalVar = roundMoney(closedShifts.reduce((a, s) => a + s.variance, 0))

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
          avgShiftSales: closedShifts.length > 0 ? roundMoney(totalSales / closedShifts.length) : 0,
          active: att.active,
          approvalStatus: att.approvalStatus,
          cashTotal: roundMoney(closedShifts.reduce((a, s) => a + (s.payments?.CASH || 0), 0)),
          momoTotal: roundMoney(closedShifts.reduce((a, s) => a + (s.payments?.MOMO || 0), 0)),
          creditTotal: roundMoney(closedShifts.reduce((a, s) => a + (s.payments?.CREDIT || 0), 0)),
          voucherTotal: roundMoney(closedShifts.reduce((a, s) => a + (s.payments?.VOUCHER || 0), 0)),
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
      activeStationCount: activeStations,
      stationCoveragePct,
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