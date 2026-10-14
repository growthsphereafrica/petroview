import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Fuel, Banknote, LogOut, RefreshCw, QrCode, Droplets, DollarSign, Zap, Calculator, Lock, AlertTriangle, CheckCircle } from 'lucide-react-native'
import { colors } from '../theme'
import { Card, PrimaryButton, StyledTextInput } from '../components/ui'
import { QrSyncSheet } from '../components/QrSyncSheet'
import { TankReadingsSheet } from './supervisor/TankReadingsSheet'
import { shiftService, syncNow } from '../core/services/shiftService'
import type { Attendant, Shift } from '../core/domain/types'
import type { MobileSession } from './LoginScreen'
import { formatGHS, formatLitres, formatDateTime } from '../shared/currencyFormatter'
import { PRODUCTION_PUMPS, PRODUCTION_STATION } from '../core/domain/config'

const PUMPS = PRODUCTION_PUMPS
const FUEL_PRICES: Record<string, number> = PRODUCTION_STATION.fuelPrices

export const AttendantDashboard: React.FC<{
  session: MobileSession
  onSignOut: () => void
}> = ({ session, onSignOut }) => {
  const [shift, setShift] = useState<Shift | null>(null)
  const [attendantId, setAttendantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [openModal, setOpenModal] = useState(false)
  const [saleModal, setSaleModal] = useState(false)
  const [expenseModal, setExpenseModal] = useState(false)
  const [expenseAmt, setExpenseAmt] = useState('')
  const [expenseNote, setExpenseNote] = useState('')
  const [closeModal, setCloseModal] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [tankOpen, setTankOpen] = useState(false)

  useEffect(() => {
    let active = true
    async function init() {
      try {
        const { getActiveShiftForAttendant, pendingSyncCount } = await import('../core/infra/repositories')
        const [curShift, pending] = await Promise.all([
          getActiveShiftForAttendant(session.userId),
          pendingSyncCount(),
        ])
        if (active) {
          setAttendantId(session.userId)
          setShift(curShift)
          setPendingCount(pending)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void init()
    return () => { active = false }
  }, [session.userId])

  const refresh = useCallback(async () => {
    if (!attendantId) return
    const { getActiveShiftForAttendant, pendingSyncCount } = await import('../core/infra/repositories')
    const [active, pending] = await Promise.all([
      getActiveShiftForAttendant(attendantId),
      pendingSyncCount(),
    ])
    setShift(active)
    setPendingCount(pending)
    setLoading(false)
  }, [attendantId])

  const insets = useSafeAreaInsets()

  if (loading) {
    return (
      <View style={[styles.safe, styles.center, { paddingTop: Math.max(insets.top, 20) }]}>
        <ActivityIndicator color={colors.emerald} size="large" />
        <Text style={styles.loadText}>Connecting to Forecourt…</Text>
      </View>
    )
  }

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 48, 64) }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.greeting} numberOfLines={1}>Hello, {session.fullName.split(' ')[0]} 👋</Text>
            <Text style={styles.subGreeting} numberOfLines={1}>{session.employeeCode} · {session.stationName || 'Forecourt Station'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Pressable onPress={onSignOut} style={styles.iconBtn} hitSlop={8}>
              <LogOut size={16} color={colors.rose} />
            </Pressable>
            <Pressable onPress={() => setTankOpen(true)} style={styles.iconBtn} hitSlop={8}>
              <Droplets size={16} color={colors.blue} />
            </Pressable>
            <Pressable onPress={() => setQrOpen(true)} style={styles.iconBtn} hitSlop={8}>
              <QrCode size={16} color={colors.violet} />
            </Pressable>
            <Pressable
              onPress={async () => {
                setSyncing(true)
                await syncNow()
                const { pendingSyncCount } = await import('../core/infra/repositories')
                setPendingCount(await pendingSyncCount())
                setSyncing(false)
              }}
              style={styles.iconBtn}
              disabled={syncing}
              hitSlop={8}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.emerald} />
              ) : (
                <RefreshCw size={16} color={pendingCount ? colors.amber : colors.textDim} />
              )}
              <Text style={styles.iconBtnText}>{pendingCount} pending</Text>
            </Pressable>
          </View>
        </View>

        {/* Shift Card */}
        <Card style={styles.shiftCard}>
          <View style={styles.shiftHeader}>
            <Text style={styles.shiftTitle}>{shift ? `Shift ${shift.number}` : 'No open shift'}</Text>
            <Text style={[styles.shiftStatus, { color: shift ? colors.emerald : colors.textFaint }]}>
              {shift ? '● OPEN' : '○ IDLE'}
            </Text>
          </View>
          <Text style={styles.shiftMeta}>
            {shift
              ? `Pump ${shift.pumpId.replace('pump-', '')} · opened ${formatDateTime(shift.openedAt)}`
              : 'Start a shift to begin dispensing and recording sales'}
          </Text>

          {shift && (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatGHS(shift.salesTotal)}</Text>
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
            {!shift ? (
              <PrimaryButton title="Open Shift" onPress={() => setOpenModal(true)} tone="emerald" />
            ) : (
              <>
                <PrimaryButton
                  title="🔒 End Shift & Enter Closing Meters"
                  onPress={() => setCloseModal(true)}
                  tone="amber"
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <PrimaryButton
                    title="⚡ Single Receipt (POS)"
                    onPress={() => setSaleModal(true)}
                    tone="emerald"
                    style={{ flex: 1 }}
                  />
                  <PrimaryButton
                    title="Add Expense"
                    onPress={() => setExpenseModal(true)}
                    tone="violet"
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            )}
          </View>
        </Card>

        {/* Recent Sales List */}
        <Text style={styles.sectionTitle}>RECENT TRANSACTIONS</Text>
        {shift && shift.sales.length > 0 ? (
          <Card style={styles.listCard}>
            {[...shift.sales].reverse().slice(0, 8).map((s, i) => (
              <View key={i} style={styles.listRow}>
                <Fuel size={14} color={s.fuelCode === 'PMS' ? '#22c55e' : '#3b82f6'} />
                <Text style={styles.listFuel}>{s.fuelCode}</Text>
                <Text style={styles.listLitres}>{formatLitres(s.litres)} L</Text>
                <Text style={styles.listAmount}>{formatGHS(s.amount)}</Text>
              </View>
            ))}
          </Card>
        ) : (
          <Text style={styles.emptyText}>No sales recorded yet for this shift.</Text>
        )}

        {/* Sign out */}
        <Pressable onPress={onSignOut} style={[styles.signOut, { marginBottom: Math.max(insets.bottom, 16) }]} disabled={!!shift}>
          <LogOut size={14} color={shift ? colors.textFaint : colors.rose} />
          <Text style={[styles.signOutText, shift && { color: colors.textFaint }]}>
            Sign out{shift ? ' (Close shift first)' : ''}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Modals */}
      <OpenShiftModal
        visible={openModal}
        onClose={() => setOpenModal(false)}
        onConfirm={async pumpId => {
          try {
            setOpenModal(false)
            setError(null)
            const attendant: Attendant = {
              id: session.userId,
              employeeCode: session.employeeCode,
              fullName: session.fullName,
              pinSalt: '',
              pinHash: '',
              pumpId: null,
              stationId: session.stationId,
              companyId: session.companyId,
              companyShortCode: session.companyShortCode ?? undefined,
              approvalStatus: 'APPROVED',
              active: true,
              failedAttempts: 0,
              lockoutUntil: null,
              createdAt: new Date().toISOString(),
            }
            setAttendantId(attendant.id)
            const selectedPump = PUMPS.find(p => p.id === pumpId) || PUMPS[0]
            const openingReadings: Record<string, { fuelCode: string; value: number }> = {}
            for (const f of selectedPump.fuels) {
              openingReadings[f] = { fuelCode: f, value: 1000 }
            }
            await shiftService.openShift({
              attendant,
              pumpId,
              openingReadings,
            })
            await refresh()
          } catch (e) {
            const { describeError } = await import('../core/services/shiftService')
            setError(describeError(e))
          }
        }}
      />

      <SaleModal
        visible={saleModal}
        onClose={() => setSaleModal(false)}
        onSave={async (fuel, litres, method) => {
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
        }}
      />

      <CloseShiftModal
        visible={closeModal}
        shift={shift}
        onClose={() => setCloseModal(false)}
        onConfirm={async (closingReadings, remittance, notes) => {
          try {
            setCloseModal(false)
            if (!shift) return
            await shiftService.closeShift({
              shiftId: shift.id,
              closingReadings,
              remittance,
              notes,
            })
            await refresh()
          } catch (e) {
            const { describeError } = await import('../core/services/shiftService')
            setError(describeError(e))
          }
        }}
      />

      {/* Expense Modal */}
      {expenseModal && (
        <Modal visible transparent animationType="slide">
          <View style={styles.modalBack}>
            <Card style={styles.modalCard}>
              <Text style={styles.modalTitle}>Record Shift Expense</Text>
              <Text style={styles.modalSub}>Deductions & petty cash paid out from forecourt</Text>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>AMOUNT (GHS)</Text>
              <StyledTextInput
                value={expenseAmt}
                onChangeText={t => setExpenseAmt(t.replace(/[^0-9.]/g, ''))}
                placeholder="e.g. 50"
                keyboardType="number-pad"
              />

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>RECIPIENT / PURPOSE</Text>
              <StyledTextInput
                value={expenseNote}
                onChangeText={setExpenseNote}
                placeholder="e.g. Generator petrol"
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <PrimaryButton
                  title="Save Expense"
                  onPress={() => {
                    setExpenseAmt('')
                    setExpenseNote('')
                    setExpenseModal(false)
                  }}
                  disabled={!expenseAmt || Number(expenseAmt) <= 0}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  title="Cancel"
                  onPress={() => {
                    setExpenseAmt('')
                    setExpenseNote('')
                    setExpenseModal(false)
                  }}
                  tone="rose"
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          </View>
        </Modal>
      )}

      <TankReadingsSheet
        visible={tankOpen}
        onClose={() => setTankOpen(false)}
        stationId={session.stationId ?? null}
        stationName={session.stationName}
      />

      <QrSyncSheet visible={qrOpen} onClose={() => setQrOpen(false)} onSynced={refresh} />

      {error && (
        <View style={styles.errorToast}>
          <Text style={styles.errorToastText}>{error}</Text>
          <Pressable onPress={() => setError(null)}><Text style={{ color: colors.rose }}>✕</Text></Pressable>
        </View>
      )}
    </View>
  )

}

