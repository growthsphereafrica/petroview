import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ClipboardCheck,
  DollarSign,
  Droplets,
  Users,
  CheckCircle2,
  LayoutDashboard,
  MapPin,
  QrCode,
  ShieldCheck,
  Plus,
  ArrowRight,
  Fuel,
  RefreshCw,
  Receipt,
} from 'lucide-react-native'
import { colors } from '../../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../../components/ui'
import { QrSyncSheet } from '../../components/QrSyncSheet'
import { TankReadingsSheet } from './TankReadingsSheet'
import { FuelPricesTab } from './FuelPricesTab'
import { ExpensesSheet } from './ExpensesSheet'
import { supervisorService } from '../../core/services/supervisorService'
import { cloudGetTankReadings, cloudGetPumps, pumpNameFor } from '../../core/infra/cloudApi'
import { registerStationPumps, formatShiftNozzles, extractShiftNozzlesList } from '../../core/domain/config'
import type { Shift, Attendant } from '../../core/domain/types'
import { formatGHS, formatLitres, formatDateTime } from '../../shared/currencyFormatter'
import type { MobileSession } from '../LoginScreen'

function toneFor(status: Shift['status']): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'APPROVED': return 'success'
    case 'REJECTED': return 'danger'
    case 'CLOSED': return 'warning'
    default: return 'info'
  }
}

function labelFor(status: Shift['status']): string {
  switch (status) {
    case 'OPEN': return 'Open'
    case 'CLOSED': return 'Awaiting Review'
    case 'APPROVED': return 'Approved'
    case 'REJECTED': return 'Rejected'
    default: return status
  }
}

export type SupervisorTab = 'dashboard' | 'shifts' | 'prices' | 'tanks' | 'attendants'

