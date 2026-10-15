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
import { Fuel, Banknote, LogOut, RefreshCw, QrCode, Droplets, DollarSign, Zap, Calculator, Lock, AlertTriangle, CheckCircle, Check, Tag } from 'lucide-react-native'
import { colors } from '../theme'
import { Card, PrimaryButton, StyledTextInput } from '../components/ui'
import { QrSyncSheet } from '../components/QrSyncSheet'
import { TankReadingsSheet } from './supervisor/TankReadingsSheet'
import { shiftService, syncNow } from '../core/services/shiftService'
import type { Attendant, Shift } from '../core/domain/types'
import type { MobileSession } from './LoginScreen'
import { formatGHS, formatLitres, formatDateTime } from '../shared/currencyFormatter'
import { PRODUCTION_PUMPS, PRODUCTION_STATION, getStationPumps, registerStationPumps, deriveNozzlesForPump, type ProductionPumpConfig, type PumpNozzleConfig } from '../core/domain/config'
import { mobileProductService } from '../core/services/productService'
import { cloudGetPumps, pumpNameFor, cloudGetShifts } from '../core/infra/cloudApi'
import { CorrectRejectedShiftModal } from './CorrectRejectedShiftModal'

export const AttendantDashboard: React.FC<{
  session: MobileSession
  onSignOut: () => void
}> = ({ session, onSignOut }) => {
  const [shift, setShift] = useState<Shift | null>(null)
  const [rejectedShift, setRejectedShift] = useState<Shift | null>(null)
  const [correctModal, setCorrectModal] = useState(false)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)
  const [stationPumps, setStationPumps] = useState<ProductionPumpConfig[]>(() => getStationPumps(session.stationId))
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>(PRODUCTION_STATION.fuelPrices)
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
        const { listShifts, saveShift, pendingSyncCount } = await import('../core/infra/repositories')
        const [pending, prices, pumpsRes, cloudRes] = await Promise.all([
          pendingSyncCount(),
          mobileProductService.getFuelPrices().catch(() => PRODUCTION_STATION.fuelPrices),
          cloudGetPumps(session.stationId, session.companyId).catch(() => null),
          cloudGetShifts(session.stationId).catch(() => null),
        ])

        if (cloudRes && cloudRes.ok && cloudRes.shifts.length > 0) {
          for (const cs of cloudRes.shifts) {
            await saveShift(cs)
          }
        }

        const allShifts = await listShifts()
        const curShift = allShifts.find(s => s.attendantId === session.userId && s.status === 'OPEN') || null
        const rejShift = allShifts.find(s => s.attendantId === session.userId && s.status === 'REJECTED') || null

        if (active) {
          setAttendantId(session.userId)
          setShift(curShift)
          setRejectedShift(rejShift)
          if (!curShift && !rejShift) {
            setOpenModal(true)
          }
          setPendingCount(pending)
          if (prices) setFuelPrices(prices)
          if (pumpsRes && pumpsRes.ok && pumpsRes.pumps.length > 0) {
            const mapped: ProductionPumpConfig[] = pumpsRes.pumps.map(p => ({
              id: p.id,
              name: p.name,
              fuels: p.fuels as any,
              nozzles: p.nozzles as any,
            }))
            registerStationPumps(session.stationId, mapped)
            setStationPumps(mapped)
          }
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void init()
    return () => { active = false }
  }, [session.userId, session.stationId, session.companyId])

  const refresh = useCallback(async () => {
    if (!attendantId) return
    const { listShifts, saveShift, pendingSyncCount } = await import('../core/infra/repositories')
    const [pending, pumpsRes, cloudRes] = await Promise.all([
      pendingSyncCount(),
      cloudGetPumps(session.stationId, session.companyId).catch(() => null),
      cloudGetShifts(session.stationId).catch(() => null),
    ])

    if (cloudRes && cloudRes.ok && cloudRes.shifts.length > 0) {
      for (const cs of cloudRes.shifts) {
        await saveShift(cs)
      }
    }

    const allShifts = await listShifts()
    const active = allShifts.find(s => s.attendantId === attendantId && s.status === 'OPEN') || null
    const rejShift = allShifts.find(s => s.attendantId === attendantId && s.status === 'REJECTED') || null

    setShift(active)
    setRejectedShift(rejShift)
    setPendingCount(pending)
    if (pumpsRes && pumpsRes.ok && pumpsRes.pumps.length > 0) {
      const mapped: ProductionPumpConfig[] = pumpsRes.pumps.map(p => ({
        id: p.id,
        name: p.name,
        fuels: p.fuels as any,
        nozzles: p.nozzles as any,
      }))
      registerStationPumps(session.stationId, mapped)
      setStationPumps(mapped)
    }
    setLoading(false)
  }, [attendantId, session.stationId, session.companyId])

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
            <View style={styles.tenantTag}>
              <Text style={styles.tenantOmc} numberOfLines={1}>
                {session.companyName || session.companyShortCode || 'OMC'}
              </Text>
              <Text style={styles.tenantSep}>·</Text>
              <Text style={styles.tenantStation} numberOfLines={1}>
                {session.stationName || 'Forecourt Station'}
              </Text>
            </View>
            <Text style={styles.greeting} numberOfLines={1}>Hello, {session.fullName.split(' ')[0]} 👋</Text>
            <Text style={styles.subGreeting} numberOfLines={1}>{session.employeeCode} · Attendant</Text>
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
                await refresh()
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

        {/* Success Banner */}
        {successBanner && (
          <View style={styles.successBanner}>
            <CheckCircle size={15} color={colors.emerald} />
            <Text style={styles.successBannerText}>{successBanner}</Text>
          </View>
        )}

        {/* Manager Rejection Feedback Alert Card */}
        {rejectedShift && (
          <Card style={styles.rejectionAlertCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={16} color={colors.rose} />
                <Text style={styles.rejectionAlertTitle}>SHIFT REJECTED BY MANAGER</Text>
              </View>
              <View style={styles.rejectionBadge}>
                <Text style={styles.rejectionBadgeText}>{rejectedShift.number}</Text>
              </View>
            </View>

            <Text style={styles.rejectionAlertMsg}>
              {rejectedShift.reviewNotes || 'The manager reviewed and rejected your sales entries for this shift. Please start the closing sales process again, pick your pump and nozzle(s), and enter the right figures.'}
            </Text>

            {rejectedShift.reviewedBy && (
              <Text style={styles.rejectionAlertMeta}>
                Reviewed by {rejectedShift.reviewedBy} {rejectedShift.reviewedAt ? `· ${formatDateTime(rejectedShift.reviewedAt)}` : ''}
              </Text>
            )}

            <View style={styles.rejectionActionRow}>
              <PrimaryButton
                title="🔄 Correct Entries & Resubmit Closing Sales"
                onPress={() => setCorrectModal(true)}
                tone="amber"
              />
            </View>
          </Card>
        )}

        {/* Forecourt Attendant Mini Dashboard */}
        <Card style={styles.miniDashboardCard}>
          {/* Live Price Board Ticker */}
          <View style={styles.priceBoardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Zap size={13} color={colors.amber} />
              <Text style={styles.priceBoardTitle}>FORECOURT LIVE PRICE BOARD</Text>
            </View>
            <View style={styles.priceBoardLiveTag}>
              <View style={styles.livePulse} />
              <Text style={styles.priceBoardLiveText}>ACTIVE RATES</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.priceBoardScroll}
          >
            {Object.entries(fuelPrices).map(([code, price]) => {
              const dotColor =
                code === 'PMS'
                  ? '#22c55e'
                  : code === 'AGO'
                  ? '#3b82f6'
                  : code === 'DPK'
                  ? '#eab308'
                  : '#f97316'
              return (
                <View key={code} style={styles.pricePill}>
                  <View style={[styles.priceDot, { backgroundColor: dotColor }]} />
                  <Text style={styles.priceFuelCode}>{code}</Text>
                  <Text style={styles.priceRate}>
                    {formatGHS(price)}
                    <Text style={{ fontSize: 9, color: colors.textDim, fontWeight: '500' }}>/L</Text>
                  </Text>
                </View>
              )
            })}
          </ScrollView>

          {/* Active Forecourt Assignment & Nozzle Status */}
          <View style={styles.assignmentBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Fuel size={15} color={shift ? colors.emerald : colors.textDim} />
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>
                  {shift ? pumpNameFor(shift.pumpId) : 'No Active Dispenser'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: shift ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.12)' },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: shift ? colors.emerald : colors.textDim }]}>
                  {shift ? '● ON DUTY' : '○ STANDBY'}
                </Text>
              </View>
            </View>

            {shift?.openingReadings && Object.keys(shift.openingReadings).length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: colors.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>
                  Assigned Operating Nozzles:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Object.values(shift.openingReadings).map((rd, i) => (
                    <View key={i} style={styles.activeNozzleBadge}>
                      <View
                        style={[
                          styles.priceDot,
                          {
                            backgroundColor:
                              rd.fuelCode === 'PMS'
                                ? '#22c55e'
                                : rd.fuelCode === 'AGO'
                                ? '#3b82f6'
                                : '#eab308',
                          },
                        ]}
                      />
                      <Text style={styles.activeNozzleText}>
                        {rd.nozzleLabel || `Nozzle ${rd.nozzleIndex || i + 1} (${rd.fuelCode})`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 4 }}>
                Ready to open shift. Select your assigned dispenser & nozzle(s) below.
              </Text>
            )}

            {/* Quick KPI Bar inside Mini Dashboard */}
            <View style={styles.miniKpiRow}>
              <View style={styles.miniKpiItem}>
                <Text style={styles.miniKpiLabel}>Shift Revenue</Text>
                <Text style={styles.miniKpiValue}>{shift ? formatGHS(shift.salesTotal) : 'GHS 0.00'}</Text>
              </View>
              <View style={styles.miniKpiDivider} />
              <View style={styles.miniKpiItem}>
                <Text style={styles.miniKpiLabel}>Fuel Dispensed</Text>
                <Text style={styles.miniKpiValue}>
                  {shift ? `${Math.round(shift.sales.reduce((a, s) => a + s.litres, 0))} L` : '0 L'}
                </Text>
              </View>
              <View style={styles.miniKpiDivider} />
              <View style={styles.miniKpiItem}>
                <Text style={styles.miniKpiLabel}>Sales Count</Text>
                <Text style={styles.miniKpiValue}>{shift ? shift.sales.length : 0}</Text>
              </View>
            </View>
          </View>
        </Card>

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
              ? `${pumpNameFor(shift.pumpId)} · opened ${formatDateTime(shift.openedAt)}`
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
              <PrimaryButton title="Open Shift & Pick Nozzles" onPress={() => setOpenModal(true)} tone="emerald" />
            ) : (
              <>
                <PrimaryButton
                  title="🔒 End Shift & Reconcile Nozzles"
                  onPress={() => setCloseModal(true)}
                  tone="amber"
                />
                <View style={{ marginTop: 8 }}>
                  <PrimaryButton
                    title="Add Expense"
                    onPress={() => setExpenseModal(true)}
                    tone="violet"
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
        pumps={stationPumps}
        onClose={() => setOpenModal(false)}
        onConfirm={async (pumpId, openingReadings) => {
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
        fuelPrices={fuelPrices}
        allowedFuels={
          shift?.openingReadings && Object.keys(shift.openingReadings).length > 0
            ? Object.values(shift.openingReadings).map(r => r.fuelCode)
            : (shift ? (stationPumps.find(p => p.id === shift.pumpId)?.fuels || PRODUCTION_PUMPS.find(p => p.id === shift.pumpId)?.fuels) : undefined)
        }
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
        fuelPrices={fuelPrices}
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

      <CorrectRejectedShiftModal
        visible={correctModal}
        shift={rejectedShift}
        pumps={stationPumps}
        fuelPrices={fuelPrices}
        onClose={() => setCorrectModal(false)}
        onResubmitted={async (resubmitData) => {
          try {
            await shiftService.resubmitShift({
              shiftId: resubmitData.shiftId,
              pumpId: resubmitData.pumpId,
              openingReadings: resubmitData.openingReadings,
              closingReadings: resubmitData.closingReadings,
              remittance: resubmitData.remittance,
              notes: resubmitData.notes,
            })
            setSuccessBanner(`Shift ${rejectedShift?.number ?? ''} corrected & resubmitted to manager for review.`)
            setTimeout(() => setSuccessBanner(null), 8000)
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
  pumps?: ProductionPumpConfig[]
  onClose: () => void
  onConfirm: (
    pumpId: string,
    openingReadings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>,
  ) => Promise<void>
}> = ({ visible, pumps, onClose, onConfirm }) => {
  const availablePumps = pumps && pumps.length > 0 ? pumps : PRODUCTION_PUMPS
  const [pumpId, setPumpId] = useState(() => availablePumps[0]?.id || 'pump-1')
  const [readings, setReadings] = useState<Record<number, string>>({})
  const [autoFilled, setAutoFilled] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (availablePumps.length > 0 && !availablePumps.some(p => p.id === pumpId)) {
      setPumpId(availablePumps[0].id)
    }
  }, [availablePumps, pumpId])

  const selectedPump = availablePumps.find(p => p.id === pumpId) || availablePumps[0] || { id: 'pump-1', name: 'Pump 1', fuels: ['PMS'] }
  const derivedNozzles = React.useMemo(() => deriveNozzlesForPump(selectedPump), [selectedPump])

  const [selectedNozzleIndices, setSelectedNozzleIndices] = useState<number[]>([])

  // Reset selected nozzles when pump changes
  useEffect(() => {
    setSelectedNozzleIndices(derivedNozzles.map(n => n.nozzleIndex))
  }, [pumpId, derivedNozzles])

  const toggleNozzleIndex = (idx: number) => {
    setSelectedNozzleIndices(prev => {
      if (prev.includes(idx)) {
        if (prev.length === 1) return prev // keep at least 1 nozzle selected
        return prev.filter(x => x !== idx)
      }
      return [...prev, idx].sort((a, b) => a - b)
    })
  }

  useEffect(() => {
    let active = true
    async function loadLastClosed() {
      try {
        const { listShifts } = await import('../core/infra/repositories')
        const all = await listShifts()
        const closed = all
          .filter(
            s =>
              s.pumpId === pumpId &&
              s.closingReadings &&
              Object.keys(s.closingReadings).length > 0 &&
              (s.status === 'CLOSED' || s.status === 'APPROVED' || s.status === 'REJECTED'),
          )
          .sort(
            (a, b) =>
              new Date(b.closedAt || b.openedAt).getTime() - new Date(a.closedAt || a.openedAt).getTime(),
          )[0]

        if (active) {
          const init: Record<number, string> = {}
          let filled = false
          const closedReadings = closed?.closingReadings ? Object.values(closed.closingReadings) : []
          derivedNozzles.forEach((noz) => {
            const matched = closedReadings.find((cr: any) => cr.nozzleIndex === noz.nozzleIndex) || closedReadings[noz.nozzleIndex - 1]
            if (matched && typeof matched.value === 'number') {
              init[noz.nozzleIndex] = String(matched.value)
              filled = true
            } else if (closed?.closingReadings?.[noz.fuelCode]?.value) {
              init[noz.nozzleIndex] = String(closed.closingReadings[noz.fuelCode].value)
              filled = true
            } else {
              init[noz.nozzleIndex] = ''
            }
          })
          setReadings(init)
          setAutoFilled(filled ? closed.number : null)
        }
      } catch {
        if (active) {
          const init: Record<number, string> = {}
          derivedNozzles.forEach((noz) => { init[noz.nozzleIndex] = '' })
          setReadings(init)
          setAutoFilled(null)
        }
      }
    }
    if (visible) {
      void loadLastClosed()
    }
    return () => {
      active = false
    }
  }, [pumpId, visible, derivedNozzles])

  const activeNozzles = derivedNozzles.filter(n => selectedNozzleIndices.includes(n.nozzleIndex))
  const allFilled = activeNozzles.length > 0 && activeNozzles.every((noz) => {
    const raw = readings[noz.nozzleIndex]
    const val = parseFloat(raw || '')
    return raw && raw.trim().length > 0 && Number.isFinite(val) && val >= 0
  })

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={[styles.modalCard, { maxHeight: '90%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Open Shift & Assign Dispenser</Text>
            <Text style={styles.modalSub}>Select your forecourt dispenser and operating nozzle(s)</Text>

            {/* Pump Selector */}
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>1. SELECT DISPENSER PUMP</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {availablePumps.map(p => (
                <Pressable
                  key={p.id}
                  onPress={() => setPumpId(p.id)}
                  style={[styles.pumpChip, { borderColor: pumpId === p.id ? colors.emerald : colors.border }]}
                >
                  <Text
                    style={{
                      color: pumpId === p.id ? colors.emerald : colors.textDim,
                      fontWeight: '800',
                      fontSize: 13,
                    }}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Nozzle Selector */}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
              2. SELECT OPERATING NOZZLE(S)
            </Text>
            <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 2, marginBottom: 6 }}>
              Tap to toggle nozzle(s) if sharing this dispenser with another attendant:
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {derivedNozzles.map(noz => {
                const isSelected = selectedNozzleIndices.includes(noz.nozzleIndex)
                return (
                  <Pressable
                    key={noz.id}
                    onPress={() => toggleNozzleIndex(noz.nozzleIndex)}
                    style={[
                      styles.nozzleSelectChip,
                      isSelected ? styles.nozzleSelectChipActive : styles.nozzleSelectChipInactive,
                    ]}
                  >
                    <View
                      style={[
                        styles.nozzleDot,
                        { backgroundColor: noz.fuelCode === 'PMS' ? '#22c55e' : noz.fuelCode === 'AGO' ? '#3b82f6' : '#eab308' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.nozzleSelectChipText,
                        { color: isSelected ? colors.text : colors.textDim },
                      ]}
                    >
                      {noz.name}
                    </Text>
                    {isSelected && <Check size={12} color={colors.emerald} style={{ marginLeft: 3 }} />}
                  </Pressable>
                )
              })}
            </View>

            {autoFilled && (
              <View
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderColor: 'rgba(34, 197, 94, 0.3)',
                  borderWidth: 1,
                  borderRadius: 10,
                  padding: 8,
                  marginTop: 12,
                }}
              >
                <Text style={{ color: colors.emerald, fontSize: 11, fontWeight: '700' }}>
                  ✓ Opening stock auto-filled from closing readings of Shift {autoFilled}.
                </Text>
              </View>
            )}

            {/* Nozzles Opening Meter Inputs */}
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
              3. ENTER OPENING METER READING(S)
            </Text>
            <View style={{ marginTop: 6, gap: 10 }}>
              {activeNozzles.map(noz => {
                return (
                  <View key={`nozzle-${noz.nozzleIndex}`} style={{ backgroundColor: colors.panel2, borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: colors.emerald, fontWeight: '900', fontSize: 12, marginBottom: 4 }}>
                      {noz.name.toUpperCase()} OPENING METER
                    </Text>
                    <StyledTextInput
                      value={readings[noz.nozzleIndex] ?? ''}
                      onChangeText={t => setReadings(prev => ({ ...prev, [noz.nozzleIndex]: t.replace(/[^0-9.]/g, '') }))}
                      placeholder="Enter opening meter (e.g. 12500.00)"
                      keyboardType="number-pad"
                    />
                  </View>
                )
              })}
            </View>

            <PrimaryButton
              title={busy ? 'Starting Shift…' : `Confirm & Start Shift (${activeNozzles.length} Nozzle${activeNozzles.length > 1 ? 's' : ''})`}
              onPress={async () => {
                if (!allFilled) return
                setBusy(true)
                const out: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }> = {}
                activeNozzles.forEach((noz) => {
                  const key = `nozzle_${noz.nozzleIndex}`
                  out[key] = {
                    fuelCode: noz.fuelCode,
                    value: parseFloat(readings[noz.nozzleIndex]) || 0,
                    nozzleIndex: noz.nozzleIndex,
                    nozzleLabel: noz.name,
                  }
                })
                await onConfirm(pumpId, out)
                setBusy(false)
              }}
              disabled={!allFilled || busy}
              tone="emerald"
              style={{ marginTop: 18 }}
            />
            <PrimaryButton title="Cancel" onPress={onClose} tone="rose" style={{ marginTop: 8 }} />
          </ScrollView>
        </Card>
      </View>
    </Modal>
  )
}

const SaleModal: React.FC<{
  visible: boolean
  fuelPrices: Record<string, number>
  allowedFuels?: string[]
  onClose: () => void
  onSave: (fuel: string, litres: number, method: string) => Promise<void>
}> = ({ visible, fuelPrices, allowedFuels, onClose, onSave }) => {
  const fuelsToDisplay = React.useMemo(() => {
    if (allowedFuels && allowedFuels.length > 0) {
      return [...new Set(allowedFuels)]
    }
    return Object.keys(fuelPrices)
  }, [allowedFuels, fuelPrices])

  const [fuel, setFuel] = useState(() => fuelsToDisplay[0] || 'PMS')
  const [litres, setLitres] = useState('')
  const [method, setMethod] = useState('CASH')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (fuelsToDisplay.length > 0 && !fuelsToDisplay.includes(fuel)) {
      setFuel(fuelsToDisplay[0])
    }
  }, [fuelsToDisplay, fuel])

  const currentPrice = fuelPrices[fuel] ?? PRODUCTION_STATION.fuelPrices[fuel as keyof typeof PRODUCTION_STATION.fuelPrices] ?? 14.80

  const setAmountPreset = (ghsAmount: number) => {
    const l = Math.round((ghsAmount / currentPrice) * 100) / 100
    setLitres(String(l))
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBack}>
        <Card style={styles.modalCard}>
          <Text style={styles.modalTitle}>Record Fuel Dispensed</Text>
          <Text style={styles.modalSub}>Price: GHS {currentPrice.toFixed(2)} / Litre</Text>

          {/* Fuel selection */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {fuelsToDisplay.map(k => (
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
            <Text style={styles.amountPreview}>Total: {formatGHS(Number(litres || 0) * currentPrice)}</Text>
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
  fuelPrices: Record<string, number>
  onClose: () => void
  onConfirm: (
    closingReadings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>,
    remittance: { CASH: number; MOMO: number; VOUCHER: number; CREDIT: number },
    notes?: string,
  ) => Promise<void>
}> = ({ visible, shift, fuelPrices, onClose, onConfirm }) => {
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [cash, setCash] = useState('')
  const [momo, setMomo] = useState('')
  const [card, setCard] = useState('')
  const [credit, setCredit] = useState('')
  const [notes, setNotes] = useState('')

  const allShiftNozzles = React.useMemo(() => {
    if (!shift?.openingReadings) return []
    return Object.entries(shift.openingReadings).map(([key, o], idx) => {
      const nozzleIndex = o.nozzleIndex ?? (idx + 1)
      const label = o.nozzleLabel || `Side ${nozzleIndex} (${o.fuelCode})`
      return {
        key,
        fuelCode: o.fuelCode,
        opening: o.value,
        nozzleIndex,
        label,
      }
    })
  }, [shift?.openingReadings])

  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  useEffect(() => {
    if (allShiftNozzles.length > 0) {
      setSelectedKeys(allShiftNozzles.map(n => n.key))
    }
  }, [allShiftNozzles])

  const toggleNozzleKey = (key: string) => {
    setSelectedKeys(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev // keep at least 1
        return prev.filter(k => k !== key)
      }
      return [...prev, key]
    })
  }

  // Active nozzles being closed
  const activeClosingNozzles = allShiftNozzles.filter(n => selectedKeys.includes(n.key))

  // Per-nozzle calculations
  let totalLitres = 0
  let totalExpectedCash = 0
  let allValid = activeClosingNozzles.length > 0

  const nozzleRows = activeClosingNozzles.map(nz => {
    const opening = nz.opening
    const raw = values[nz.key] ?? ''
    const val = parseFloat(raw.replace(/,/g, '')) || 0
    const price = fuelPrices[nz.fuelCode] ?? PRODUCTION_STATION.fuelPrices[nz.fuelCode as keyof typeof PRODUCTION_STATION.fuelPrices] ?? 14.80
    const hasInput = raw.trim().length > 0
    const isValid = hasInput && val >= opening

    if (!isValid) allValid = false

    const litres = isValid ? Math.round((val - opening) * 100) / 100 : 0
    const amount = Math.round(litres * price * 100) / 100

    if (isValid) {
      totalLitres += litres
      totalExpectedCash += amount
    }

    return { ...nz, raw, val, price, litres, amount, isValid, hasInput }
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
              Verify your dispenser and nozzle assignment, then enter closing pump stock.
            </Text>

            {/* Pump and Nozzle Selection & Verification Box */}
            <View style={styles.dispenserSummaryBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Fuel size={16} color={colors.amber} />
                  <Text style={{ color: colors.text, fontWeight: '900', fontSize: 13 }}>
                    {pumpNameFor(shift?.pumpId || '')}
                  </Text>
                </View>
                <Text style={{ color: colors.emerald, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>
                  Shift {shift?.number || ''}
                </Text>
              </View>

              <Text style={{ color: colors.textDim, fontSize: 11, marginTop: 6, fontWeight: '700', textTransform: 'uppercase' }}>
                OPERATED NOZZLE(S) TO CLOSE:
              </Text>
              <Text style={{ color: colors.textFaint, fontSize: 10, marginTop: 1 }}>
                Tap to toggle nozzles if closing specific sides:
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {allShiftNozzles.map(nz => {
                  const isSelected = selectedKeys.includes(nz.key)
                  return (
                    <Pressable
                      key={nz.key}
                      onPress={() => toggleNozzleKey(nz.key)}
                      style={[
                        styles.nozzleSelectChip,
                        isSelected ? styles.nozzleSelectChipActive : styles.nozzleSelectChipInactive,
                      ]}
                    >
                      <View
                        style={[
                          styles.nozzleDot,
                          {
                            backgroundColor:
                              nz.fuelCode === 'PMS'
                                ? '#22c55e'
                                : nz.fuelCode === 'AGO'
                                ? '#3b82f6'
                                : '#eab308',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.nozzleSelectChipText,
                          { color: isSelected ? colors.text : colors.textDim },
                        ]}
                      >
                        {nz.label}
                      </Text>
                      {isSelected && <Check size={12} color={colors.emerald} style={{ marginLeft: 3 }} />}
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Nozzles Closing Meter Inputs */}
            <View style={{ marginTop: 12, gap: 10 }}>
              {nozzleRows.map(row => (
                <View key={row.key} style={{ backgroundColor: colors.panel2, borderRadius: 10, padding: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: colors.emerald, fontWeight: '900', fontSize: 13 }}>{row.label}</Text>
                    <Text style={{ color: colors.textDim, fontSize: 11 }}>
                      Opening: <Text style={{ color: colors.text, fontWeight: '700' }}>{row.opening.toFixed(2)}</Text> · Rate: GHS {row.price.toFixed(2)}/L
                    </Text>
                  </View>
                  <StyledTextInput
                    value={row.raw}
                    onChangeText={t => setValues(prev => ({ ...prev, [row.key]: t.replace(/[^0-9.]/g, '') }))}
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
              title={busy ? 'Locking…' : `Confirm Close & Submit (${activeClosingNozzles.length} Nozzle${activeClosingNozzles.length > 1 ? 's' : ''})`}
              onPress={async () => {
                setBusy(true)
                const closings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }> = {}
                for (const row of nozzleRows) {
                  closings[row.key] = {
                    fuelCode: row.fuelCode,
                    value: row.val,
                    nozzleIndex: row.nozzleIndex,
                    nozzleLabel: row.label,
                  }
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
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
  miniDashboardCard: { padding: 14, marginBottom: 14, borderColor: 'rgba(249, 115, 22, 0.3)', borderWidth: 1 },
  priceBoardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceBoardTitle: { color: colors.textDim, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  priceBoardLiveTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34, 197, 94, 0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  livePulse: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.emerald },
  priceBoardLiveText: { color: colors.emerald, fontSize: 9, fontWeight: '800' },
  priceBoardScroll: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  pricePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.panel2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  priceDot: { width: 6, height: 6, borderRadius: 3 },
  priceFuelCode: { color: colors.text, fontSize: 11, fontWeight: '900' },
  priceRate: { color: colors.emerald, fontSize: 11, fontWeight: '800' },
  assignmentBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  activeNozzleBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.panel2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  activeNozzleText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  miniKpiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.panel2, borderRadius: 10, padding: 10, marginTop: 10 },
  miniKpiItem: { flex: 1, alignItems: 'center' },
  miniKpiLabel: { color: colors.textFaint, fontSize: 9, textTransform: 'uppercase', fontWeight: '700' },
  miniKpiValue: { color: colors.text, fontSize: 12, fontWeight: '900', marginTop: 2 },
  miniKpiDivider: { width: 1, height: 20, backgroundColor: colors.border },
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
  dispenserSummaryBox: { backgroundColor: colors.panel2, borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: colors.border },
  nozzleSelectChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  nozzleSelectChipActive: { borderColor: colors.emerald, backgroundColor: 'rgba(34, 197, 94, 0.12)' },
  nozzleSelectChipInactive: { borderColor: colors.border, backgroundColor: colors.panel },
  nozzleSelectChipText: { fontSize: 11, fontWeight: '800' },
  nozzleDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  tenantTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tenantOmc: { color: colors.emerald, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  tenantSep: { color: colors.textDim, fontSize: 11 },
  tenantStation: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(34, 197, 94, 0.12)', borderColor: 'rgba(34, 197, 94, 0.3)', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  successBannerText: { color: colors.emerald, fontSize: 12, fontWeight: '700', flex: 1 },
  rejectionAlertCard: { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.35)', borderWidth: 1.5, padding: 14, marginBottom: 14 },
  rejectionAlertTitle: { color: colors.rose, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  rejectionBadge: { backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  rejectionBadgeText: { color: colors.rose, fontSize: 10, fontWeight: '800' },
  rejectionAlertMsg: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 4 },
  rejectionAlertMeta: { color: colors.textDim, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  rejectionActionRow: { marginTop: 12 },
})