// ---- Modals ---------------------------------------------------------------

const OpenShiftModal: React.FC<{
  visible: boolean
  onClose: () => void
  onConfirm: (pumpId: string) => Promise<void>
}> = ({ visible, onClose, onConfirm }) => {
  const [pumpId, setPumpId] = useState('pump-1')
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Open Shift</Text>
          <Text style={styles.modalSub}>Select dispensing pump assigned to you</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {PUMPS.map(p => (
              <Pressable
                key={p.id}
                onPress={() => setPumpId(p.id)}
                style={[styles.pumpChip, { borderColor: pumpId === p.id ? colors.emerald : colors.border }]}
              >
                <Text style={{ color: pumpId === p.id ? colors.emerald : colors.textDim, fontWeight: '800', fontSize: 13 }}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton title="Start Shift" onPress={() => void onConfirm(pumpId)} style={{ marginTop: 18 }} />
          <PrimaryButton title="Cancel" onPress={onClose} tone="rose" style={{ marginTop: 8 }} />
        </Card>
      </View>
    </Modal>
  )
}

const SaleModal: React.FC<{
  visible: boolean
  onClose: () => void
  onSave: (fuel: string, litres: number, method: string) => Promise<void>
}> = ({ visible, onClose, onSave }) => {
  const [fuel, setFuel] = useState('PMS')
  const [litres, setLitres] = useState('')
  const [method, setMethod] = useState('CASH')
  const [busy, setBusy] = useState(false)
  const f = fuel as keyof typeof FUEL_PRICES

  const setAmountPreset = (ghsAmount: number) => {
    const l = Math.round((ghsAmount / FUEL_PRICES[f]) * 100) / 100
    setLitres(String(l))
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Record Fuel Dispensed</Text>
          <Text style={styles.modalSub}>Price: GHS {FUEL_PRICES[f].toFixed(2)} / Litre</Text>

          {/* Fuel selection */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {Object.keys(FUEL_PRICES).map(k => (
              <Pressable
                key={k}
                onPress={() => setFuel(k)}
                style={[styles.pumpChip, { borderColor: fuel === k ? colors.emerald : colors.border }]}
              >
                <Text style={{ color: fuel === k ? colors.emerald : colors.textDim, fontWeight: '800', fontSize: 13 }}>
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Quick Presets */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>QUICK PRESETS (GHS)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {[50, 100, 200, 500].map(amt => (
              <Pressable
                key={amt}
                onPress={() => setAmountPreset(amt)}
                style={[styles.chip, { backgroundColor: colors.panel2 }]}
              >
                <Text style={{ color: colors.emerald, fontWeight: '800', fontSize: 11 }}>GHS {amt}</Text>
              </Pressable>
            ))}
          </View>

          {/* Litres input */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>LITRES DISPENSED</Text>
          <StyledTextInput
            value={litres}
            onChangeText={t => setLitres(t.replace(/[^0-9.]/g, ''))}
            placeholder="e.g. 20"
            keyboardType="number-pad"
          />

          {/* Payment Method */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>PAYMENT METHOD</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {['CASH', 'MOMO', 'POS', 'CREDIT'].map(m => (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={[styles.pumpChip, { borderColor: method === m ? colors.violet : colors.border }]}
              >
                <Text style={{ color: method === m ? colors.violet : colors.textDim, fontWeight: '800', fontSize: 12 }}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={styles.amountPreview}>Total: {formatGHS(Number(litres || 0) * FUEL_PRICES[f])}</Text>
          </View>

          <PrimaryButton
            title={busy ? 'Saving…' : 'Save & Confirm Sale'}
            onPress={async () => {
              setBusy(true)
              await onSave(fuel, Number(litres), method)
              setBusy(false)
            }}
            disabled={!litres || Number(litres) <= 0}
            style={{ marginTop: 14 }}
          />
          <PrimaryButton title="Cancel" onPress={onClose} tone="rose" style={{ marginTop: 8 }} />
        </Card>
      </View>
    </Modal>
  )
}

const CloseShiftModal: React.FC<{
  visible: boolean
  shift: Shift | null
  onClose: () => void
  onConfirm: (
    closingReadings: Record<string, { fuelCode: string; value: number }>,
    remittance: { CASH: number; MOMO: number; VOUCHER: number; CREDIT: number },
    notes?: string,
  ) => Promise<void>
}> = ({ visible, shift, onClose, onConfirm }) => {
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [cash, setCash] = useState('')
  const [momo, setMomo] = useState('')
  const [card, setCard] = useState('')
  const [credit, setCredit] = useState('')
  const [notes, setNotes] = useState('')

  const fuels = shift?.openingReadings ? Object.keys(shift.openingReadings) : ['PMS', 'AGO']

  // Per-fuel calculations
  let totalLitres = 0
  let totalExpectedCash = 0
  let allValid = fuels.length > 0

  const nozzleRows = fuels.map(fuel => {
    const opening = shift?.openingReadings?.[fuel]?.value ?? 0
    const raw = values[fuel] ?? ''
    const val = parseFloat(raw.replace(/,/g, '')) || 0
    const price = FUEL_PRICES[fuel as keyof typeof FUEL_PRICES] ?? 14.8
    const hasInput = raw.trim().length > 0
    const isValid = hasInput && val >= opening

    if (!isValid) allValid = false

    const litres = isValid ? Math.round((val - opening) * 100) / 100 : 0
    const amount = Math.round(litres * price * 100) / 100

    if (isValid) {
      totalLitres += litres
      totalExpectedCash += amount
    }

    return { fuel, opening, raw, val, price, litres, amount, isValid, hasInput }
  })

  totalLitres = Math.round(totalLitres * 100) / 100
  totalExpectedCash = Math.round(totalExpectedCash * 100) / 100

  const cNum = parseFloat(cash.replace(/,/g, '')) || 0
  const mNum = parseFloat(momo.replace(/,/g, '')) || 0
  const kNum = parseFloat(card.replace(/,/g, '')) || 0
  const crNum = parseFloat(credit.replace(/,/g, '')) || 0
  const totalRemitted = Math.round((cNum + mNum + kNum + crNum) * 100) / 100
  const variance = Math.round((totalRemitted - totalExpectedCash) * 100) / 100

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={[styles.modalCard, { maxHeight: '90%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>End Shift & Closing Meters</Text>
            <Text style={styles.modalSub}>
              Enter closing pump stock to compute total litres sold and cash at hand.
            </Text>

            {/* Nozzles input */}
            <View style={{ marginTop: 12, gap: 10 }}>
              {nozzleRows.map(row => (
                <View key={row.fuel} style={{ backgroundColor: colors.panel2, borderRadius: 10, padding: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: colors.emerald, fontWeight: '900', fontSize: 13 }}>{row.fuel}</Text>
                    <Text style={{ color: colors.textDim, fontSize: 11 }}>
                      Opening: <Text style={{ color: colors.text, fontWeight: '700' }}>{row.opening.toFixed(2)}</Text> · Rate: GHS {row.price.toFixed(2)}/L
                    </Text>
                  </View>
                  <StyledTextInput
                    value={row.raw}
                    onChangeText={t => setValues(prev => ({ ...prev, [row.fuel]: t.replace(/[^0-9.]/g, '') }))}
                    placeholder={`Closing (min ${row.opening.toFixed(2)})`}
                    keyboardType="number-pad"
                  />
                  {row.isValid && (
                    <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 4 }}>
                      Sold: <Text style={{ color: colors.emerald, fontWeight: '800' }}>{row.litres.toFixed(2)} L</Text> ={' '}
                      <Text style={{ color: colors.text, fontWeight: '800' }}>{formatGHS(row.amount)}</Text>
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* KEY HIGHLIGHT CARD: Litres Sold & Cash to Have at Hand */}
            <View
              style={{
                marginTop: 14,
                backgroundColor: 'rgba(249, 115, 22, 0.12)',
                borderColor: colors.amber,
                borderWidth: 1.5,
                borderRadius: 14,
                padding: 12,
              }}
            >
              <Text style={{ color: colors.amber, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                ⚡ Shift Sales Total
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <View>
                  <Text style={{ color: colors.textDim, fontSize: 10, textTransform: 'uppercase' }}>Total Litres Sold</Text>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{totalLitres.toFixed(2)} L</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.amber, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>
                    Cash to Have at Hand
                  </Text>
                  <Text style={{ color: colors.amber, fontSize: 18, fontWeight: '900' }}>
                    {formatGHS(totalExpectedCash)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Remittance handover */}
            <View style={{ marginTop: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>Handover Remittance</Text>
                {totalExpectedCash > 0 && (
                  <Pressable
                    onPress={() => {
                      setCash(totalExpectedCash.toFixed(2))
                      setMomo('')
                      setCard('')
                      setCredit('')
                    }}
                    style={{ backgroundColor: colors.panel2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                  >
                    <Text style={{ color: colors.amber, fontSize: 10, fontWeight: '800' }}>All in Cash</Text>
                  </Pressable>
                )}
              </View>

              <StyledTextInput
                value={cash}
                onChangeText={t => setCash(t.replace(/[^0-9.]/g, ''))}
                placeholder="Cash at Hand (GHS)"
                keyboardType="number-pad"
              />
              <StyledTextInput
                value={momo}
                onChangeText={t => setMomo(t.replace(/[^0-9.]/g, ''))}
                placeholder="Mobile Money / MoMo (GHS)"
                keyboardType="number-pad"
              />

              <View
                style={{
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: variance === 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: variance === 0 ? colors.emerald : colors.rose, fontSize: 11, fontWeight: '700' }}>
                  {variance === 0 ? 'Balanced — Exact Handover' : variance > 0 ? `Overage: +${formatGHS(variance)}` : `Shortage: ${formatGHS(variance)}`}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '900', fontSize: 12 }}>
                  Total: {formatGHS(totalRemitted)}
                </Text>
              </View>

              <StyledTextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Closing note (optional / variance reason)"
              />
            </View>

            <PrimaryButton
              title={busy ? 'Locking…' : 'Confirm Close & Submit to Manager'}
              onPress={async () => {
                setBusy(true)
                const closings: Record<string, { fuelCode: string; value: number }> = {}
                for (const row of nozzleRows) {
                  closings[row.fuel] = { fuelCode: row.fuel, value: row.val }
                }
                const remittance = { CASH: cNum, MOMO: mNum, VOUCHER: kNum, CREDIT: crNum }
                await onConfirm(closings, remittance, notes.trim() || undefined)
                setBusy(false)
              }}
              disabled={!allValid}
              tone="amber"
              style={{ marginTop: 16 }}
            />
            <PrimaryButton title="Cancel" onPress={onClose} style={{ marginTop: 8, marginBottom: 12 }} />
          </ScrollView>
        </Card>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText: { color: colors.textDim, fontSize: 12 },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting: { color: colors.text, fontSize: 20, fontWeight: '900' },
  subGreeting: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
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
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  listFuel: { color: colors.text, fontWeight: '800', fontSize: 13, width: 42 },
  listLitres: { color: colors.textDim, fontSize: 12, flex: 1, textAlign: 'left' },
  listPayment: { color: colors.violet, fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.panel2, borderRadius: 4 },
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
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  amountPreview: { color: colors.emerald, fontSize: 16, fontWeight: '900' },
  warningBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel2, borderRadius: 10, padding: 12, marginTop: 12 },
})