export const SupervisorConsole: React.FC<{ session: MobileSession; onSignOut: () => void }> = ({ session, onSignOut }) => {
  const [tab, setTab] = useState<SupervisorTab>('dashboard')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [attendants, setAttendants] = useState<Attendant[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [qrOpen, setQrOpen] = useState(false)
  const [tankSheetOpen, setTankSheetOpen] = useState(false)
  const [expensesSheetOpen, setExpensesSheetOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [s, a, pumpsRes] = await Promise.all([
        supervisorService.listShifts(),
        supervisorService.listAttendants(session.stationId),
        cloudGetPumps(session.stationId, session.companyId).catch(() => null),
      ])
      setShifts(s)
      setAttendants(a)
      if (pumpsRes && pumpsRes.ok && pumpsRes.pumps.length > 0) {
        registerStationPumps(session.stationId, pumpsRes.pumps.map(p => ({
          id: p.id,
          name: p.name,
          fuels: p.fuels as any,
        })))
      }
    } finally {
      setLoading(false)
    }
  }, [session.stationId, session.companyId])

  useEffect(() => {
    void refresh()
  }, [refreshKey, refresh])

  const insets = useSafeAreaInsets()

  const pendingReview = shifts.filter(s => s.status === 'CLOSED').length
  const openCount = shifts.filter(s => s.status === 'OPEN').length

  return (
    <View style={styles.safe}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={styles.tenantTag}>
            <Text style={styles.tenantOmc} numberOfLines={1}>
              {session.companyName || session.companyShortCode || 'OMC'}
            </Text>
            <Text style={styles.tenantSep}>·</Text>
            <Text style={styles.tenantStation} numberOfLines={1}>
              {session.stationName || 'Forecourt Station'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Users size={16} color={colors.emerald} />
            <Text style={styles.heading} numberOfLines={1}>{session.fullName}</Text>
          </View>
          <Text style={styles.sub} numberOfLines={1}>Supervisor ({session.employeeCode})</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => setQrOpen(true)} style={styles.iconTopBtn} hitSlop={8}>
            <QrCode size={16} color={colors.violet} />
          </Pressable>
          <Pressable onPress={onSignOut} style={styles.signOutBtn} hitSlop={8}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 84, 110) }]}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.emerald} size="large" /></View>
        ) : (
          <>
            {tab === 'dashboard' && (
              <Dashboard
                pendingReview={pendingReview}
                openCount={openCount}
                approved={shifts.filter(s => s.status === 'APPROVED').length}
                rejected={shifts.filter(s => s.status === 'REJECTED').length}
                shifts={shifts}
                onGoShifts={() => setTab('shifts')}
                onGoPrices={() => setTab('prices')}
                onOpenExpenses={() => setExpensesSheetOpen(true)}
                onGoTanks={() => setTab('tanks')}
                onGoAttendants={() => setTab('attendants')}
                onOpenQr={() => setQrOpen(true)}
              />
            )}
            {tab === 'shifts' && (
              <ShiftsTab shifts={shifts} session={session} onChanged={() => setRefreshKey(k => k + 1)} />
            )}
            {tab === 'prices' && (
              <FuelPricesTab session={session} onChanged={() => setRefreshKey(k => k + 1)} />
            )}
            {tab === 'tanks' && (
              <TanksTab
                stationId={session.stationId ?? null}
                stationName={session.stationName}
                onOpenRecordSheet={() => setTankSheetOpen(true)}
              />
            )}
            {tab === 'attendants' && (
              <AttendantsTab attendants={attendants} session={session} onChanged={() => setRefreshKey(k => k + 1)} />
            )}

            <Pressable onPress={() => setRefreshKey(k => k + 1)} style={styles.reloadBtn}>
              <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: '700' }}>↻ Refresh data</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom + 6, 20) }]}>
        {([
          ['dashboard', LayoutDashboard, 'Home'],
          ['shifts', ClipboardCheck, 'Shifts'],
          ['prices', DollarSign, 'Prices'],
          ['tanks', Droplets, 'Tanks'],
          ['attendants', Users, 'Staff'],
        ] as const).map(([key, Icon, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tabItem, tab === key && styles.tabItemActive]}
            hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
          >
            <Icon size={19} color={tab === key ? colors.emerald : colors.textFaint} />
            <Text style={[styles.tabLabel, { color: tab === key ? colors.emerald : colors.textFaint }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <QrSyncSheet visible={qrOpen} onClose={() => setQrOpen(false)} onSynced={refresh} />
      <TankReadingsSheet
        visible={tankSheetOpen}
        onClose={() => setTankSheetOpen(false)}
        stationId={session.stationId ?? null}
        stationName={session.stationName}
      />
      <ExpensesSheet
        visible={expensesSheetOpen}
        onClose={() => setExpensesSheetOpen(false)}
        session={session}
      />
    </View>
  )
}

// ---- Tab 1: Dashboard ------------------------------------------------------

const Dashboard: React.FC<{
  pendingReview: number
  openCount: number
  approved: number
  rejected: number
  shifts: Shift[]
  onGoShifts: () => void
  onGoPrices: () => void
  onOpenExpenses: () => void
  onGoTanks: () => void
  onGoAttendants: () => void
  onOpenQr: () => void
}> = ({
  pendingReview,
  openCount,
  approved,
  rejected,
  shifts,
  onGoShifts,
  onGoPrices,
  onOpenExpenses,
  onGoTanks,
  onGoAttendants,
  onOpenQr,
}) => {
  const today = new Date().toISOString().slice(0, 10)
  const closedToday = shifts.filter(s => (s.closedAt ?? '').slice(0, 10) === today)
  const salesToday = closedToday.reduce((a, s) => a + s.actualTotal, 0)
  const litresToday = closedToday.reduce((a, s) => a + s.sales.reduce((x, y) => x + y.litres, 0), 0)

  return (
    <View style={{ gap: 12 }}>
      {/* Revenue & Shift KPIs */}
      <View style={styles.kpiRow}>
        <Card style={styles.kpi}>
          <DollarSign size={16} color={colors.emerald} />
          <Text style={styles.kpiValue}>{formatGHS(salesToday, { noPrefix: true })}</Text>
          <Text style={styles.kpiLabel}>Revenue today</Text>
          <Text style={styles.kpiSub}>{formatLitres(litresToday)} Litres</Text>
        </Card>
        <Card style={styles.kpi}>
          <ClipboardCheck size={16} color={colors.amber} />
          <Text style={styles.kpiValue}>{pendingReview}</Text>
          <Text style={styles.kpiLabel}>Awaiting review</Text>
          <Text style={styles.kpiSub}>{openCount} shifts open</Text>
        </Card>
      </View>

      {/* Review Health */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Shift Reconciliation Health</Text>
          <Badge tone={pendingReview ? 'warning' : 'success'}>
            {pendingReview ? `${pendingReview} pending` : 'All caught up'}
          </Badge>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barSeg, { backgroundColor: colors.emerald, flex: Math.max(approved, 1) }]} />
          <View style={[styles.barSeg, { backgroundColor: colors.rose, flex: Math.max(rejected, 1) }]} />
        </View>
        <View style={styles.barLegend}>
          <View style={styles.legendItem}>
            <CheckCircle2 size={12} color={colors.emerald} />
            <Text style={styles.legendText}>{approved} approved</Text>
          </View>
          <View style={styles.legendItem}>
            <CheckCircle2 size={12} color={colors.rose} />
            <Text style={styles.legendText}>{rejected} rejected</Text>
          </View>
        </View>
      </Card>

      {/* Quick Navigation Rows */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Station Operations</Text>
        <QuickRow
          icon={<ClipboardCheck size={16} color={colors.emerald} />}
          title="Review Shifts"
          subtitle={`${pendingReview} shifts awaiting supervisor decision`}
          onPress={onGoShifts}
        />
        <QuickRow
          icon={<DollarSign size={16} color={colors.amber} />}
          title="Station Fuel Prices"
          subtitle="Configure unit price per litre (PMS, AGO, DPK)"
          onPress={onGoPrices}
        />
        <QuickRow
          icon={<Receipt size={16} color={colors.rose} />}
          title="Station Operating Expenses"
          subtitle="Log generator fuel, utility & forecourt outflows"
          onPress={onOpenExpenses}
        />
        <QuickRow
          icon={<Droplets size={16} color={colors.blue} />}
          title="Tank Inventory & Dips"
          subtitle="Record wet-stock levels & dip measurements"
          onPress={onGoTanks}
        />
        <QuickRow
          icon={<Users size={16} color={colors.emerald} />}
          title="Forecourt Attendants"
          subtitle="PIN resets & attendant approvals"
          onPress={onGoAttendants}
        />
        <QuickRow
          icon={<QrCode size={16} color={colors.violet} />}
          title="Offline QR Sync"
          subtitle="Transfer shifts offline between devices"
          onPress={onOpenQr}
        />
      </Card>

      {/* Recent Activity */}
      <Text style={styles.sectionTitle}>LATEST SHIFTS</Text>
      <Card style={styles.listCard}>
        {shifts.length === 0 ? (
          <Text style={styles.empty}>No shifts recorded yet.</Text>
        ) : (
          shifts.slice(0, 5).map(s => (
            <View key={s.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{s.number} · {s.attendantName}</Text>
                <Text style={styles.rowSub}>{s.stationName} · {formatDateTime(s.closedAt ?? s.openedAt)}</Text>
              </View>
              <Badge tone={toneFor(s.status)}>{labelFor(s.status)}</Badge>
            </View>
          ))
        )}
      </Card>
    </View>
  )
}

const QuickRow: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; onPress: () => void }> = ({
  icon,
  title,
  subtitle,
  onPress,
}) => (
  <Pressable onPress={onPress} style={styles.quickRow}>
    {icon}
    <View style={{ flex: 1, marginLeft: 10 }}>
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickSub}>{subtitle}</Text>
    </View>
    <Text style={{ color: colors.textFaint }}>›</Text>
  </Pressable>
)

// ---- Tab 2: Shifts ---------------------------------------------------------

type DateFilter = 'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH'

const DATE_CHIPS: { key: DateFilter; label: string }[] = [
  { key: 'ALL', label: 'All Time' },
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'WEEK', label: '7 Days' },
  { key: 'MONTH', label: 'Month' },
]

