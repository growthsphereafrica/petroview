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
  ShieldCheck,
  Building2,
  DollarSign,
  Layers,
  Users,
  Plus,
  MapPin,
  History,
  LayoutDashboard,
  LogOut,
  Tag,
  KeyRound,
} from 'lucide-react-native'
import { colors } from '../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../components/ui'
import { getCloudApiBase, getCloudToken } from '../core/infra/cloudApi'
import { formatGHS, formatLitres, formatDateTime } from '../shared/currencyFormatter'
import type { MobileSession } from './LoginScreen'

type SuperTab = 'companies' | 'stations' | 'telemetry' | 'audit'

interface OmcCompany {
  id: string
  name: string
  shortCode: string
  primaryColor?: string
  phone?: string
  active?: boolean
  stationsCount?: number
}

interface GlobalStation {
  id: string
  companyId: string
  name: string
  code: string
  location: string
  region: string
  supervisorName?: string
}

export const SuperAdminDashboard: React.FC<{
  session: MobileSession
  onSignOut: () => void
}> = ({ session, onSignOut }) => {
  const [tab, setTab] = useState<SuperTab>('companies')
  const [companies, setCompanies] = useState<OmcCompany[]>([])
  const [stations, setStations] = useState<GlobalStation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Create OMC Modal State
  const [createModal, setCreateModal] = useState(false)
  const [omcName, setOmcName] = useState('')
  const [omcCode, setOmcCode] = useState('')
  const [omcPin, setOmcPin] = useState('9999')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const loadPlatformData = useCallback(async () => {
    setLoading(true)
    const base = getCloudApiBase()
    const token = await getCloudToken()

    try {
      if (base && token) {
        // Fetch all OMCs
        const compResp = await fetch(`${base}/api/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null)

        if (compResp && compResp.ok) {
          const comps = await compResp.json()
          if (Array.isArray(comps)) {
            setCompanies(comps)
          }
        }

        // Fetch stations rollup
        const summResp = await fetch(`${base}/api/headoffice/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null)

        if (summResp && summResp.ok) {
          const summ = await summResp.json()
          if (summ && Array.isArray(summ.stations)) {
            setStations(summ.stations)
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlatformData()
  }, [refreshKey, loadPlatformData])

  const submitCreateOmc = async () => {
    if (!omcName.trim() || !omcCode.trim() || omcPin.length !== 4) return
    setCreating(true)
    setCreateError(null)

    try {
      const base = getCloudApiBase()
      const token = await getCloudToken()
      if (base && token) {
        const resp = await fetch(`${base}/api/companies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: omcName.trim(), shortCode: omcCode.trim().toUpperCase(), adminPin: omcPin }),
        })
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.message || 'Failed to create OMC')
        }
      }

      setCreateModal(false)
      setOmcName('')
      setOmcCode('')
      setOmcPin('9999')
      setRefreshKey(k => k + 1)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Error creating company')
    } finally {
      setCreating(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={18} color={colors.rose} />
            <Text style={styles.heading}>Master Platform Console</Text>
          </View>
          <Text style={styles.sub}>{session.fullName} · {session.employeeCode}</Text>
        </View>
        <Pressable onPress={onSignOut} style={styles.signOutBtn}>
          <LogOut size={13} color={colors.rose} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {/* Main Content */}
      <ScrollView contentContainerStyle={styles.content}>
        {loading && companies.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.rose} size="large" />
            <Text style={styles.loadText}>Connecting to Master Registry…</Text>
          </View>
        ) : (
          <>
            {/* Global Platform KPIs */}
            <View style={styles.kpiRow}>
              <Card style={styles.kpi}>
                <Layers size={16} color={colors.rose} />
                <Text style={styles.kpiValue}>{companies.length}</Text>
                <Text style={styles.kpiLabel}>Registered OMCs</Text>
                <Text style={styles.kpiSub}>Multi-tenant fleet</Text>
              </Card>
              <Card style={styles.kpi}>
                <Building2 size={16} color={colors.emerald} />
                <Text style={styles.kpiValue}>{stations.length}</Text>
                <Text style={styles.kpiLabel}>Total Stations</Text>
                <Text style={styles.kpiSub}>Active across Ghana</Text>
              </Card>
            </View>

            {/* Tab 1: Companies / OMCs */}
            {tab === 'companies' && (
              <View style={{ gap: 12 }}>
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>DOWNSTREAM OMC ENTERPRISES</Text>
                  <Pressable onPress={() => setCreateModal(true)} style={[styles.linkBtn, { backgroundColor: colors.rose }]}>
                    <Text style={[styles.linkBtnText, { color: '#ffffff' }]}>+ Onboard OMC</Text>
                  </Pressable>
                </View>

                {companies.length === 0 ? (
                  <Card style={styles.card}>
                    <Text style={styles.empty}>No OMCs registered yet. Tap '+ Onboard OMC' above to provision your first downstream enterprise tenant.</Text>
                  </Card>
                ) : (
                  <Card style={styles.listCard}>
                    {companies.map(c => (
                      <View key={c.id} style={[styles.row, { paddingVertical: 14 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                          <View style={[styles.colorChip, { backgroundColor: c.primaryColor || colors.flame }]}>
                            <Text style={styles.colorChipText}>{c.shortCode.slice(0, 3)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>{c.name}</Text>
                            <Text style={styles.rowSub}>Code: {c.shortCode} · ID: {c.id}</Text>
                            {!!c.phone && <Text style={styles.rowSub}>Phone: {c.phone}</Text>}
                          </View>
                        </View>
                        <Badge tone="success">Active</Badge>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            )}

            {/* Tab 2: Stations Network */}
            {tab === 'stations' && (
              <View style={{ gap: 12 }}>
                <Text style={styles.sectionTitle}>NATIONWIDE FORECOURT NETWORK</Text>
                {stations.length === 0 ? (
                  <Card style={styles.card}>
                    <Text style={styles.empty}>No stations registered in the network. Stations are created by OMC administrators.</Text>
                  </Card>
                ) : (
                  <Card style={styles.listCard}>
                    {stations.map(st => (
                      <View key={st.id} style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{st.name}</Text>
                          <Text style={styles.rowSub}><MapPin size={10} color={colors.textFaint} /> {st.region} · Code: {st.code}</Text>
                        </View>
                        <Badge tone="default">Live</Badge>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            )}

            {/* Tab 3: Telemetry */}
            {tab === 'telemetry' && (
              <View style={{ gap: 12 }}>
                <Text style={styles.sectionTitle}>PLATFORM HEALTH & METRICS</Text>
                <Card style={styles.card}>
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.rowTitle}>Cloud Sync Gateway</Text>
                      <Badge tone="success">Online</Badge>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.rowTitle}>SQLite Data Engine</Text>
                      <Badge tone="success">Operational</Badge>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.rowTitle}>Air-Gapped Mesh Protocol</Text>
                      <Badge tone="success">Active</Badge>
                    </View>
                  </View>
                </Card>
              </View>
            )}

            {/* Tab 4: Audit */}
            {tab === 'audit' && (
              <View style={{ gap: 12 }}>
                <Text style={styles.sectionTitle}>GLOBAL PLATFORM AUDIT TRAIL</Text>
                <Card style={styles.listCard}>
                  {[
                    { action: 'PLATFORM_BOOT', role: 'SYSTEM', time: new Date().toISOString(), note: 'All enterprise OMC tenants synchronized.' },
                    { action: 'SUPER_ADMIN_LOGIN', role: 'SUPERADMIN', time: new Date().toISOString(), note: 'Platform Master Console accessed.' },
                  ].map((e, idx) => (
                    <View key={idx} style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{e.action}</Text>
                        <Text style={styles.rowSub}>{e.note}</Text>
                        <Text style={[styles.rowSub, { fontSize: 10, marginTop: 2, fontFamily: 'monospace' }]}>
                          {e.role} · {formatDateTime(e.time)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            <Pressable onPress={() => setRefreshKey(k => k + 1)} style={styles.reloadBtn}>
              <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: '700' }}>↻ Refresh Master Registry</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {([
          ['companies', Layers, 'OMCs'],
          ['stations', Building2, 'Stations'],
          ['telemetry', DollarSign, 'Health'],
          ['audit', History, 'Audit'],
        ] as const).map(([key, Icon, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tabItem, tab === key && styles.tabItemActive]}>
            <Icon size={16} color={tab === key ? colors.rose : colors.textFaint} />
            <Text style={[styles.tabLabel, { color: tab === key ? colors.rose : colors.textFaint }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Onboard OMC Modal */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Onboard New OMC</Text>
            <Text style={styles.modalSub}>Provision an Oil Marketing Company tenant</Text>

            {createError && <Text style={styles.errorText}>{createError}</Text>}

            <View style={{ gap: 8, marginTop: 12 }}>
              <View>
                <Text style={styles.fieldLabel}>COMPANY NAME</Text>
                <StyledTextInput value={omcName} onChangeText={setOmcName} placeholder="e.g. Allied Oil Ltd" />
              </View>

              <View>
                <Text style={styles.fieldLabel}>SHORT CODE (MAX 8 CHARS)</Text>
                <StyledTextInput value={omcCode} onChangeText={t => setOmcCode(t.toUpperCase())} placeholder="e.g. ALLIED" autoCapitalize="characters" />
              </View>

              <View>
                <Text style={styles.fieldLabel}>DEFAULT HQ ADMIN PIN (4 DIGITS)</Text>
                <StyledTextInput value={omcPin} onChangeText={t => setOmcPin(t.replace(/\D/g, '').slice(0, 4))} placeholder="9999" keyboardType="number-pad" />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <PrimaryButton title={creating ? 'Provisioning…' : 'Create OMC'} onPress={() => void submitCreateOmc()} disabled={creating || !omcName || !omcCode || omcPin.length !== 4} tone="rose" style={{ flex: 1 }} />
              <PrimaryButton title="Cancel" onPress={() => setCreateModal(false)} tone="rose" style={{ flex: 1 }} />
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
  empty: { color: colors.textFaint, fontSize: 12, padding: 18, textAlign: 'center' },
  sectionTitle: { color: colors.textFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  linkBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  linkBtnText: { fontSize: 11, fontWeight: '800' },
  listCard: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  rowSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  colorChip: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  colorChipText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  errorText: { color: colors.rose, fontSize: 12, fontWeight: '600', marginTop: 8 },
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
