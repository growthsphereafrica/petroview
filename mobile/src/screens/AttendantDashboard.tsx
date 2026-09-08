import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Modal, ActivityIndicator } from 'react-native'
import { Fuel, Banknote, LogOut, RefreshCw, QrCode } from 'lucide-react-native'
import { colors } from '../theme'
import { Card, PrimaryButton, StyledTextInput } from '../components/ui'
import { QrSyncSheet } from '../components/QrSyncSheet'
import { shiftService, syncNow } from '../core/services/shiftService'
import type { Shift } from '../core/domain/types'
import type { MobileSession } from './LoginScreen'

const PUMPS = [
  { id: 'pump-1', name: 'Pump 1', fuels: ['PMS', 'AGO', 'DPK', 'KERO'] },
  { id: 'pump-2', name: 'Pump 2', fuels: ['PMS', 'AGO'] },
  { id: 'pump-3', name: 'Pump 3', fuels: ['PMS', 'AGO'] },
  { id: 'pump-4', name: 'Pump 4', fuels: ['PMS', 'AGO'] },
]

const FUEL_PRICES: Record<string, number> = { PMS: 14.8, AGO: 15.2, DPK: 13.9, KERO: 13.5 }

export const AttendantDashboard: React.FC<{ session: MobileSession }> = ({ session }) => {
  const [shift, setShift] = useState<Shift | null>(null)
  const [attendantId, setAttendantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [openModal, setOpenModal] = useState(false)
  const [saleModal, setSaleModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  const refresh = async () => {
    if (!attendantId) return
    const [active, pending] = await Promise.all([getActive(), getPending()])
    setShift(active)
    setPendingCount(pending)
    setLoading(false)
  }

  const getActive = async () => {
    const { getActiveShiftForAttendant } = await import('../core/infra/repositories')
    return getActiveShiftForAttendant(attendantId as string)
  }

  const getPending = async () => {
    const { pendingSyncCount } = await import('../core/infra/repositories')
    return pendingSyncCount()
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendantId])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.emerald} size="large" />
          <Text style={styles.loadText}>Loading forecourt…</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {session.fullName.split(' ')[0]} 👋</Text>
            <Text style={styles.subGreeting}>{session.employeeCode} · Green Valley Main</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable onPress={() => setQrOpen(true)} style={styles.iconBtn}>
              <QrCode size={16} color={colors.violet} />
            </Pressable>
            <Pressable onPress={async () => { setSyncing(true); await syncNow(); const p = await getPending(); setPendingCount(p); setSyncing(false) }} style={styles.iconBtn} disabled={syncing}>
              {syncing ? <ActivityIndicator size="small" color={colors.emerald} /> : <RefreshCw size={16} color={pendingCount ? colors.amber : colors.textDim} />}
              <Text style={styles.iconBtnText}>{pendingCount} pending</Text>
            </Pressable>
          </View>
        </View>

        {/* Shift card */}
        <Card style={styles.shiftCard}>
          <View style={styles.shiftHeader}>
            <Text style={styles.shiftTitle}>{shift ? `Shift ${shift.number}` : 'No open shift'}</Text>
            <Text style={[styles.shiftStatus, { color: shift ? colors.emerald : colors.textFaint }]}>{shift ? '● OPEN' : '○ IDLE'}</Text>
          </View>
          <Text style={styles.shiftMeta}>{shift ? `Pump ${shift.pumpId.replace('pump-', '')} · opened ${new Date(shift.openedAt).toLocaleTimeString()}` : 'Start a shift to begin recording sales'}</Text>
          {shift && (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{ghs(shift.salesTotal)}</Text>
                <Text style={styles.statLabel}>Sales</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{shift.sales.length}</Text>
                <Text style={styles.statLabel}>Transactions</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{Math.round(shift.sales.reduce((a, s) => a + s.litres, 0))}L</Text>
                <Text style={styles.statLabel}>Litres</Text>
              </View>
            </View>
          )}
          <View style={styles.shiftActions}>
            <PrimaryButton title="Open Shift" onPress={() => setOpenModal(true)} disabled={!!shift} tone="emerald" />
            <PrimaryButton title="Record Sale" onPress={() => setSaleModal(true)} disabled={!shift} tone="violet" style={{ marginTop: 8 }} />
            <PrimaryButton title="Close Shift" onPress={() => setCloseModal(true)} disabled={!shift} tone="amber" style={{ marginTop: 8 }} />
          </View>
        </Card>

        {/* Recent sales */}
        <Text style={styles.sectionTitle}>RECENT SALES</Text>
        {shift && shift.sales.length > 0 ? (
          <Card style={styles.listCard}>
            {[...shift.sales].reverse().slice(0, 7).map((s, i) => (
              <Pressable key={i} style={styles.listRow} onPress={() => setSaleModal(true)}>
                <Fuel size={14} color={colors.blue} />
                <Text style={styles.listFuel}>{s.fuelCode}</Text>
                <Text style={styles.listLitres}>{s.litres}L</Text>
                <Text style={styles.listAmount}>{ghs(s.amount)}</Text>
              </Pressable>
            ))}
          </Card>
        ) : (
          <Text style={styles.emptyText}>No sales yet. Record your first sale to begin the shift log.</Text>
        )}

        <Pressable onPress={() => void mobileSignOut()} style={styles.signOut} disabled={!!shift}>
          <LogOut size={14} color={colors.rose} />
          <Text style={styles.signOutText}>Sign out{shift ? ' (close shift first)' : ''}</Text>
        </Pressable>
      </ScrollView>

      <OpenShiftModal visible={openModal} onClose={() => setOpenModal(false)} onConfirm={async pumpId => {
        try {
          setOpenModal(false)
          setError(null)
          const { findAttendantByCode } = await import('../core/infra/repositories')
          const att = await findAttendantByCode(session.employeeCode)
          if (!att) return
          setAttendantId(att.id)
          await shiftService.openShift({
            attendant: att,
            pumpId,
            openingReadings: {
              PMS: { fuelCode: 'PMS', value: 1000 },
              AGO: { fuelCode: 'AGO', value: 500 },
              DPK: { fuelCode: 'DPK', value: 300 },
              KERO: { fuelCode: 'KERO', value: 200 },
            },
          })
          await refresh()
        } catch (e) {
          const { describeError } = await import('../core/services/shiftService')
          setError(describeError(e))
        }
      }} />
      <SaleModal visible={saleModal} onClose={() => setSaleModal(false)} onSave={async (fuel, litres, method) => {
        try {
          setSaleModal(false)
          if (!shift) return
          await shiftService.recordSale({
            shiftId: shift.id,
            fuelCode: fuel as 'PMS' | 'AGO' | 'DPK' | 'KERO',
            litres,
            method: method as 'CASH' | 'MOMO' | 'VOUCHER' | 'CREDIT',
          })
          await refresh()
        } catch (e) {
          const { describeError } = await import('../core/services/shiftService')
          setError(describeError(e))
        }
      }} />
      <CloseShiftModal visible={closeModal} onClose={() => setCloseModal(false)} onConfirm={async () => {
        try {
          setCloseModal(false)
          if (!shift) return
          await shiftService.closeShift({
            shiftId: shift.id,
            closingReadings: {
              PMS: { fuelCode: 'PMS', value: 1050 },
              AGO: { fuelCode: 'AGO', value: 540 },
              DPK: { fuelCode: 'DPK', value: 320 },
              KERO: { fuelCode: 'KERO', value: 215 },
            },
          })
          await refresh()
        } catch (e) {
          const { describeError } = await import('../core/services/shiftService')
          setError(describeError(e))
        }
      }} />

      {error && (
        <View style={styles.errorToast}>
          <Text style={styles.errorToastText}>{error}</Text>
          <Pressable onPress={() => setError(null)}><Text style={{ color: colors.rose }}>✕</Text></Pressable>
        </View>
      )}
      <QrSyncSheet visible={qrOpen} onClose={() => setQrOpen(false)} onSynced={refresh} />
    </SafeAreaView>
  )

  async function mobileSignOut() {
    const { mobileAuth } = await import('../core/services/authService')
    await mobileAuth.logout()
  }
}