function isShiftToday(iso: string): boolean {
  const d = new Date(iso)
  const today = new Date()
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

function isShiftYesterday(iso: string): boolean {
  const d = new Date(iso)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
}

function isShiftWithinDays(iso: string, days: number): boolean {
  const d = new Date(iso).getTime()
  const now = Date.now()
  return now - d <= days * 24 * 60 * 60 * 1000
}

function isShiftSameMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

const ShiftsTab: React.FC<{ shifts: Shift[]; session: MobileSession; onChanged: () => void }> = ({
  shifts,
  session,
  onChanged,
}) => {
  const [filter, setFilter] = useState<'ALL' | Shift['status']>('ALL')
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL')
  const [selected, setSelected] = useState<Shift | null>(null)

  const filtered = useMemo(() => {
    return shifts.filter(s => {
      const matchStatus = filter === 'ALL' || s.status === filter
      const date = s.closedAt || s.openedAt
      let matchDate = true
      if (dateFilter === 'TODAY') matchDate = isShiftToday(date)
      else if (dateFilter === 'YESTERDAY') matchDate = isShiftYesterday(date)
      else if (dateFilter === 'WEEK') matchDate = isShiftWithinDays(date, 7)
      else if (dateFilter === 'MONTH') matchDate = isShiftSameMonth(date)
      return matchStatus && matchDate
    })
  }, [shifts, filter, dateFilter])

  // Station Daily Reconciliation Aggregates
  const reconciliation = useMemo(() => {
    let expectedTotal = 0
    let actualTotal = 0
    let cashTotal = 0
    let momoTotal = 0
    let totalLitres = 0

    for (const s of filtered) {
      expectedTotal += s.salesTotal || 0
      actualTotal += s.actualTotal || 0
      cashTotal += s.payments?.CASH || 0
      momoTotal += (s.payments?.MOMO || 0) + (s.payments?.VOUCHER || 0)
      if (Array.isArray(s.sales)) {
        for (const sale of s.sales) {
          totalLitres += Number(sale.litres || 0)
        }
      }
    }

    const netVariance = actualTotal - expectedTotal
    return { count: filtered.length, expectedTotal, actualTotal, cashTotal, momoTotal, totalLitres, netVariance }
  }, [filtered])

  return (
    <View>
      <Text style={styles.sectionTitle}>SHIFT & RECONCILIATION REGISTER</Text>

      {/* Date Filter Chips */}
      <View style={[styles.chips, { marginBottom: 6 }]}>
        {DATE_CHIPS.map(f => (
          <Pressable
            key={f.key}
            onPress={() => setDateFilter(f.key)}
            style={[
              styles.chip,
              dateFilter === f.key && { backgroundColor: colors.amber, borderColor: colors.amber },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                dateFilter === f.key && { color: '#04130d', fontWeight: '900' },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Status Filter Chips */}
      <View style={styles.chips}>
        {(['ALL', 'CLOSED', 'OPEN', 'APPROVED', 'REJECTED'] as const).map(f => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f && { color: '#04130d' }]}>
              {f === 'ALL' ? 'All' : f === 'CLOSED' ? 'Awaiting Review' : f === 'OPEN' ? 'Open' : f === 'APPROVED' ? 'Approved' : 'Rejected'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Station Daily Reconciliation Summary Card */}
      <Card style={[styles.listCard, { padding: 14, marginBottom: 12, backgroundColor: '#0e172a' }]}>
        <Text style={{ color: colors.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }}>
          STATION FORECOURT RECONCILIATION ({DATE_CHIPS.find(d => d.key === dateFilter)?.label})
        </Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2, marginBottom: 8 }}>
          {formatGHS(reconciliation.actualTotal)}
          <Text style={{ fontSize: 11, color: colors.textDim, fontWeight: '600' }}> remitted ({reconciliation.count} shifts)</Text>
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
          <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(0,0,0,0.3)', padding: 7, borderRadius: 8 }}>
            <Text style={{ color: colors.textDim, fontSize: 10 }}>💵 Total Cash</Text>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 1 }}>{formatGHS(reconciliation.cashTotal)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(0,0,0,0.3)', padding: 7, borderRadius: 8 }}>
            <Text style={{ color: colors.blue, fontSize: 10 }}>📱 MoMo / POS</Text>
            <Text style={{ color: colors.blue, fontSize: 11, fontWeight: '800', marginTop: 1 }}>{formatGHS(reconciliation.momoTotal)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(0,0,0,0.3)', padding: 7, borderRadius: 8 }}>
            <Text style={{ color: colors.textDim, fontSize: 10 }}>⛽ Expected (Meters)</Text>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 1 }}>{formatGHS(reconciliation.expectedTotal)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: '45%', backgroundColor: 'rgba(0,0,0,0.3)', padding: 7, borderRadius: 8 }}>
            <Text style={{ color: colors.textDim, fontSize: 10 }}>⚖️ Station Variance</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                marginTop: 1,
                color:
                  reconciliation.netVariance === 0
                    ? colors.emerald
                    : reconciliation.netVariance > 0
                    ? colors.blue
                    : colors.rose,
              }}
            >
              {reconciliation.netVariance === 0 ? 'Balanced' : formatGHS(reconciliation.netVariance, { showSign: true })}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
          <Text style={{ color: colors.textDim, fontSize: 10 }}>Volume Sold:</Text>
          <Text style={{ color: colors.amber, fontWeight: '800', fontSize: 10 }}>{formatLitres(reconciliation.totalLitres)} Litres</Text>
        </View>
      </Card>

      <Card style={styles.listCard}>
        {filtered.length === 0 && <Text style={styles.empty}>No shifts in this view.</Text>}
        {filtered.map((s: Shift) => (
          <Pressable key={s.id} onPress={() => setSelected(s)} style={styles.row}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.rowTitle}>{s.number}</Text>
                {s.reviewNotes && s.reviewNotes.includes('Resubmitted') && (
                  <View style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: colors.amber, fontSize: 9, fontWeight: '800' }}>🔄 RESUBMITTED</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.rowSub, { color: colors.text, fontWeight: '700' }]}>Attendant: {s.attendantName}</Text>
              <Text style={[styles.rowSub, { color: colors.emerald, fontWeight: '600', marginTop: 1 }]}>
                {s.pumpName || pumpNameFor(s.pumpId)} · Nozzles: {formatShiftNozzles(s as any)}
              </Text>
              <Text style={[styles.rowSub, { fontSize: 10, color: colors.textDim }]}>{s.stationName}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, alignItems: 'center' }}>
                <Text style={[styles.rowSub, { color: colors.emerald, fontWeight: '800' }]}>{formatGHS(s.actualTotal)}</Text>
                <Text style={[styles.rowSub, { fontSize: 10, color: s.variance === 0 ? colors.emerald : s.variance > 0 ? colors.blue : colors.rose }]}>
                  Var: {formatGHS(s.variance, { showSign: true })}
                </Text>
              </View>
            </View>
            <Badge tone={toneFor(s.status)}>{labelFor(s.status)}</Badge>
          </Pressable>
        ))}
      </Card>

      {selected && (
        <ShiftDetailModal
          shift={selected}
          session={session}
          onClose={() => setSelected(null)}
          onReviewed={async (decision, notes) => {
            await supervisorService.reviewShift(
              selected.id,
              decision,
              { id: selected.id, name: session.fullName, code: session.employeeCode },
              notes,
            )
            setSelected(null)
            onChanged()
          }}
        />
      )}
    </View>
  )
}

