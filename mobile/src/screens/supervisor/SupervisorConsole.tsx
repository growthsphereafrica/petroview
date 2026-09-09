import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Modal } from 'react-native'
import {
  ClipboardCheck,
  DollarSign,
  Droplets,
  Layers,
  Users,
  CheckCircle2,
  History,
  LayoutDashboard,
  MapPin,
  QrCode,
  ShieldCheck,
  Building2,
  Plus,
  ArrowRight,
  TrendingUp,
  Fuel,
  RefreshCw,
} from 'lucide-react-native'
import { colors } from '../../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../../components/ui'
import { QrSyncSheet } from '../../components/QrSyncSheet'
import { TankReadingsSheet } from './TankReadingsSheet'
import { supervisorService } from '../../core/services/supervisorService'
import { rollupService, type HqSummary } from '../../core/services/rollupService'
import { cloudGetTankReadings, getCloudApiBase, getCloudToken } from '../../core/infra/cloudApi'
import type { Shift, Attendant, AuditEntry } from '../../core/domain/types'
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

export type SupervisorTab = 'dashboard' | 'shifts' | 'tanks' | 'attendants' | 'operations' | 'hq' | 'audit'

export const SupervisorConsole: React.FC<{ session: MobileSession; onSignOut: () => void }> = ({ session, onSignOut }) => {
  const [tab, setTab] = useState<SupervisorTab>('dashboard')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [attendants, setAttendants] = useState<Attendant[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [qrOpen, setQrOpen] = useState(false)
  const [tankSheetOpen, setTankSheetOpen] = useState(false)

  const isSuperAdmin =
    session.role === 'superadmin' ||
    session.employeeCode.toUpperCase() === 'SUPER-ADMIN' ||
    session.employeeCode.toUpperCase() === 'ADMIN'

  const isHQ =
    session.role === 'headoffice' ||
    session.employeeCode.toUpperCase().includes('HQ')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { listAttendants } = await import('../../core/infra/repositories')
      const [s, a] = await Promise.all([supervisorService.listShifts(), listAttendants()])
      setShifts(s)
      setAttendants(a)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refreshKey, refresh])

  const pendingReview = shifts.filter(s => s.status === 'CLOSED').length
  const openCount = shifts.filter(s => s.status === 'OPEN').length

  return (
    <View style={styles.safe}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isSuperAdmin ? (
              <ShieldCheck size={18} color={colors.rose} />
            ) : isHQ ? (
              <Building2 size={18} color={colors.flame} />
            ) : (
              <Users size={18} color={colors.emerald} />
            )}
            <Text style={styles.heading}>
              {isSuperAdmin ? 'Master Console' : isHQ ? 'HQ Enterprise' : 'Forecourt Console'}
            </Text>
          </View>
          <Text style={styles.sub}>{session.fullName} · {session.employeeCode}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => setQrOpen(true)} style={styles.iconTopBtn}>
            <QrCode size={16} color={colors.violet} />
          </Pressable>
          <Pressable onPress={onSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={styles.content}>
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
                onGoTanks={() => setTab('tanks')}
                onGoAttendants={() => setTab('attendants')}
                onGoOperations={() => setTab('operations')}
                onGoAudit={() => setTab('audit')}
                onGoHq={() => setTab('hq')}
                onOpenQr={() => setQrOpen(true)}
                onOpenTankSheet={() => setTankSheetOpen(true)}
                isSuperAdmin={isSuperAdmin}
                isHQ={isHQ}
              />
            )}
            {tab === 'shifts' && (
              <ShiftsTab shifts={shifts} session={session} onChanged={() => setRefreshKey(k => k + 1)} />
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
            {tab === 'operations' && (
              <OperationsTab session={session} />
            )}
            {tab === 'hq' && (
              <HqAndOmcTab session={session} isSuperAdmin={isSuperAdmin} isHQ={isHQ} />
            )}
            {tab === 'audit' && <AuditTab />}

            <Pressable onPress={() => setRefreshKey(k => k + 1)} style={styles.reloadBtn}>
              <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: '700' }}>↻ Refresh data</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {([
          ['dashboard', LayoutDashboard, 'Home'],
          ['shifts', ClipboardCheck, 'Shifts'],
          ['tanks', Droplets, 'Tanks'],
          ['attendants', Users, 'Staff'],
          ['operations', DollarSign, 'Finance'],
          ['hq', Layers, isSuperAdmin ? 'OMCs' : 'Network'],
          ['audit', History, 'Audit'],
        ] as const).map(([key, Icon, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tabItem, tab === key && styles.tabItemActive]}>
            <Icon size={16} color={tab === key ? colors.emerald : colors.textFaint} />
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
  onGoTanks: () => void
  onGoAttendants: () => void
  onGoOperations: () => void
  onGoAudit: () => void
  onGoHq: () => void
  onOpenQr: () => void
  onOpenTankSheet: () => void
  isSuperAdmin: boolean
  isHQ: boolean
}> = ({
  pendingReview,
  openCount,
  approved,
  rejected,
  shifts,
  onGoShifts,
  onGoTanks,
  onGoAttendants,
  onGoOperations,
  onGoAudit,
  onGoHq,
  onOpenQr,
  onOpenTankSheet,
  isSuperAdmin,
  isHQ,
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
        <Text style={styles.cardTitle}>Management Operations</Text>
        <QuickRow
          icon={<ClipboardCheck size={16} color={colors.emerald} />}
          title="Review Shifts"
          subtitle={`${pendingReview} awaiting decision`}
          onPress={onGoShifts}
        />
        <QuickRow
          icon={<Droplets size={16} color={colors.blue} />}
          title="Tank Inventory & Dips"
          subtitle="Record & monitor daily tank fuel levels"
          onPress={onGoTanks}
        />
        <QuickRow
          icon={<Users size={16} color={colors.amber} />}
          title="Manage Attendants"
          subtitle="PIN resets, registrations & assignments"
          onPress={onGoAttendants}
        />
        <QuickRow
          icon={<DollarSign size={16} color={colors.emerald} />}
          title="Expenses & Customer Credit"
          subtitle="Daily cash outflows & debtor management"
          onPress={onGoOperations}
        />
        {(isSuperAdmin || isHQ) && (
          <QuickRow
            icon={<Layers size={16} color={colors.flame} />}
            title={isSuperAdmin ? 'OMC Companies & Platform' : 'Network Stations Rollup'}
            subtitle={isSuperAdmin ? 'Create & manage downstream tenants' : 'Multi-station performance & pricing'}
            onPress={onGoHq}
          />
        )}
        <QuickRow
          icon={<History size={16} color={colors.textDim} />}
          title="Audit Trail"
          subtitle="Review operational logs & security events"
          onPress={onGoAudit}
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

const ShiftsTab: React.FC<{ shifts: Shift[]; session: MobileSession; onChanged: () => void }> = ({
  shifts,
  session,
  onChanged,
}) => {
  const [filter, setFilter] = useState<'ALL' | Shift['status']>('ALL')
  const [selected, setSelected] = useState<Shift | null>(null)
  const filtered = filter === 'ALL' ? shifts : shifts.filter(s => s.status === filter)

  return (
    <View>
      <Text style={styles.sectionTitle}>SHIFTS</Text>
      <View style={styles.chips}>
        {(['ALL', 'CLOSED', 'OPEN', 'APPROVED', 'REJECTED'] as const).map(f => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f && { color: '#04130d' }]}>
              {f === 'ALL' ? 'All' : f === 'CLOSED' ? 'Awaiting Review' : f === 'OPEN' ? 'Open' : f === 'APPROVED' ? 'Approved' : 'Rejected'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Card style={styles.listCard}>
        {filtered.length === 0 && <Text style={styles.empty}>No shifts in this view.</Text>}
        {filtered.map(s => (
          <Pressable key={s.id} onPress={() => setSelected(s)} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{s.number}</Text>
              <Text style={styles.rowSub}>{s.attendantName} · {s.pumpId.replace('pump-', 'Pump ')} · {s.stationName}</Text>
              <Text style={[styles.rowSub, { color: colors.emerald, fontWeight: '700' }]}>{formatGHS(s.actualTotal)}</Text>
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
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.modalTitle}>{shift.number}</Text>
            <Badge tone={toneFor(shift.status)}>{labelFor(shift.status)}</Badge>
          </View>
          <Text style={styles.modalSub}>{shift.attendantName} · {shift.stationName} · {shift.pumpId.replace('pump-', 'Pump ')}</Text>
          <View style={styles.statsGrid}>
            <Stat label="Sales Total" value={formatGHS(shift.salesTotal)} />
            <Stat label="Volume" value={`${formatLitres(shift.sales.reduce((a, s) => a + s.litres, 0))} L`} />
            <Stat label="Variance" value={formatGHS(shift.variance, { showSign: true })} tone={Math.abs(shift.variance) < 5 ? colors.emerald : colors.rose} />
            <Stat label="Opened" value={formatDateTime(shift.openedAt)} />
          </View>

          {shift.status === 'CLOSED' ? (
            <>
              <View style={styles.reviewActions}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Pressable
                    disabled={!!busy}
                    onPress={async () => {
                      setBusy('APPROVED')
                      await onReviewed('APPROVED')
                      setBusy(null)
                    }}
                    style={[styles.btnApprove, busy && { opacity: 0.5 }]}
                  >
                    <CheckCircle2 size={14} color="#052e16" />
                    <Text style={[styles.btnLabel, { color: '#052e16' }]}>{busy === 'APPROVED' ? 'Reviewing…' : 'Approve'}</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Pressable
                    disabled={!!busy}
                    onPress={async () => {
                      setBusy('REJECTED')
                      await onReviewed('REJECTED', 'Flagged by supervisor')
                      setBusy(null)
                    }}
                    style={[styles.btnReject, busy && { opacity: 0.5 }]}
                  >
                    <Text style={[styles.btnLabel, { color: '#fff' }]}>{busy === 'REJECTED' ? 'Reviewing…' : 'Reject'}</Text>
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={onClose} style={{ marginTop: 8, alignItems: 'center', padding: 8 }}>
                <Text style={{ color: colors.textFaint, fontSize: 12 }}>Close</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onClose} style={{ marginTop: 12, alignItems: 'center', padding: 8 }}>
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>Close</Text>
            </Pressable>
          )}

          {shift.reviewedBy && (
            <Text style={styles.reviewedNote}>Reviewed by {shift.reviewedBy} — {formatDateTime(shift.reviewedAt ?? '')}</Text>
          )}
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
        { employeeCode: newCode, fullName: newName, pin: newPin },
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
                  {a.employeeCode} · {a.pumpId ? a.pumpId.replace('pump-', 'Pump ') : 'Unassigned'}
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

// ---- Tab 5: Operations, Expenses & Debtors ----------------------------------

const OperationsTab: React.FC<{ session: MobileSession }> = ({ session }) => {
  const [expenseModal, setExpenseModal] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('Generator Fuel')
  const [expenseRecipient, setExpenseRecipient] = useState('')
  const [expenses, setExpenses] = useState<any[]>([
    { id: '1', category: 'Generator Fuel', amount: 350, recipient: 'Station Genset', time: '10:30 AM' },
    { id: '2', category: 'Station Supplies', amount: 80, recipient: 'Cleaning Supplies', time: '08:15 AM' },
  ])

  const addExpense = () => {
    if (!expenseAmount) return
    const newEx = {
      id: Date.now().toString(),
      category: expenseCategory,
      amount: Number(expenseAmount),
      recipient: expenseRecipient || 'Station Petty Cash',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setExpenses(prev => [newEx, ...prev])
    setExpenseAmount('')
    setExpenseRecipient('')
    setExpenseModal(false)
  }

  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0)

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>DAILY EXPENSES & OUTFLOWS</Text>
        <Pressable onPress={() => setExpenseModal(true)} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>+ Add Expense</Text>
        </Pressable>
      </View>

      <Card style={styles.kpi}>
        <DollarSign size={16} color={colors.amber} />
        <Text style={styles.kpiValue}>{formatGHS(totalExpenses)}</Text>
        <Text style={styles.kpiLabel}>Total Outflows Today</Text>
      </Card>

      <Card style={styles.listCard}>
        {expenses.map(e => (
          <View key={e.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{e.category}</Text>
              <Text style={styles.rowSub}>{e.recipient} · {e.time}</Text>
            </View>
            <Text style={[styles.rowTitle, { color: colors.rose }]}>-{formatGHS(e.amount)}</Text>
          </View>
        ))}
      </Card>

      {/* Credit Customers */}
      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>CREDIT CUSTOMERS & DEBTORS</Text>
      <Card style={styles.listCard}>
        {[
          { name: 'Metro Mass Transport', code: 'MMT-ACC', balance: 14500, limit: 30000 },
          { name: 'VIP Jeoun Transport', code: 'VIP-01', balance: 8200, limit: 20000 },
          { name: 'Ghana Police Service (Motor)', code: 'GPS-ACC', balance: 3400, limit: 10000 },
        ].map(c => (
          <View key={c.code} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{c.name}</Text>
              <Text style={styles.rowSub}>{c.code} · Limit: {formatGHS(c.limit)}</Text>
            </View>
            <Text style={[styles.rowTitle, { color: colors.amber }]}>{formatGHS(c.balance)}</Text>
          </View>
        ))}
      </Card>

      {/* Add Expense Modal */}
      <Modal visible={expenseModal} transparent animationType="slide" onRequestClose={() => setExpenseModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Record Expense</Text>
            <Text style={styles.modalSub}>Record cash paid out from forecourt</Text>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>CATEGORY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {['Generator Fuel', 'Station Supplies', 'Utilities', 'Maintenance', 'Cash Drop'].map(cat => (
                <Pressable
                  key={cat}
                  onPress={() => setExpenseCategory(cat)}
                  style={[styles.chip, expenseCategory === cat && styles.chipActive]}
                >
                  <Text style={[styles.chipText, expenseCategory === cat && { color: '#04130d' }]}>{cat}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>AMOUNT (GHS)</Text>
            <StyledTextInput
              value={expenseAmount}
              onChangeText={t => setExpenseAmount(t.replace(/[^0-9.]/g, ''))}
              placeholder="e.g. 150"
              keyboardType="number-pad"
            />

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>RECIPIENT / PURPOSE</Text>
            <StyledTextInput
              value={expenseRecipient}
              onChangeText={setExpenseRecipient}
              placeholder="e.g. Genset diesel refill"
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <PrimaryButton
                title="Save Expense"
                onPress={addExpense}
                disabled={!expenseAmount || Number(expenseAmount) <= 0}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Cancel"
                onPress={() => setExpenseModal(false)}
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

// ---- Tab 6: HQ & Super-Admin OMCs ------------------------------------------

interface PendingUser {
  id: string
  employeeCode: string
  fullName: string
  phone?: string
  stationId?: string
  companyId?: string
  role: 'attendant' | 'supervisor'
  createdAt: string
}

const HqAndOmcTab: React.FC<{ session: MobileSession; isSuperAdmin: boolean; isHQ: boolean }> = ({
  session,
  isSuperAdmin,
  isHQ,
}) => {
  const [data, setData] = useState<HqSummary | null>(null)
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [createOmcModal, setCreateOmcModal] = useState(false)
  const [pricingModal, setPricingModal] = useState(false)
  const [prices, setPrices] = useState({ PMS: '14.80', AGO: '15.20', DPK: '13.90', KERO: '13.50' })
  const [omcName, setOmcName] = useState('')
  const [omcCode, setOmcCode] = useState('')
  const [omcPin, setOmcPin] = useState('9999')
  const [creating, setCreating] = useState(false)

  const loadAll = useCallback(async () => {
    const summaryData = await rollupService.summary()
    setData(summaryData)

    // Load pending approvals from cloud if token is present
    const base = getCloudApiBase()
    const token = await getCloudToken()
    if (base && token) {
      try {
        const resp = await fetch(`${base}/api/auth/pending-approvals`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (resp.ok) {
          const json = (await resp.json()) as { supervisors?: PendingUser[]; attendants?: PendingUser[] }
          const combined: PendingUser[] = [
            ...(json.supervisors || []).map(s => ({ ...s, role: 'supervisor' as const })),
            ...(json.attendants || []).map(a => ({ ...a, role: 'attendant' as const })),
          ]
          setPendingUsers(combined)
        }
      } catch {
        // offline
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    void loadAll()
    return () => { active = false }
  }, [loadAll])

  const handleDecision = async (userId: string, verdict: 'APPROVED' | 'REJECTED') => {
    setApprovingId(userId)
    try {
      const base = getCloudApiBase()
      const token = await getCloudToken()
      if (base && token) {
        await fetch(`${base}/api/auth/approve/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ verdict }),
        })
      }
      setPendingUsers(prev => prev.filter(u => u.id !== userId))
    } finally {
      setApprovingId(null)
    }
  }

  const submitCreateOmc = async () => {
    if (!omcName || !omcCode) return
    setCreating(true)
    try {
      const base = getCloudApiBase()
      const token = await getCloudToken()
      if (base && token) {
        await fetch(`${base}/api/companies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: omcName, shortCode: omcCode, adminPin: omcPin }),
        })
      }
      setCreateOmcModal(false)
      setOmcName('')
      setOmcCode('')
      void loadAll()
    } finally {
      setCreating(false)
    }
  }

  if (!data) return <View style={styles.center}><ActivityIndicator color={colors.emerald} size="large" /></View>

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.sectionTitle}>{isSuperAdmin ? 'PLATFORM MASTER · OMCS' : 'HEAD OFFICE NETWORK'}</Text>
          <Text style={styles.sub}>
            {isSuperAdmin ? 'Manage All Downstream OMC Tenants' : 'Enterprise Station Rollup & Fleet Control'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={() => setPricingModal(true)} style={styles.miniBtn}>
            <Text style={styles.miniBtnText}>Fuel Prices</Text>
          </Pressable>
          {isSuperAdmin && (
            <Pressable onPress={() => setCreateOmcModal(true)} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>+ New OMC</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.kpiRow}>
        <Card style={styles.kpi}>
          <DollarSign size={16} color={colors.emerald} />
          <Text style={styles.kpiValue}>{formatGHS(data.salesToday, { noPrefix: true })}</Text>
          <Text style={styles.kpiLabel}>Network Revenue</Text>
        </Card>
        <Card style={styles.kpi}>
          <ClipboardCheck size={16} color={colors.amber} />
          <Text style={styles.kpiValue}>{data.pendingReview}</Text>
          <Text style={styles.kpiLabel}>Awaiting review</Text>
        </Card>
      </View>

      {/* Pending Staff Approvals Queue */}
      {pendingUsers.length > 0 && (
        <Card style={[styles.card, { borderColor: colors.amber }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.amber }]}>Pending Staff Approvals ({pendingUsers.length})</Text>
            <Badge tone="warning">Action Required</Badge>
          </View>
          <Text style={styles.sub}>New attendants & managers awaiting your head office authorization</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {pendingUsers.map(u => (
              <View key={u.id} style={[styles.row, { backgroundColor: colors.panel2, borderRadius: 10, padding: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{u.fullName}</Text>
                  <Text style={styles.rowSub}>{u.employeeCode} · {u.role === 'supervisor' ? 'Station Manager' : 'Attendant'}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    onPress={() => void handleDecision(u.id, 'APPROVED')}
                    disabled={approvingId === u.id}
                    style={[styles.miniBtn, { backgroundColor: colors.emerald }]}
                  >
                    <Text style={[styles.miniBtnText, { color: '#04130d' }]}>Approve</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleDecision(u.id, 'REJECTED')}
                    disabled={approvingId === u.id}
                    style={[styles.miniBtn, { backgroundColor: colors.panel }]}
                  >
                    <Text style={[styles.miniBtnText, { color: colors.rose }]}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Live Benchmark Fuel Prices Card */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Live Station Fuel Prices (GHS / L)</Text>
          <Pressable onPress={() => setPricingModal(true)} style={styles.miniBtn}>
            <Text style={styles.miniBtnText}>Update</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {[
            { code: 'PMS', label: 'Super', color: '#22c55e', val: prices.PMS },
            { code: 'AGO', label: 'Diesel', color: '#3b82f6', val: prices.AGO },
            { code: 'DPK', label: 'DPK', color: '#f97316', val: prices.DPK },
            { code: 'KERO', label: 'Kero', color: '#a855f7', val: prices.KERO },
          ].map(f => (
            <View key={f.code} style={{ flex: 1, backgroundColor: colors.panel2, padding: 8, borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ color: f.color, fontSize: 10, fontWeight: '900' }}>{f.code}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 2 }}>{f.val}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Text style={styles.sectionTitle}>STATIONS & BRANCHES</Text>
      <Card style={styles.listCard}>
        {data.stations.map(st => (
          <View key={st.stationId} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{st.name}</Text>
              <Text style={styles.rowSub}><MapPin size={10} color={colors.textFaint} /> {st.region}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.rowTitle}>{formatGHS(st.sales, { noPrefix: true })}</Text>
              <Text style={styles.rowSub}>{st.shiftCount} shifts · {formatLitres(st.litres)} L</Text>
            </View>
          </View>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>TOP DISPENSING ATTENDANTS</Text>
      <Card style={styles.listCard}>
        {data.attendants.slice(0, 5).map((a, i) => (
          <View key={a.employeeCode} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{i + 1}. {a.name}</Text>
              <Text style={styles.rowSub}>{a.employeeCode} · {a.stationName}</Text>
            </View>
            <Text style={styles.rowTitle}>{formatGHS(a.sales, { noPrefix: true })}</Text>
          </View>
        ))}
      </Card>

      {/* Fuel Pricing Modal */}
      <Modal visible={pricingModal} transparent animationType="slide" onRequestClose={() => setPricingModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Fuel Retail Prices</Text>
            <Text style={styles.modalSub}>Broadcast official prices across network station forecourts</Text>

            <View style={{ gap: 8, marginTop: 12 }}>
              <View>
                <Text style={styles.fieldLabel}>PMS / SUPER PETROL (GHS/L)</Text>
                <StyledTextInput value={prices.PMS} onChangeText={t => setPrices(p => ({ ...p, PMS: t }))} keyboardType="numeric" />
              </View>
              <View>
                <Text style={styles.fieldLabel}>AGO / DIESEL (GHS/L)</Text>
                <StyledTextInput value={prices.AGO} onChangeText={t => setPrices(p => ({ ...p, AGO: t }))} keyboardType="numeric" />
              </View>
              <View>
                <Text style={styles.fieldLabel}>DPK (GHS/L)</Text>
                <StyledTextInput value={prices.DPK} onChangeText={t => setPrices(p => ({ ...p, DPK: t }))} keyboardType="numeric" />
              </View>
              <View>
                <Text style={styles.fieldLabel}>KEROSENE (GHS/L)</Text>
                <StyledTextInput value={prices.KERO} onChangeText={t => setPrices(p => ({ ...p, KERO: t }))} keyboardType="numeric" />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <PrimaryButton title="Apply Prices" onPress={() => setPricingModal(false)} style={{ flex: 1 }} />
              <PrimaryButton title="Close" onPress={() => setPricingModal(false)} tone="rose" style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Create OMC Modal for Super Admin */}
      <Modal visible={createOmcModal} transparent animationType="slide" onRequestClose={() => setCreateOmcModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create OMC Company</Text>
            <Text style={styles.modalSub}>Add an Oil Marketing Company to PetroView</Text>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>COMPANY NAME</Text>
            <StyledTextInput value={omcName} onChangeText={setOmcName} placeholder="e.g. Star Oil Ghana" />

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>SHORT CODE (MAX 8 CHARS)</Text>
            <StyledTextInput value={omcCode} onChangeText={t => setOmcCode(t.toUpperCase())} placeholder="e.g. STAR" autoCapitalize="characters" />

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>HQ ADMIN PIN</Text>
            <StyledTextInput value={omcPin} onChangeText={setOmcPin} placeholder="9999" keyboardType="number-pad" />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <PrimaryButton title={creating ? 'Creating…' : 'Create OMC'} onPress={submitCreateOmc} disabled={creating || !omcName || !omcCode} style={{ flex: 1 }} />
              <PrimaryButton title="Cancel" onPress={() => setCreateOmcModal(false)} tone="rose" style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ---- Tab 7: Audit Log ------------------------------------------------------

const AuditTab: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  useEffect(() => {
    let active = true
    void supervisorService.auditLog().then(log => { if (active) setEntries(log) })
    return () => { active = false }
  }, [])

  return (
    <View>
      <Text style={styles.sectionTitle}>AUDIT TRAIL & LOGS</Text>
      <Card style={styles.listCard}>
        {entries.length === 0 && <Text style={styles.empty}>No audit events yet.</Text>}
        {entries.map(e => (
          <View key={e.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{e.action.replace(/_/g, ' ')}</Text>
              <Text style={styles.rowSub}>{e.notes ?? ''}</Text>
              <Text style={[styles.rowSub, { fontFamily: 'monospace', fontSize: 10 }]}>
                {e.actorRole} · {formatDateTime(e.timestamp)}
              </Text>
            </View>
          </View>
        ))}
      </Card>
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
    paddingVertical: 8,
    paddingBottom: 22,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabItemActive: {},
  tabLabel: { fontSize: 9, fontWeight: '800', marginTop: 1 },
  reloadBtn: { alignItems: 'center', padding: 14, marginTop: 4 },
})