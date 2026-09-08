import { Router } from 'express'
import { db, deserializeShift, type ShiftRow } from '../db'
import { authenticate, requireRole } from '../middleware'
import { STATIONS } from '../config'

export const headOfficeRouter = Router()

const startOfTodayIso = (): string => new Date().toISOString().slice(0, 10)

interface StationRow {
  id: string
  employeeCode?: string
  fullName?: string
  stationId?: string
}

const allShifts = (): ShiftRow[] => db.prepare('SELECT * FROM shifts ORDER BY openedAt DESC').all() as ShiftRow[]

const litresOf = (row: ShiftRow): number =>
  (JSON.parse(row.sales) as Array<{ litres: number }>).reduce((x, y) => x + y.litres, 0)

headOfficeRouter.get('/summary', authenticate, requireRole('supervisor'), (req, res) => {
  const days = req.query.days ? parseInt(String(req.query.days), 10) : null
  const today = startOfTodayIso()
  const cutoff = days != null ? new Date(Date.now() - days * 86_400_000).toISOString() : null

  const all = allShifts()
  const inRange = cutoff ? all.filter(r => r.openedAt >= cutoff) : all
  const closed = inRange.filter(r => r.closedAt)
  const closedToday = closed.filter(r => (r.closedAt || '').slice(0, 10) === today)

  const litresToday = closedToday.reduce((a, r) => a + litresOf(r), 0)
  const salesToday = Math.round(closedToday.reduce((a, r) => a + r.actualTotal, 0))
  const netVariance = Math.round(closed.reduce((a, r) => a + r.variance, 0) * 100) / 100
  const pendingReview = closed.filter(r => r.status === 'CLOSED').length
  const approved = closed.filter(r => r.status === 'APPROVED').length
  const rejected = closed.filter(r => r.status === 'REJECTED').length
  const pendingSync = inRange.filter(r => r.syncStatus === 'PENDING').length
  const syncCompliancePct = Math.round(((inRange.length - pendingSync) / (inRange.length || 1)) * 1000) / 10

  const stations = STATIONS.map(st => {
    const shifts = inRange.filter(r => r.stationId === st.id)
    const siteClosed = shifts.filter(r => r.closedAt)
    const siteClosedToday = siteClosed.filter(r => (r.closedAt || '').slice(0, 10) === today)
    const times = shifts.map(r => r.updatedAt).filter(Boolean).sort()
    return {
      stationId: st.id,
      name: st.name,
      code: st.code,
      region: st.region,
      location: st.location,
      shiftCount: shifts.length,
      litresToday: siteClosedToday.reduce((a, r) => a + litresOf(r), 0),
      salesToday: Math.round(siteClosedToday.reduce((a, r) => a + r.actualTotal, 0)),
      netVariance: Math.round(siteClosed.reduce((a, r) => a + r.variance, 0) * 100) / 100,
      pendingReview: siteClosed.filter(r => r.status === 'CLOSED').length,
      pendingSync: shifts.filter(r => r.syncStatus === 'PENDING').length,
      lastSync: times.length ? times[times.length - 1] : null,
    }
  })

  res.json({
    generatedAt: new Date().toISOString(),
    currency: 'GHS',
    rangeDays: days,
    stationCount: STATIONS.length,
    totalShifts: inRange.length,
    shiftsToday: inRange.filter(r => (r.openedAt || '').slice(0, 10) === today).length,
    litresToday,
    salesToday,
    netVariance,
    approved,
    rejected,
    pendingReview,
    pendingSync,
    syncCompliancePct,
    stations,
    attendants: buildAttendantRollups(inRange),
    recentShifts: inRange.slice(0, 6).map(deserializeShift),
  })
})

function buildAttendantRollups(inRange: ShiftRow[]): Array<Record<string, unknown>> {
  const attendants = db.prepare('SELECT * FROM attendants WHERE active = 1').all() as StationRow[]
  return attendants
    .map(att => {
      const shifts = inRange.filter(s => s.attendantId === att.id)
      const closed = shifts.filter(s => s.closedAt)
      return {
        employeeCode: att.employeeCode ?? att.id,
        name: att.fullName ?? att.id,
        stationName: STATIONS.find(st => st.id === att.stationId)?.name ?? att.stationId ?? '',
        shiftsClosed: closed.length,
        litres: closed.reduce((a, s) => a + litresOf(s), 0),
        sales: Math.round(closed.reduce((a, s) => a + s.actualTotal, 0)),
        variance: Math.round(closed.reduce((a, s) => a + s.variance, 0) * 100) / 100,
        approved: closed.filter(s => s.status === 'APPROVED').length,
      }
    })
    .sort((a, b) => Number(b.sales) - Number(a.sales))
}