import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native'
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
} from 'lucide-react-native'
import { colors } from '../../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../../components/ui'
import { QrSyncSheet } from '../../components/QrSyncSheet'
import { TankReadingsSheet } from './TankReadingsSheet'
import { supervisorService } from '../../core/services/supervisorService'
import { cloudGetTankReadings } from '../../core/infra/cloudApi'
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

export type SupervisorTab = 'dashboard' | 'shifts' | 'tanks' | 'attendants'

export const SupervisorConsole: React.FC<{ session: MobileSession; onSignOut: () => void }> = ({ session, onSignOut }) => {
  const [tab, setTab] = useState<SupervisorTab>('dashboard')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [attendants, setAttendants] = useState<Attendant[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [qrOpen, setQrOpen] = useState(false)
  const [tankSheetOpen, setTankSheetOpen] = useState(false)

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
            <Users size={18} color={colors.emerald} />
            <Text style={styles.heading}>Forecourt Supervisor Console</Text>
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
                onOpenQr={() => setQrOpen(true)}
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
        ] as const).map(([key, Icon, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tabItem, tab === key && styles.tabItemActive]}>
            <Icon size={18} color={tab === key ? colors.emerald : colors.textFaint} />
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
  onOpenQr: () => void
}> = ({
  pendingReview,
  openCount,
  approved,
  rejected,
  shifts,
  onGoShifts,
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
          icon={<Droplets size={16} color={colors.blue} />}
          title="Tank Inventory & Dips"
          subtitle="Record wet-stock levels & dip measurements"
          onPress={onGoTanks}
        />
        <QuickRow
          icon={<Users size={16} color={colors.amber} />}
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