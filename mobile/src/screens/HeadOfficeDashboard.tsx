import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  SafeAreaView,
} from 'react-native'
import {
  Building2,
  DollarSign,
  Droplets,
  Layers,
  Users,
  CheckCircle2,
  History,
  LayoutDashboard,
  MapPin,
  RefreshCw,
  Fuel,
  ShieldCheck,
  LogOut,
  ChevronRight,
  TrendingUp,
  Tag,
  ClipboardCheck,
  User,
  Gauge,
  Eye,
  X,
} from 'lucide-react-native'
import { colors } from '../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../components/ui'
import { rollupService, type HqSummary } from '../core/services/rollupService'
import { getCloudApiBase, getCloudToken, pumpNameFor } from '../core/infra/cloudApi'
import { formatShiftNozzles, extractShiftNozzlesList } from '../core/domain/config'
import type { Shift } from '../core/domain/types'
import { formatGHS, formatLitres, formatDateTime } from '../shared/currencyFormatter'
import type { MobileSession } from './LoginScreen'

type HQTab = 'overview' | 'stations' | 'approvals' | 'pricing' | 'audit'

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

export const HeadOfficeDashboard: React.FC<{
  session: MobileSession
  onSignOut: () => void
}> = ({ session, onSignOut }) => {
  const [tab, setTab] = useState<HQTab>('overview')
  const [data, setData] = useState<HqSummary | null>(null)
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedAuditShift, setSelectedAuditShift] = useState<Shift | null>(null)

  // Pricing State
  const [pricingModal, setPricingModal] = useState(false)
  const [prices, setPrices] = useState({ PMS: '14.80', AGO: '15.20', DPK: '13.90', KERO: '13.50' })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const summaryData = await rollupService.summary()
      setData(summaryData)

      // Fetch live pending staff registrations from cloud
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
              ...(json.supervisors || []).filter(s => s.employeeCode !== 'SUPER-ADMIN' && s.employeeCode !== 'PETRO-MASTER').map(s => ({ ...s, role: 'supervisor' as const })),
              ...(json.attendants || []).filter(a => a.employeeCode !== 'SUPER-ADMIN' && a.employeeCode !== 'PETRO-MASTER').map(a => ({ ...a, role: 'attendant' as const })),
            ]
            setPendingUsers(combined)
          }
        } catch {
          // offline
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [refreshKey, loadData])

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

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Building2 size={18} color={colors.flame} />
            <Text style={styles.heading}>Head Office Portal</Text>
            <Badge tone="warning">{session.companyShortCode || 'OMC HQ'}</Badge>
          </View>
          <Text style={styles.sub}>{session.fullName} · {session.employeeCode}</Text>
        </View>
        <Pressable onPress={onSignOut} style={styles.signOutBtn}>
          <LogOut size={13} color={colors.rose} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.emerald} size="large" />
            <Text style={styles.loadText}>Loading enterprise fleet rollup…</Text>
          </View>
        ) : (
          <>
            {/* Top KPI Summary Banner */}
            <View style={styles.kpiRow}>
              <Card style={styles.kpi}>
                <DollarSign size={16} color={colors.emerald} />
                <Text style={styles.kpiValue}>{formatGHS(data?.salesToday ?? 0, { noPrefix: true })}</Text>
                <Text style={styles.kpiLabel}>Fleet Revenue</Text>
                <Text style={styles.kpiSub}>{formatLitres(data?.litresToday ?? 0)} Litres</Text>
              </Card>
              <Card style={styles.kpi}>
                <Building2 size={16} color={colors.blue} />
                <Text style={styles.kpiValue}>{data?.stations?.length ?? 0}</Text>
                <Text style={styles.kpiLabel}>Active Stations</Text>
                <Text style={styles.kpiSub}>{data?.openShifts ?? 0} active shifts</Text>
              </Card>
            </View>

            {/* Pending Approvals Quick Alert if any */}
            {pendingUsers.length > 0 && tab !== 'approvals' && (
              <Pressable onPress={() => setTab('approvals')}>
                <Card style={[styles.card, { borderColor: colors.amber, backgroundColor: '#1c1304' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Users size={16} color={colors.amber} />
                      <Text style={{ color: colors.amber, fontSize: 13, fontWeight: '800' }}>
                        {pendingUsers.length} Staff Awaiting Approval
                      </Text>
                    </View>
                    <Badge tone="warning">Review</Badge>
                  </View>
                </Card>
              </Pressable>
            )}

            {/* Tab 1: Overview */}
            {tab === 'overview' && (
              <View style={{ gap: 12 }}>
                {/* Station Performance List */}
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>STATION FLEET BREAKDOWN</Text>
                  <Pressable onPress={() => setTab('stations')}>
                    <Text style={styles.linkText}>View all ›</Text>
                  </Pressable>
                </View>

                <Card style={styles.listCard}>
                  {(data?.stations ?? []).map(st => (
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

                {/* Top Dispensing Attendants Leaderboard */}
                <Text style={styles.sectionTitle}>TOP DISPENSING ATTENDANTS</Text>
                <Card style={styles.listCard}>
                  {(data?.attendants ?? []).slice(0, 5).map((a, i) => (
                    <View key={a.employeeCode} style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{i + 1}. {a.name}</Text>
                        <Text style={styles.rowSub}>{a.employeeCode} · {a.stationName}</Text>
                      </View>
                      <Text style={styles.rowTitle}>{formatGHS(a.sales, { noPrefix: true })}</Text>
                    </View>
                  ))}
                </Card>

                {/* Forecourt Shift Submissions & Dispenser/Nozzle Audit */}
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>FORECOURT SHIFT SUBMISSIONS & NOZZLE AUDIT</Text>
                  <Pressable onPress={() => setTab('audit')}>
                    <Text style={styles.linkText}>View all ›</Text>
                  </Pressable>
                </View>

                <Card style={styles.listCard}>
                  {(data?.recentShifts ?? []).slice(0, 6).map(s => (
                    <Pressable key={s.id} onPress={() => setSelectedAuditShift(s)} style={styles.row}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.rowTitle}>{s.number}</Text>
                          <Badge tone={s.status === 'APPROVED' ? 'success' : s.status === 'CLOSED' ? 'warning' : 'default'}>
                            {s.status}
                          </Badge>
                          <Text style={{ fontSize: 10, color: colors.textDim }}>{s.stationName}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.panel2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                            <User size={10} color={colors.flame} />
                            <Text style={{ fontSize: 10, color: colors.text, fontWeight: '700' }}>{s.attendantName}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.panel2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                            <Fuel size={10} color={colors.emerald} />
                            <Text style={{ fontSize: 10, color: colors.emerald, fontWeight: '700' }}>{s.pumpName || pumpNameFor(s.pumpId)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.panel2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                            <Gauge size={10} color={colors.blue} />
                            <Text style={{ fontSize: 10, color: colors.blue, fontWeight: '700' }}>Nozzles: {formatShiftNozzles(s)}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={[styles.rowTitle, { color: colors.emerald }]}>{formatGHS(s.actualTotal)}</Text>
                        <View style={[styles.miniBtn, { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3 }]}>
                          <Eye size={11} color={colors.emerald} />
                          <Text style={{ fontSize: 10, color: colors.emerald, fontWeight: '800' }}>Audit</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </Card>
              </View>
            )}

            {/* Tab 2: Stations Fleet */}
            {tab === 'stations' && (
              <View style={{ gap: 12 }}>
                <Text style={styles.sectionTitle}>ALL STATIONS & FORECOURTS</Text>
                <Card style={styles.listCard}>
                  {(data?.stations ?? []).map(st => (
                    <View key={st.stationId} style={[styles.row, { paddingVertical: 14 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{st.name}</Text>
                        <Text style={styles.rowSub}>ID: {st.stationId} · Region: {st.region}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          <Badge tone="success">{st.shiftCount} Shifts</Badge>
                          <Badge tone={st.pendingReview > 0 ? 'warning' : 'default'}>
                            {st.pendingReview} Awaiting Review
                          </Badge>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.rowTitle, { color: colors.emerald }]}>{formatGHS(st.sales)}</Text>
                        <Text style={styles.rowSub}>{formatLitres(st.litres)} L dispensed</Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* Tab 3: Staff Approvals */}
            {tab === 'approvals' && (
              <View style={{ gap: 12 }}>
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>STAFF ONBOARDING QUEUE</Text>
                  <Badge tone={pendingUsers.length > 0 ? 'warning' : 'success'}>
                    {pendingUsers.length} Pending
                  </Badge>
                </View>

                {pendingUsers.length === 0 ? (
                  <Card style={styles.card}>
                    <Text style={styles.empty}>All staff requests have been reviewed. No pending approvals.</Text>
                  </Card>
                ) : (
                  <View style={{ gap: 8 }}>
                    {pendingUsers.map(u => (
                      <Card key={u.id} style={styles.card}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>{u.fullName}</Text>
                            <Text style={styles.rowSub}>Code: {u.employeeCode} · Role: {u.role === 'supervisor' ? 'Station Manager' : 'Attendant'}</Text>
                            {!!u.phone && <Text style={styles.rowSub}>Phone: {u.phone}</Text>}
                            <Text style={[styles.rowSub, { fontSize: 10, marginTop: 4 }]}>Applied: {formatDateTime(u.createdAt)}</Text>
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
                              style={[styles.miniBtn, { backgroundColor: colors.panel2 }]}
                            >
                              <Text style={[styles.miniBtnText, { color: colors.rose }]}>Reject</Text>
                            </Pressable>
                          </View>
                        </View>
                      </Card>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Tab 4: Pricing */}
            {tab === 'pricing' && (
              <View style={{ gap: 12 }}>
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>NETWORK BENCHMARK FUEL PRICES</Text>
                  <Pressable onPress={() => setPricingModal(true)} style={styles.miniBtn}>
                    <Text style={styles.miniBtnText}>+ Change Prices</Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {[
                    { code: 'PMS', label: 'Super Petrol', color: '#22c55e', val: prices.PMS },
                    { code: 'AGO', label: 'Diesel', color: '#3b82f6', val: prices.AGO },
                    { code: 'DPK', label: 'DPK', color: '#f97316', val: prices.DPK },
                    { code: 'KERO', label: 'Kerosene', color: '#a855f7', val: prices.KERO },
                  ].map(f => (
                    <Card key={f.code} style={{ flex: 1, minWidth: '46%', padding: 14 }}>
                      <Text style={{ color: f.color, fontWeight: '900', fontSize: 16 }}>{f.code}</Text>
                      <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 2 }}>{f.label}</Text>
                      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 8 }}>
                        GHS {f.val}
                      </Text>
                      <Text style={{ color: colors.textDim, fontSize: 10, marginTop: 2 }}>Per Litre (Official)</Text>
                    </Card>
                  ))}
                </View>
              </View>
            )}

            {/* Tab 5: Audit */}
            {tab === 'audit' && (
              <View style={{ gap: 12 }}>
                <Text style={styles.sectionTitle}>HEAD OFFICE AUDIT TRAIL</Text>
                <Card style={styles.listCard}>
                  {(data?.recentShifts ?? []).map(s => (
                    <Pressable key={s.id} onPress={() => setSelectedAuditShift(s)} style={styles.row}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.rowTitle}>{s.number}</Text>
                          <Badge tone={s.status === 'APPROVED' ? 'success' : s.status === 'CLOSED' ? 'warning' : 'default'}>
                            {s.status}
                          </Badge>
                        </View>
                        <Text style={[styles.rowSub, { fontWeight: '700', color: colors.text }]}>
                          Attendant: {s.attendantName} · {s.stationName}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.blue, fontSize: 10 }]}>
                          {s.pumpName || pumpNameFor(s.pumpId)} · Nozzles: {formatShiftNozzles(s)}
                        </Text>
                        <Text style={[styles.rowSub, { fontSize: 10 }]}>{formatDateTime(s.closedAt ?? s.openedAt)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={[styles.rowTitle, { color: colors.emerald }]}>{formatGHS(s.actualTotal)}</Text>
                        <View style={[styles.miniBtn, { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3 }]}>
                          <Eye size={11} color={colors.emerald} />
                          <Text style={{ fontSize: 10, color: colors.emerald, fontWeight: '800' }}>Audit</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </Card>
              </View>
            )}

            <Pressable onPress={() => setRefreshKey(k => k + 1)} style={styles.reloadBtn}>
              <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: '700' }}>↻ Refresh Enterprise Data</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        {([
          ['overview', LayoutDashboard, 'Overview'],
          ['stations', Building2, 'Stations'],
          ['approvals', Users, `Approvals${pendingUsers.length ? ` (${pendingUsers.length})` : ''}`],
          ['pricing', Tag, 'Pricing'],
          ['audit', History, 'Audit'],
        ] as const).map(([key, Icon, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tabItem, tab === key && styles.tabItemActive]}>
            <Icon size={16} color={tab === key ? colors.emerald : colors.textFaint} />
            <Text style={[styles.tabLabel, { color: tab === key ? colors.emerald : colors.textFaint }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Pricing Modal */}
      <Modal visible={pricingModal} transparent animationType="slide" onRequestClose={() => setPricingModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Retail Fuel Prices</Text>
            <Text style={styles.modalSub}>Broadcast official prices across all network forecourts</Text>

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
      {/* Shift Audit Detail Modal */}
      {selectedAuditShift && (
        <ShiftAuditDetailModal
          shift={selectedAuditShift}
          onClose={() => setSelectedAuditShift(null)}
        />
      )}
    </SafeAreaView>
  )
}

const ShiftAuditDetailModal: React.FC<{
  shift: Shift
  onClose: () => void
}> = ({ shift, onClose }) => {
  const nozzles = extractShiftNozzlesList(shift)
  const nozzleAudit = nozzles.map(n => {
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

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={[styles.modalCard, { maxHeight: '90%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>{shift.number}</Text>
                <Text style={[styles.modalSub, { color: colors.text, fontWeight: '800', marginTop: 2 }]}>
                  Attendant: {shift.attendantName}
                </Text>
                <Text style={[styles.modalSub, { color: colors.emerald, fontWeight: '600', marginTop: 1 }]}>
                  Dispenser: {shift.pumpName || pumpNameFor(shift.pumpId)} · Nozzles: {formatShiftNozzles(shift)}
                </Text>
                <Text style={[styles.modalSub, { fontSize: 10, color: colors.textDim }]}>
                  {shift.stationName}
                </Text>
              </View>
              <Badge tone={shift.status === 'APPROVED' ? 'success' : shift.status === 'CLOSED' ? 'warning' : 'default'}>
                {shift.status}
              </Badge>
            </View>

            {/* Timing */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.panel2, padding: 8, borderRadius: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 10, color: colors.textFaint }}>Opened: {formatDateTime(shift.openedAt)}</Text>
              <Text style={{ fontSize: 10, color: colors.textFaint }}>Closed: {formatDateTime(shift.closedAt ?? shift.updatedAt)}</Text>
            </View>

            {/* Dispenser & Nozzle Audit List */}
            <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>
              DISPENSER & NOZZLE AUDIT ({shift.pumpName || pumpNameFor(shift.pumpId)})
            </Text>
            <View style={{ gap: 8, marginBottom: 12 }}>
              {nozzleAudit.map((n, i) => (
                <View key={`${n.fuel}-${n.label}-${i}`} style={{ backgroundColor: colors.panel2, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: colors.emerald, fontWeight: '900', fontSize: 13 }}>{n.label}</Text>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                      {formatGHS(n.amount)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
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
            <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>PAYMENT REMITTANCE</Text>
            <View style={{ backgroundColor: colors.panel2, borderRadius: 10, padding: 12, gap: 6, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>Cash at Hand</Text>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{formatGHS(shift.payments?.CASH ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>Mobile Money (MoMo)</Text>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{formatGHS(shift.payments?.MOMO ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>POS / Cards / Vouchers</Text>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{formatGHS(shift.payments?.VOUCHER ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>Credit / Invoices</Text>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{formatGHS(shift.payments?.CREDIT ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }}>
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 12 }}>Total Remitted</Text>
                <Text style={{ color: colors.emerald, fontWeight: '900', fontSize: 13 }}>{formatGHS(shift.actualTotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 12 }}>Variance Status</Text>
                <Text style={{ color: shift.variance === 0 ? colors.emerald : shift.variance > 0 ? colors.blue : colors.rose, fontWeight: '900', fontSize: 12 }}>
                  {shift.variance === 0 ? 'Balanced' : shift.variance > 0 ? `+${formatGHS(shift.variance)} Overage` : `${formatGHS(shift.variance)} Shortage`}
                </Text>
              </View>
            </View>

            {/* Attendant Notes */}
            {shift.reviewNotes ? (
              <View style={{ backgroundColor: 'rgba(249, 115, 22, 0.08)', borderColor: colors.flame, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: colors.flame, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>
                  {shift.reviewNotes.includes('Resubmitted') ? 'ATTENDANT CORRECTION & RESUBMISSION NOTE' : 'ATTENDANT HANDOVER NOTE'}
                </Text>
                <Text style={{ color: colors.text, fontSize: 12, marginTop: 4 }}>{shift.reviewNotes}</Text>
              </View>
            ) : null}

            <PrimaryButton title="Close Audit" onPress={onClose} tone="rose" style={{ marginTop: 6 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
  heading: { color: colors.text, fontSize: 17, fontWeight: '900' },
  sub: { color: colors.textFaint, fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.panel2,
    borderColor: colors.rose,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  signOutText: { color: colors.rose, fontSize: 11, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 14 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 10 },
  loadText: { color: colors.textDim, fontSize: 12 },
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpi: { flex: 1, padding: 14, gap: 4 },
  kpiValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  kpiLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiSub: { color: colors.textDim, fontSize: 11 },
  card: { padding: 14, marginBottom: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: colors.textFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  linkText: { color: colors.emerald, fontSize: 11, fontWeight: '800' },
  listCard: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  rowSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  empty: { color: colors.textFaint, fontSize: 12, padding: 20, textAlign: 'center' },
  miniBtn: { backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  miniBtnText: { color: colors.emerald, fontSize: 11, fontWeight: '700' },
  fieldLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  modal: { flex: 1, backgroundColor: 'rgba(2,6,23,0.85)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18 },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  modalSub: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
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
