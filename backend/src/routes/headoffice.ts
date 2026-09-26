import { Router } from 'express'
import { db, deserializeShift, type ShiftRow } from '../db'
import { authenticate, requireRole, type AuthRequest, type SessionClaims } from '../middleware'

export const headOfficeRouter = Router()

interface ScopedShift extends ShiftRow {
  companyId?: string | null
  companyShortCode?: string | null
}

interface StationSummaryRow {
  id: string
  name: string
  code: string
  region: string
  location: string
  companyId: string
}

interface AttendantRow {
  id: string
  employeeCode: string
  fullName: string
  companyId: string | null
  stationId: string | null
}

const startOfTodayIso = (): string => new Date().toISOString().slice(0, 10)
const MAX_SHIFTS = 10_000
const MAX_TRANSACTION_IDS = 2_000

function sessionOf(req: AuthRequest): SessionClaims {
  return req.session!
}

function requestedDays(value: unknown): number | null {
  if (value === undefined || value === '') return null
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('days must be an integer between 1 and 365.')
  return days
}

function scopeCompany(session: SessionClaims, requested: unknown): string | null {
  if (session.role === 'superadmin') {
    const companyId = typeof requested === 'string' ? requested.trim() : ''
    return companyId && companyId !== 'ALL' ? companyId : null
  }
  if (session.role === 'headoffice') return session.companyId
  return null
}

function allShifts(session: SessionClaims, requestedCompany: unknown, stationId: string | null): ScopedShift[] {
  const companyId = scopeCompany(session, requestedCompany)
  const conditions = ['1=1']
  const params: unknown[] = []
  if (companyId) {
    conditions.push('(companyId = ? OR stationId IN (SELECT id FROM companyStations WHERE companyId = ?))')
    params.push(companyId, companyId)
  }
  if (session.role === 'supervisor') {
    if (!stationId) return []
    conditions.push('stationId = ?')
    params.push(stationId)
  } else if (stationId) {
    conditions.push('stationId = ?')
    params.push(stationId)
  }
  if (session.role !== 'superadmin' && !companyId && session.role !== 'supervisor') {
    conditions.push('1 = 0')
  }
  return db.prepare(`SELECT * FROM shifts WHERE ${conditions.join(' AND ')} ORDER BY openedAt DESC LIMIT ${MAX_SHIFTS}`).all(...params) as ScopedShift[]
}

function litresOf(row: ShiftRow): number {
  try {
    const sales = JSON.parse(row.sales) as Array<{ litres?: number }>
    return sales.reduce((sum, item) => sum + (Number(item.litres) || 0), 0)
  } catch {
    return 0
  }
}

function salesOf(row: ShiftRow): number {
  if (Number.isFinite(row.actualTotal) && row.actualTotal > 0) return row.actualTotal
  if (Number.isFinite(row.expectedTotal) && row.expectedTotal > 0) return row.expectedTotal
  try {
    const sales = JSON.parse(row.sales) as Array<{ amount?: number; litres?: number; unitPrice?: number }>
    return sales.reduce((sum, item) => sum + (Number(item.amount) || (Number(item.litres) || 0) * (Number(item.unitPrice) || 0)), 0)
  } catch {
    return 0
  }
}

function countTransactions(shiftIds: string[]): number {
  if (shiftIds.length === 0) return 0
  const ids = shiftIds.slice(0, MAX_TRANSACTION_IDS)
  const placeholders = ids.map(() => '?').join(',')
  const row = db.prepare(`SELECT COUNT(*) AS c FROM transactions WHERE shiftId IN (${placeholders})`).get(...ids) as { c: number }
  return row.c
}

function scopedStations(session: SessionClaims, requestedCompany: unknown, stationId: string | null): StationSummaryRow[] {
  const companyId = scopeCompany(session, requestedCompany)
  const conditions = ['cs.active = 1', 'c.active = 1']
  const params: unknown[] = []
  if (companyId) {
    conditions.push('cs.companyId = ?')
    params.push(companyId)
  }
  if (session.role === 'supervisor') {
    if (!stationId) return []
    conditions.push('cs.id = ?')
    params.push(stationId)
  } else if (stationId) {
    conditions.push('cs.id = ?')
    params.push(stationId)
  }
  if (session.role !== 'superadmin' && !companyId && session.role !== 'supervisor') return []
  return db.prepare(`SELECT cs.id, cs.name, cs.code, cs.region, cs.location, cs.companyId FROM companyStations cs JOIN companies c ON c.id = cs.companyId WHERE ${conditions.join(' AND ')} ORDER BY cs.name`).all(...params) as StationSummaryRow[]
}

function attendantRows(session: SessionClaims, companyId: string | null, stationId: string | null): AttendantRow[] {
  const conditions = ['a.active = 1']
  const params: unknown[] = []
  if (session.role === 'supervisor') {
    if (!stationId) return []
    conditions.push('a.stationId = ?')
    params.push(stationId)
  } else if (companyId) {
    conditions.push('a.companyId = ?')
    params.push(companyId)
  } else if (session.role !== 'superadmin') {
    return []
  }
  return db.prepare(`SELECT a.id, a.employeeCode, a.fullName, a.companyId, a.stationId FROM attendants a WHERE ${conditions.join(' AND ')} ORDER BY a.employeeCode`).all(...params) as AttendantRow[]
}