// ---- Modals ---------------------------------------------------------------

const OpenShiftModal: React.FC<{ visible: boolean; onClose: () => void; onConfirm: (pumpId: string) => Promise<void> }> = ({ visible, onClose, onConfirm }) => {
  const [pumpId, setPumpId] = useState('pump-1')
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Open Shift</Text>
          <Text style={styles.modalSub}>Select pump for this shift</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {PUMPS.map(p => (
              <Pressable key={p.id} onPress={() => setPumpId(p.id)} style={[styles.pumpChip, { borderColor: pumpId === p.id ? colors.emerald : colors.border }]}>
                <Text style={{ color: pumpId === p.id ? colors.emerald : colors.textDim, fontWeight: '800', fontSize: 13 }}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton title="Start Shift" onPress={() => void onConfirm(pumpId)} style={{ marginTop: 16 }} />
          <PrimaryButton title="Cancel" onPress={onClose} tone="rose" style={{ marginTop: 8 }} />
        </Card>
      </View>
    </Modal>
  )
}

const SaleModal: React.FC<{ visible: boolean; onClose: () => void; onSave: (fuel: string, litres: number, method: string) => Promise<void> }> = ({ visible, onClose, onSave }) => {
  const [fuel, setFuel] = useState('PMS')
  const [litres, setLitres] = useState('')
  const [method, setMethod] = useState('CASH')
  const [busy, setBusy] = useState(false)
  const f = fuel as keyof typeof FUEL_PRICES
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Record Sale</Text>
          <Text style={styles.modalSub}>Price: {FUEL_PRICES[f]} GHS/L</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {Object.keys(FUEL_PRICES).map(k => (
              <Pressable key={k} onPress={() => setFuel(k)} style={[styles.pumpChip, { borderColor: fuel === k ? colors.emerald : colors.border }]}>
                <Text style={{ color: fuel === k ? colors.emerald : colors.textDim, fontWeight: '800', fontSize: 13 }}>{k}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>LITRES</Text>
          <StyledTextInput value={litres} onChangeText={t => setLitres(t.replace(/[^0-9.]/g, ''))} placeholder="e.g. 20" keyboardType="number-pad" />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>PAYMENT</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {['CASH', 'MOMO', 'VOUCHER', 'CREDIT'].map(m => (
              <Pressable key={m} onPress={() => setMethod(m)} style={[styles.pumpChip, { borderColor: method === m ? colors.violet : colors.border }]}>
                <Text style={{ color: method === m ? colors.violet : colors.textDim, fontWeight: '800', fontSize: 12 }}>{m}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={styles.amountPreview}>Amount: {ghs(Number(litres || 0) * FUEL_PRICES[f])}</Text>
          </View>
          <PrimaryButton title={busy ? 'Saving…' : 'Save Sale'} onPress={async () => { setBusy(true); await onSave(fuel, Number(litres), method); setBusy(false) }} disabled={!litres || Number(litres) <= 0} style={{ marginTop: 12 }} />
          <PrimaryButton title="Cancel" onPress={onClose} tone="rose" style={{ marginTop: 8 }} />
        </Card>
      </View>
    </Modal>
  )
}

const CloseShiftModal: React.FC<{ visible: boolean; onClose: () => void; onConfirm: () => Promise<void> }> = ({ visible, onClose, onConfirm }) => {
  const [busy, setBusy] = useState(false)
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Close Shift</Text>
          <Text style={styles.modalSub}>Readings will be reconciled and variance computed. The closed shift is queued for sync.</Text>
          <View style={styles.warningBox}>
            <Banknote size={14} color={colors.amber} />
            <Text style={{ color: colors.amber, fontSize: 12, flex: 1, marginLeft: 6 }}>Cash book must match reported sales. Any variance is flagged to the supervisor.</Text>
          </View>
          <PrimaryButton title={busy ? 'Closing…' : 'Confirm Close & Queue Sync'} onPress={async () => { setBusy(true); await onConfirm(); setBusy(false) }} tone="amber" style={{ marginTop: 14 }} />
          <PrimaryButton title="Cancel" onPress={onClose} style={{ marginTop: 8 }} />
        </Card>
      </View>
    </Modal>
  )
}

function ghs(n: number) {
  return `GHS ${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText: { color: colors.textDim, fontSize: 12 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting: { color: colors.text, fontSize: 20, fontWeight: '900' },
  subGreeting: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  iconBtnText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  shiftCard: { padding: 16, marginBottom: 16 },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  shiftStatus: { fontSize: 11, fontWeight: '800' },
  shiftMeta: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
  stats: { flexDirection: 'row', marginTop: 14, backgroundColor: colors.panel2, borderRadius: 12, padding: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 14, fontWeight: '900' },
  statLabel: { color: colors.textFaint, fontSize: 9, textTransform: 'uppercase', marginTop: 2 },
  shiftActions: { marginTop: 14 },
  sectionTitle: { color: colors.textFaint, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  listCard: { overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  listFuel: { color: colors.text, fontWeight: '800', fontSize: 13, width: 44 },
  listLitres: { color: colors.textDim, fontSize: 12, flex: 1, textAlign: 'left' },
  listAmount: { color: colors.text, fontSize: 12, fontWeight: '800' },
  emptyText: { color: colors.textFaint, fontSize: 12, marginBottom: 16 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, padding: 12 },
  signOutText: { color: colors.rose, fontSize: 12, fontWeight: '700' },
  errorToast: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: colors.panel2, borderColor: colors.rose, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  errorToastText: { color: colors.rose, fontSize: 12, flex: 1, fontWeight: '600' },
  modalBack: { flex: 1, backgroundColor: 'rgba(2,6,23,0.8)', justifyContent: 'center', padding: 20 },
  modalCard: { padding: 18 },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  modalSub: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  pumpChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  fieldLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  amountPreview: { color: colors.text, fontSize: 16, fontWeight: '800' },
  warningBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel2, borderRadius: 10, padding: 12, marginTop: 12 },
  drawer: { height: 0 },
})