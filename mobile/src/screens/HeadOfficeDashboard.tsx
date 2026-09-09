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
} from 'lucide-react-native'
import { colors } from '../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../components/ui'
import { rollupService, type HqSummary } from '../core/services/rollupService'
import { getCloudApiBase, getCloudToken } from '../core/infra/cloudApi'
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
              ...(json.supervisors || []).map(s => ({ ...s, role: 'supervisor' as const })),
              ...(json.attendants || []).map(a => ({ ...a, role: 'attendant' as const })),
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
                    <View key={s.id} style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{s.number} · {s.attendantName}</Text>
                        <Text style={styles.rowSub}>{s.stationName} · {formatDateTime(s.closedAt ?? s.openedAt)}</Text>
                      </View>
                      <Text style={[styles.rowTitle, { color: colors.emerald }]}>{formatGHS(s.actualTotal)}</Text>
                    </View>
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
    </SafeAreaView>
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