headOfficeRouter.get('/summary', authenticate, requireRole('supervisor', 'headoffice', 'superadmin'), (req: AuthRequest, res) => {
  const session = sessionOf(req)
  let days: number | null
  try {
    days = requestedDays(req.query.days)
  } catch (error) {
    res.status(400).json({ error: 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Invalid days.' })
    return
  }
  const stationId = session.role === 'supervisor' ? session.stationId : typeof req.query.station === 'string' ? req.query.station : null
  if (session.role === 'supervisor' && !stationId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Supervisor account has no assigned station.' })
    return
  }
  const queryCompany = req.query.companyId
  const companyId = scopeCompany(session, queryCompany)
  const all = allShifts(session, queryCompany, stationId)
  const cutoff = days === null ? null : new Date(Date.now() - days * 86_400_000).toISOString()
  const inRange = cutoff ? all.filter(row => row.openedAt >= cutoff) : all
  const today = startOfTodayIso()
  const closed = inRange.filter(row => row.closedAt || row.status === 'APPROVED' || row.status === 'CLOSED')
  const inRangeToday = inRange.filter(row => ((row.closedAt || row.openedAt) || '').slice(0, 10) === today)
  const stationRows = scopedStations(session, queryCompany, stationId)
  const stations = stationRows.map(station => {
    const shifts = inRange.filter(row => row.stationId === station.id)
    const siteClosed = shifts.filter(row => row.closedAt || row.status === 'APPROVED' || row.status === 'CLOSED')
    const siteToday = shifts.filter(row => ((row.closedAt || row.openedAt) || '').slice(0, 10) === today)
    const times = shifts.map(row => row.updatedAt).filter(Boolean).sort()
    return {
      stationId: station.id,
      name: station.name,
      code: station.code,
      region: station.region,
      location: station.location,
      shiftCount: shifts.length,
      litresToday: siteToday.reduce((sum, row) => sum + litresOf(row), 0),
      salesToday: Math.round(siteToday.reduce((sum, row) => sum + salesOf(row), 0)),
      carsServedToday: countTransactions(siteToday.map(row => row.id)),
      carsServedTotal: countTransactions(siteClosed.map(row => row.id)),
      netVariance: Math.round(siteClosed.reduce((sum, row) => sum + (row.variance || 0), 0) * 100) / 100,
      pendingReview: siteClosed.filter(row => row.status === 'CLOSED').length,
      pendingSync: shifts.filter(row => row.syncStatus === 'PENDING').length,
      lastSync: times.length ? times[times.length - 1] : null,
    }
  })
  const attendants = attendantRows(session, companyId, stationId).map(attendant => {
    const shifts = inRange.filter(shift => shift.attendantId === attendant.id)
    const closedShifts = shifts.filter(shift => shift.closedAt)
    return {
      employeeCode: attendant.employeeCode,
      name: attendant.fullName,
      shiftsClosed: closedShifts.length,
      litres: closedShifts.reduce((sum, shift) => sum + litresOf(shift), 0),
      sales: Math.round(closedShifts.reduce((sum, shift) => sum + salesOf(shift), 0)),
      carsServed: countTransactions(closedShifts.map(shift => shift.id)),
      variance: Math.round(closedShifts.reduce((sum, shift) => sum + (shift.variance || 0), 0) * 100) / 100,
      approved: closedShifts.filter(shift => shift.status === 'APPROVED').length,
    }
  }).sort((a, b) => b.sales - a.sales)

  const pendingSync = inRange.filter(row => row.syncStatus === 'PENDING').length
  res.json({
    generatedAt: new Date().toISOString(),
    currency: 'GHS',
    rangeDays: days,
    stationCount: stationRows.length,
    totalShifts: inRange.length,
    shiftsToday: inRange.filter(row => (row.openedAt || '').slice(0, 10) === today).length,
    litresToday: inRangeToday.reduce((sum, row) => sum + litresOf(row), 0),
    salesToday: Math.round(inRangeToday.reduce((sum, row) => sum + salesOf(row), 0)),
    carsServedToday: countTransactions(inRangeToday.map(row => row.id)),
    carsServedTotal: countTransactions(closed.map(row => row.id)),
    netVariance: Math.round(closed.reduce((sum, row) => sum + (row.variance || 0), 0) * 100) / 100,
    approved: closed.filter(row => row.status === 'APPROVED').length,
    rejected: closed.filter(row => row.status === 'REJECTED').length,
    pendingReview: closed.filter(row => row.status === 'CLOSED').length,
    pendingSync,
    syncCompliancePct: Math.round(((inRange.length - pendingSync) / (inRange.length || 1)) * 1000) / 10,
    stations,
    attendants,
    recentShifts: inRange.slice(0, 6).map(row => deserializeShift(row as ShiftRow)),
  })
})