const ShiftDetailModal: React.FC<{
  shift: Shift
  session: MobileSession
  onClose: () => void
  onReviewed: (decision: 'APPROVED' | 'REJECTED', notes?: string) => Promise<void>
}> = ({ shift, session, onClose, onReviewed }) => {
  const [busy, setBusy] = useState<string | null>(null)
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle')
  const [rejectNote, setRejectNote] = useState('')

  // Compute Nozzle Breakdown using robust extractShiftNozzlesList
  const nozzleAudit = extractShiftNozzlesList(shift).map(n => {
    const saleMatch = shift.sales.find(s => s.fuelCode === n.fuelCode)
    const unitPrice = saleMatch?.unitPrice ?? (n.fuelCode === 'AGO' ? 15.20 : 14.80)
    const amount = saleMatch?.amount ?? Math.round(n.litres * unitPrice * 100) / 100
    return {
      fuel: n.fuelCode,
      label: n.nozzleLabel,
      opening: n.openingValue,
      closing: n.closingValue,
      litres: n.litres,
      unitPrice,
      amount,
    }
  })

  const totalVol = shift.sales.length > 0
    ? shift.sales.reduce((a, s) => a + s.litres, 0)
    : nozzleAudit.reduce((a, n) => a + n.litres, 0)

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={[styles.modalCard, { maxHeight: '90%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>{shift.number}</Text>
                <Text style={[styles.modalSub, { color: colors.text, fontWeight: '800', marginTop: 2 }]}>
                  Attendant: {shift.attendantName}
                </Text>
                <Text style={[styles.modalSub, { color: colors.emerald, fontWeight: '600', marginTop: 1 }]}>
                  Dispenser: {shift.pumpName || pumpNameFor(shift.pumpId)} · Nozzles: {formatShiftNozzles(shift as any)}
                </Text>
                <Text style={[styles.modalSub, { fontSize: 10, color: colors.textDim }]}>
                  {shift.stationName}
                </Text>
              </View>
              <Badge tone={toneFor(shift.status)}>{labelFor(shift.status)}</Badge>
            </View>

            {/* Timing */}
            <View style={styles.auditRow}>
              <Text style={styles.auditLabel}>Opened: {formatDateTime(shift.openedAt)}</Text>
              <Text style={styles.auditLabel}>Closed: {formatDateTime(shift.closedAt ?? shift.updatedAt)}</Text>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <Stat label="Sales Total" value={formatGHS(shift.salesTotal)} />
              <Stat label="Volume Sold" value={`${formatLitres(totalVol)} L`} />
              <Stat
                label="Variance"
                value={formatGHS(shift.variance, { showSign: true })}
                tone={shift.variance === 0 ? colors.emerald : Math.abs(shift.variance) < 5 ? colors.amber : colors.rose}
              />
              <Stat label="Total Remitted" value={formatGHS(shift.actualTotal)} />
            </View>

            {/* Forecourt Meter Audit */}
            <Text style={styles.subSectionTitle}>FORECOURT DISPENSER & NOZZLE AUDIT ({shift.pumpName || pumpNameFor(shift.pumpId)})</Text>
            <View style={{ gap: 8, marginBottom: 12 }}>
              {nozzleAudit.map(n => (
                <View key={`${n.fuel}-${n.label}`} style={styles.nozzleBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: colors.emerald, fontWeight: '900', fontSize: 13 }}>{n.label}</Text>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                      {formatGHS(n.amount)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.textDim, fontSize: 10 }}>
                      Open: <Text style={{ color: colors.text }}>{n.opening.toFixed(2)}</Text> → Close: <Text style={{ color: colors.text }}>{n.closing > 0 ? n.closing.toFixed(2) : '—'}</Text>
                    </Text>
                    <Text style={{ color: colors.textDim, fontSize: 10 }}>
                      Sold: <Text style={{ color: colors.emerald, fontWeight: '800' }}>{n.litres.toFixed(2)} L</Text> @ GHS {n.unitPrice.toFixed(2)}/L
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Remittance Breakdown */}
            <Text style={styles.subSectionTitle}>PAYMENT REMITTANCE</Text>
            <View style={styles.paymentsBox}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Cash at Hand</Text>
                <Text style={styles.paymentValue}>{formatGHS(shift.payments?.CASH ?? 0)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Mobile Money (MoMo)</Text>
                <Text style={styles.paymentValue}>{formatGHS(shift.payments?.MOMO ?? 0)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>POS / Cards / Vouchers</Text>
                <Text style={styles.paymentValue}>{formatGHS(shift.payments?.VOUCHER ?? 0)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Credit / Invoices</Text>
                <Text style={styles.paymentValue}>{formatGHS(shift.payments?.CREDIT ?? 0)}</Text>
              </View>
              <View style={[styles.paymentRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }]}>
                <Text style={[styles.paymentLabel, { fontWeight: '900', color: colors.text }]}>Total Handed Over</Text>
                <Text style={[styles.paymentValue, { color: colors.emerald, fontSize: 13 }]}>{formatGHS(shift.actualTotal)}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { fontWeight: '900', color: colors.text }]}>Variance Status</Text>
                <Text style={[styles.paymentValue, { color: shift.variance === 0 ? colors.emerald : shift.variance > 0 ? colors.blue : colors.rose, fontWeight: '900' }]}>
                  {shift.variance === 0 ? 'Balanced' : shift.variance > 0 ? `+${formatGHS(shift.variance)} Overage` : `${formatGHS(shift.variance)} Shortage`}
                </Text>
              </View>
            </View>

            {/* Attendant Notes */}
            {shift.reviewNotes ? (
              <View style={[styles.noteBox, shift.reviewNotes.includes('Resubmitted') && { borderColor: colors.amber, borderWidth: 1, backgroundColor: 'rgba(234, 179, 8, 0.08)' }]}>
                <Text style={[styles.noteTitle, shift.reviewNotes.includes('Resubmitted') && { color: colors.amber }]}>
                  {shift.reviewNotes.includes('Resubmitted') ? 'ATTENDANT CORRECTION & RESUBMISSION NOTE' : 'ATTENDANT HANDOVER NOTE'}
                </Text>
                <Text style={styles.noteBody}>{shift.reviewNotes}</Text>
              </View>
            ) : null}

            {/* Review Decision Actions */}
            {shift.status === 'CLOSED' ? (
              <View style={{ marginTop: 14 }}>
                {mode === 'idle' && (
                  <View style={styles.reviewActions}>
                    <View style={{ flex: 1, marginRight: 6 }}>
                      <Pressable
                        onPress={() => setMode('approve')}
                        style={styles.btnApprove}
                      >
                        <CheckCircle2 size={14} color="#052e16" />
                        <Text style={[styles.btnLabel, { color: '#052e16' }]}>Approve Shift</Text>
                      </Pressable>
                    </View>
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Pressable
                        onPress={() => setMode('reject')}
                        style={styles.btnReject}
                      >
                        <Text style={[styles.btnLabel, { color: '#fff' }]}>Reject Shift</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {mode === 'approve' && (
                  <View style={styles.decisionBox}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
                      Confirm approval of {shift.number} for {formatGHS(shift.actualTotal)} collected?
                    </Text>
                    <PrimaryButton
                      title={busy === 'APPROVED' ? 'Approving…' : 'Confirm & Approve'}
                      onPress={async () => {
                        setBusy('APPROVED')
                        await onReviewed('APPROVED')
                        setBusy(null)
                      }}
                      tone="emerald"
                      disabled={!!busy}
                    />
                    <Pressable onPress={() => setMode('idle')} style={{ marginTop: 8, alignItems: 'center' }}>
                      <Text style={{ color: colors.textDim, fontSize: 11 }}>Cancel</Text>
                    </Pressable>
                  </View>
                )}

                {mode === 'reject' && (
                  <View style={styles.decisionBox}>
                    <Text style={{ color: colors.rose, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                      Enter reason for rejecting {shift.number}:
                    </Text>
                    <StyledTextInput
                      value={rejectNote}
                      onChangeText={setRejectNote}
                      placeholder="e.g. Cash shortage of GHS 50 without receipt"
                    />
                    <PrimaryButton
                      title={busy === 'REJECTED' ? 'Rejecting…' : 'Confirm Rejection'}
                      onPress={async () => {
                        setBusy('REJECTED')
                        await onReviewed('REJECTED', rejectNote)
                        setBusy(null)
                      }}
                      tone="rose"
                      disabled={!!busy || rejectNote.trim().length < 4}
                      style={{ marginTop: 8 }}
                    />
                    <Pressable onPress={() => { setMode('idle'); setRejectNote('') }} style={{ marginTop: 8, alignItems: 'center' }}>
                      <Text style={{ color: colors.textDim, fontSize: 11 }}>Cancel</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            {shift.reviewedBy && (
              <Text style={styles.reviewedNote}>
                Reviewed by {shift.reviewedBy} — {formatDateTime(shift.reviewedAt ?? '')}
              </Text>
            )}

            <Pressable onPress={onClose} style={{ marginTop: 14, alignItems: 'center', padding: 8 }}>
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <View style={styles.statBox}>
    <Text style={[styles.statValue, { color: tone ?? colors.text }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
)

// ---- Tab 3: Tanks & Fuel Inventory -----------------------------------------

const TanksTab: React.FC<{
  stationId: string | null
  stationName?: string
  onOpenRecordSheet: () => void
}> = ({ stationId, stationName, onOpenRecordSheet }) => {
  const [readings, setReadings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadTanks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await cloudGetTankReadings(stationId, 30)
      setReadings(res.readings ?? [])
    } catch {
      // Fallback
    } finally {
      setLoading(false)
    }
  }, [stationId])

  useEffect(() => {
    void loadTanks()
  }, [loadTanks])

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.sectionTitle}>TANKS & FUEL INVENTORY</Text>
          <Text style={styles.sub}>{stationName || 'Forecourt Underground Tanks'}</Text>
        </View>
        <Pressable onPress={onOpenRecordSheet} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>+ Record Dip</Text>
        </Pressable>
      </View>

      {/* Tank Cards */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[
          { code: 'PMS', name: 'Super Petrol', color: '#22c55e', capacity: 45000, current: 32400 },
          { code: 'AGO', name: 'Diesel', color: '#3b82f6', capacity: 45000, current: 28900 },
          { code: 'DPK', name: 'Kerosene / DPK', color: '#f97316', capacity: 20000, current: 14200 },
        ].map(t => {
          const pct = Math.round((t.current / t.capacity) * 100)
          return (
            <Card key={t.code} style={{ flex: 1, minWidth: '46%', padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: t.color, fontWeight: '900', fontSize: 16 }}>{t.code}</Text>
                <Badge tone={pct > 25 ? 'success' : 'danger'}>{pct}%</Badge>
              </View>
              <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 2 }}>{t.name}</Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 8 }}>
                {formatLitres(t.current)} L
              </Text>
              <Text style={{ color: colors.textDim, fontSize: 10 }}>Capacity: {formatLitres(t.capacity)} L</Text>
            </Card>
          )
        })}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>DIP READING HISTORY</Text>
      <Card style={styles.listCard}>
        {loading ? (
          <ActivityIndicator color={colors.emerald} style={{ padding: 20 }} />
        ) : readings.length === 0 ? (
          <Text style={styles.empty}>No dip readings on file. Tap '+ Record Dip' to submit daily levels.</Text>
        ) : (
          readings.slice(0, 8).map(r => (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {r.readings?.map((x: any) => `${x.fuelCode || x.tankId}: ${x.dipStock || x.closingLevel}L`).join(' · ')}
                </Text>
                <Text style={styles.rowSub}>By {r.recordedByName || r.recordedBy} · {formatDateTime(r.recordedAt || r.createdAt)}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </View>
  )
}

// ---- Tab 4: Attendants & Staff ---------------------------------------------

const AttendantsTab: React.FC<{ attendants: Attendant[]; session: MobileSession; onChanged: () => void }> = ({
  attendants,
  session,
  onChanged,
}) => {
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')

  const doReset = async (code: string) => {
    setError(null)
    try {
      await supervisorService.resetAttendantPin(code, pin, {
        id: session.employeeCode,
        name: session.fullName,
        code: session.employeeCode,
      })
      setResetFor(null)
      setPin('')
      onChanged()
    } catch (e) {
      const { describeError } = await import('../../core/domain/errors')
      setError(describeError(e))
    }
  }

  const doRegister = async () => {
    setError(null)
    try {
      await supervisorService.registerAttendant(
        { employeeCode: newCode, fullName: newName, pin: newPin, stationId: session.stationId },
        { id: session.employeeCode, name: session.fullName, code: session.employeeCode },
      )
      setRegisterOpen(false)
      setNewCode(''); setNewName(''); setNewPin('')
      onChanged()
    } catch (e) {
      const { describeError } = await import('../../core/domain/errors')
      setError(describeError(e))
    }
  }

  return (
    <View>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>ATTENDANTS & STAFF</Text>
        <Pressable onPress={() => setRegisterOpen(true)} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>+ Register Staff</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Card style={styles.listCard}>
        {attendants.length === 0 ? (
          <Text style={styles.empty}>No staff registered.</Text>
        ) : (
          attendants.map(a => (
            <View key={a.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.rowTitle}>{a.fullName}</Text>
                  {!a.active && <Badge tone="danger">Inactive</Badge>}
                </View>
                <Text style={styles.rowSub}>
                  {a.employeeCode} · {a.pumpId ? pumpNameFor(a.pumpId) : 'Unassigned'}
                </Text>
              </View>
              {a.active && (
                <Pressable onPress={() => { setResetFor(a.employeeCode); setPin(''); setError(null) }} style={styles.miniBtn}>
                  <Text style={styles.miniBtnText}>Reset PIN</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </Card>

      {/* Reset PIN Modal */}
      <Modal visible={!!resetFor} transparent animationType="slide" onRequestClose={() => setResetFor(null)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset PIN</Text>
            <Text style={styles.modalSub}>Set new 4-digit PIN for {resetFor}</Text>
            <StyledTextInput
              value={pin}
              onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              secureTextEntry
              keyboardType="number-pad"
              style={{ marginTop: 12 }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <PrimaryButton
                title="Save PIN"
                onPress={() => void doReset(resetFor ?? '')}
                disabled={pin.length !== 4}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Cancel"
                onPress={() => setResetFor(null)}
                tone="rose"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Register Staff Modal */}
      <Modal visible={registerOpen} transparent animationType="slide" onRequestClose={() => setRegisterOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Register Staff</Text>
            <Text style={styles.modalSub}>Create a new station attendant</Text>
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>EMPLOYEE CODE</Text>
            <StyledTextInput
              value={newCode}
              onChangeText={t => setNewCode(t.toUpperCase())}
              placeholder="e.g. PV003A"
              autoCapitalize="characters"
            />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>FULL NAME</Text>
            <StyledTextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Full official name"
            />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>PIN (4 DIGITS)</Text>
            <StyledTextInput
              value={newPin}
              onChangeText={t => setNewPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              secureTextEntry
              keyboardType="number-pad"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <PrimaryButton
                title="Register"
                onPress={() => void doRegister()}
                disabled={!newCode || !newName || newPin.length !== 4}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Cancel"
                onPress={() => setRegisterOpen(false)}
                tone="rose"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { paddingVertical: 60, alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.panel,
  },
  heading: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sub: { color: colors.textFaint, fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
  iconTopBtn: {
    backgroundColor: colors.panel2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  signOutBtn: {
    backgroundColor: colors.panel2,
    borderColor: colors.rose,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutText: { color: colors.rose, fontSize: 11, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 14 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, padding: 14, gap: 6 },
  kpiValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  kpiLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiSub: { color: colors.textDim, fontSize: 11 },
  card: { padding: 14, marginBottom: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  bar: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.panel2 },
  barSeg: { height: 8 },
  barLegend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { color: colors.textDim, fontSize: 11 },
  quickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  quickTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  quickSub: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  sectionTitle: { color: colors.textFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  listCard: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  rowSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  empty: { color: colors.textFaint, fontSize: 12, padding: 20, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  chipActive: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  chipText: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  modal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.85)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18 },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  modalSub: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  statBox: { backgroundColor: colors.panel2, borderRadius: 10, padding: 10, minWidth: '46%', flexGrow: 1 },
  statValue: { color: colors.text, fontSize: 13, fontWeight: '900' },
  statLabel: { color: colors.textFaint, fontSize: 9, textTransform: 'uppercase', marginTop: 2 },
  reviewActions: { flexDirection: 'row', marginTop: 16 },
  btnApprove: { backgroundColor: colors.emerald, borderRadius: 12, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  btnReject: { backgroundColor: colors.rose, borderRadius: 12, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  btnLabel: { fontSize: 13, fontWeight: '800' },
  reviewedNote: { color: colors.textFaint, fontSize: 11, marginTop: 12, fontStyle: 'italic' },
  linkBtn: { backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  linkBtnText: { color: colors.emerald, fontSize: 11, fontWeight: '800' },
  errorText: { color: colors.rose, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  miniBtn: { backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  miniBtnText: { color: colors.emerald, fontSize: 11, fontWeight: '700' },
  fieldLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 22,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingVertical: 4, gap: 3 },
  tabItemActive: {},
  tabLabel: { fontSize: 10, fontWeight: '800', marginTop: 1 },
  reloadBtn: { alignItems: 'center', padding: 14, marginTop: 4 },
  subSectionTitle: { color: colors.textFaint, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  nozzleBox: { backgroundColor: colors.panel2, borderRadius: 10, padding: 10 },
  paymentsBox: { backgroundColor: colors.panel2, borderRadius: 10, padding: 10, gap: 6 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentLabel: { color: colors.textDim, fontSize: 11 },
  paymentValue: { color: colors.text, fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  noteBox: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 10, padding: 10, marginTop: 10 },
  noteTitle: { color: colors.textFaint, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  noteBody: { color: colors.text, fontSize: 11, marginTop: 4 },
  decisionBox: { backgroundColor: colors.panel2, borderRadius: 12, padding: 12, marginTop: 8 },
  auditRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  auditLabel: { color: colors.textDim, fontSize: 10 },
  tenantTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tenantOmc: { color: colors.emerald, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  tenantSep: { color: colors.textDim, fontSize: 11 },
  tenantStation: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
})