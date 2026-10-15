import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native'
import {
  AlertTriangle,
  Fuel,
  Check,
  RotateCcw,
  X,
  Calculator,
  Banknote,
  DollarSign,
  Info,
} from 'lucide-react-native'
import { colors } from '../theme'
import { Card, PrimaryButton, StyledTextInput } from '../components/ui'
import type { Shift, PaymentsBreakdown } from '../core/domain/types'
import {
  PRODUCTION_PUMPS,
  PRODUCTION_STATION,
  type ProductionPumpConfig,
} from '../core/domain/config'
import { formatGHS, formatLitres, formatDateTime } from '../shared/currencyFormatter'

export interface CorrectRejectedShiftModalProps {
  visible: boolean
  shift: Shift | null
  pumps: ProductionPumpConfig[]
  fuelPrices: Record<string, number>
  onClose: () => void
  onResubmitted: (input: {
    shiftId: string
    pumpId: string
    openingReadings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>
    closingReadings: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }>
    remittance: { CASH: number; MOMO: number; VOUCHER: number; CREDIT: number }
    notes: string
  }) => Promise<void>
}

export const CorrectRejectedShiftModal: React.FC<CorrectRejectedShiftModalProps> = ({
  visible,
  shift,
  pumps,
  fuelPrices,
  onClose,
  onResubmitted,
}) => {
  const [selectedPumpId, setSelectedPumpId] = useState<string>('')
  const [selectedNozzleKeys, setSelectedNozzleKeys] = useState<string[]>([])
  const [openReadings, setOpenReadings] = useState<Record<string, string>>({})
  const [closeReadings, setCloseReadings] = useState<Record<string, string>>({})
  const [cash, setCash] = useState<string>('')
  const [momo, setMomo] = useState<string>('')
  const [card, setCard] = useState<string>('')
  const [credit, setCredit] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize or reset form when shift changes
  useEffect(() => {
    if (!shift) return

    const initialPumpId = shift.pumpId || (pumps[0]?.id ?? 'pump-1')
    setSelectedPumpId(initialPumpId)

    // Pre-fill opening readings
    const initOpen: Record<string, string> = {}
    const initClose: Record<string, string> = {}
    const initSelectedKeys: string[] = []

    if (shift.openingReadings) {
      Object.entries(shift.openingReadings).forEach(([k, r]) => {
        initOpen[k] = r.value !== undefined ? String(r.value) : ''
        initSelectedKeys.push(k)
      })
    }

    if (shift.closingReadings) {
      Object.entries(shift.closingReadings).forEach(([k, r]) => {
        initClose[k] = r.value !== undefined ? String(r.value) : ''
      })
    }

    setOpenReadings(initOpen)
    setCloseReadings(initClose)
    setSelectedNozzleKeys(initSelectedKeys.length > 0 ? initSelectedKeys : [])

    // Pre-fill remittance
    setCash(shift.payments?.CASH ? String(shift.payments.CASH) : '')
    setMomo(shift.payments?.MOMO ? String(shift.payments.MOMO) : '')
    setCard(shift.payments?.VOUCHER ? String(shift.payments.VOUCHER) : '')
    setCredit(shift.payments?.CREDIT ? String(shift.payments.CREDIT) : '')
    setNotes('')
    setError(null)
  }, [shift, pumps])

  // Current selected pump config
  const currentPump = useMemo(() => {
    return pumps.find(p => p.id === selectedPumpId) || PRODUCTION_PUMPS.find(p => p.id === selectedPumpId) || pumps[0]
  }, [pumps, selectedPumpId])

  // Available nozzles for this pump
  const pumpNozzles = useMemo(() => {
    if (!currentPump) return []
    if (currentPump.nozzles && currentPump.nozzles.length > 0) {
      return currentPump.nozzles.map((n, idx) => ({
        key: `nozzle_${n.nozzleIndex || idx + 1}`,
        id: n.id,
        nozzleIndex: n.nozzleIndex || idx + 1,
        name: n.name || `Nozzle ${n.nozzleIndex || idx + 1}`,
        fuelCode: n.fuelCode,
      }))
    }
    // Fallback based on fuels
    return (currentPump.fuels || ['PMS', 'AGO']).map((f, idx) => ({
      key: `nozzle_${idx + 1}`,
      id: `${currentPump.id}-n${idx + 1}`,
      nozzleIndex: idx + 1,
      name: `${currentPump.name} - Side ${idx + 1} (${f})`,
      fuelCode: f,
    }))
  }, [currentPump])

  // Ensure selected nozzle keys correspond to nozzles on current pump
  useEffect(() => {
    if (pumpNozzles.length > 0 && selectedNozzleKeys.length === 0) {
      setSelectedNozzleKeys(pumpNozzles.map(n => n.key))
    }
  }, [pumpNozzles, selectedNozzleKeys.length])

  const toggleNozzleKey = (key: string) => {
    setSelectedNozzleKeys(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev // Keep at least one nozzle
        return prev.filter(k => k !== key)
      }
      return [...prev, key]
    })
  }

  // Active nozzles being reconciled
  const activeNozzles = useMemo(() => {
    return pumpNozzles.filter(n => selectedNozzleKeys.includes(n.key))
  }, [pumpNozzles, selectedNozzleKeys])

  // Compute live sales and validation
  let totalLitres = 0
  let totalExpectedSales = 0
  let allReadingsValid = activeNozzles.length > 0

  const nozzleAuditRows = activeNozzles.map(noz => {
    const rawOpen = openReadings[noz.key] ?? ''
    const rawClose = closeReadings[noz.key] ?? ''
    const openVal = parseFloat(rawOpen.replace(/,/g, '')) || 0
    const closeVal = parseFloat(rawClose.replace(/,/g, '')) || 0

    const unitPrice =
      fuelPrices[noz.fuelCode] ??
      PRODUCTION_STATION.fuelPrices[noz.fuelCode as keyof typeof PRODUCTION_STATION.fuelPrices] ??
      14.80

    const hasOpen = rawOpen.trim().length > 0
    const hasClose = rawClose.trim().length > 0
    const isValid = hasOpen && hasClose && closeVal >= openVal

    if (!isValid) allReadingsValid = false

    const litres = isValid ? Math.round((closeVal - openVal) * 100) / 100 : 0
    const amount = Math.round(litres * unitPrice * 100) / 100

    if (isValid) {
      totalLitres += litres
      totalExpectedSales += amount
    }

    return {
      ...noz,
      rawOpen,
      rawClose,
      openVal,
      closeVal,
      unitPrice,
      litres,
      amount,
      isValid,
      hasOpen,
      hasClose,
    }
  })

  totalLitres = Math.round(totalLitres * 100) / 100
  totalExpectedSales = Math.round(totalExpectedSales * 100) / 100

  // Payment Remittance
  const cNum = parseFloat(cash.replace(/,/g, '')) || 0
  const mNum = parseFloat(momo.replace(/,/g, '')) || 0
  const kNum = parseFloat(card.replace(/,/g, '')) || 0
  const crNum = parseFloat(credit.replace(/,/g, '')) || 0
  const totalRemitted = Math.round((cNum + mNum + kNum + crNum) * 100) / 100
  const variance = Math.round((totalRemitted - totalExpectedSales) * 100) / 100

  const canSubmit = allReadingsValid && !busy

  const handleResubmit = async () => {
    if (!shift) return
    if (!canSubmit) {
      Alert.alert('Incomplete Figures', 'Please ensure all selected nozzles have valid opening and closing readings where closing is greater than or equal to opening.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const formattedOpening: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }> = {}
      const formattedClosing: Record<string, { fuelCode: string; value: number; nozzleIndex?: number; nozzleLabel?: string }> = {}

      nozzleAuditRows.forEach(noz => {
        formattedOpening[noz.key] = {
          fuelCode: noz.fuelCode,
          value: noz.openVal,
          nozzleIndex: noz.nozzleIndex,
          nozzleLabel: noz.name,
        }
        formattedClosing[noz.key] = {
          fuelCode: noz.fuelCode,
          value: noz.closeVal,
          nozzleIndex: noz.nozzleIndex,
          nozzleLabel: noz.name,
        }
      })

      await onResubmitted({
        shiftId: shift.id,
        pumpId: selectedPumpId,
        openingReadings: formattedOpening,
        closingReadings: formattedClosing,
        remittance: { CASH: cNum, MOMO: mNum, VOUCHER: kNum, CREDIT: crNum },
        notes: notes.trim(),
      })

      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to resubmit shift. Please check your entries.')
    } finally {
      setBusy(false)
    }
  }

  if (!visible || !shift) return null

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Modal Header */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={18} color={colors.amber} />
                  <Text style={styles.title}>Correct & Resubmit Shift</Text>
                </View>
                <Text style={styles.subtitle}>
                  {shift.number} · {shift.stationName || 'Forecourt'}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
                <X size={18} color={colors.textDim} />
              </Pressable>
            </View>

            {/* Manager Rejection Feedback Banner */}
            <View style={styles.rejectionBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <AlertTriangle size={15} color={colors.rose} />
                <Text style={styles.rejectionHeaderTitle}>MANAGER REJECTION FEEDBACK</Text>
              </View>
              <Text style={styles.rejectionBody}>
                {shift.reviewNotes || 'Entries were rejected by the manager. Please recheck pump, nozzles, meter readings, and cash breakdown.'}
              </Text>
              {shift.reviewedBy && (
                <Text style={styles.reviewedByText}>
                  Reviewed by {shift.reviewedBy} {shift.reviewedAt ? `· ${formatDateTime(shift.reviewedAt)}` : ''}
                </Text>
              )}
            </View>

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Step 1: Select / Confirm Pump */}
            <Text style={styles.stepTitle}>1. CONFIRM OR SWITCH DISPENSER (PUMP)</Text>
            <View style={styles.chipsRow}>
              {pumps.map(p => {
                const isSelected = selectedPumpId === p.id
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setSelectedPumpId(p.id)
                      setSelectedNozzleKeys([])
                    }}
                    style={[
                      styles.pumpChip,
                      isSelected ? styles.pumpChipActive : styles.pumpChipInactive,
                    ]}
                  >
                    <Fuel size={14} color={isSelected ? colors.emerald : colors.textDim} />
                    <Text style={[styles.chipText, { color: isSelected ? colors.text : colors.textDim }]}>
                      {p.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {/* Step 2: Select Operating Nozzles */}
            <Text style={[styles.stepTitle, { marginTop: 14 }]}>2. SELECT OPERATING NOZZLE(S)</Text>
            <View style={styles.chipsRow}>
              {pumpNozzles.map(noz => {
                const isSelected = selectedNozzleKeys.includes(noz.key)
                return (
                  <Pressable
                    key={noz.key}
                    onPress={() => toggleNozzleKey(noz.key)}
                    style={[
                      styles.nozzleChip,
                      isSelected ? styles.nozzleChipActive : styles.nozzleChipInactive,
                    ]}
                  >
                    <View
                      style={[
                        styles.fuelDot,
                        {
                          backgroundColor:
                            noz.fuelCode === 'PMS'
                              ? '#22c55e'
                              : noz.fuelCode === 'AGO'
                              ? '#3b82f6'
                              : '#eab308',
                        },
                      ]}
                    />
                    <Text style={[styles.chipText, { color: isSelected ? colors.text : colors.textDim }]}>
                      {noz.name}
                    </Text>
                    {isSelected && <Check size={12} color={colors.emerald} style={{ marginLeft: 3 }} />}
                  </Pressable>
                )
              })}
            </View>

            {/* Step 3: Enter Corrected Meter Readings */}
            <Text style={[styles.stepTitle, { marginTop: 16 }]}>
              3. ENTER CORRECTED OPENING & CLOSING METERS
            </Text>
            <View style={{ gap: 10, marginTop: 6 }}>
              {nozzleAuditRows.map(noz => (
                <View key={noz.key} style={styles.meterCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.meterNozzleLabel}>{noz.name.toUpperCase()}</Text>
                    <Text style={styles.meterPriceTag}>
                      {formatGHS(noz.unitPrice)}/L
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputSubLabel}>Opening Meter</Text>
                      <StyledTextInput
                        value={openReadings[noz.key] ?? ''}
                        onChangeText={t => setOpenReadings(prev => ({ ...prev, [noz.key]: t.replace(/[^0-9.]/g, '') }))}
                        placeholder="0.00"
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputSubLabel}>Closing Meter</Text>
                      <StyledTextInput
                        value={closeReadings[noz.key] ?? ''}
                        onChangeText={t => setCloseReadings(prev => ({ ...prev, [noz.key]: t.replace(/[^0-9.]/g, '') }))}
                        placeholder="0.00"
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>

                  {/* Calculations per nozzle */}
                  <View style={styles.meterSummaryRow}>
                    <Text style={{ fontSize: 11, color: colors.textDim }}>
                      Sold:{' '}
                      <Text style={{ color: colors.emerald, fontWeight: '800' }}>
                        {noz.isValid ? `${noz.litres.toFixed(2)} L` : '—'}
                      </Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textDim }}>
                      Sales:{' '}
                      <Text style={{ color: colors.text, fontWeight: '800' }}>
                        {noz.isValid ? formatGHS(noz.amount) : '—'}
                      </Text>
                    </Text>
                  </View>

                  {noz.hasOpen && noz.hasClose && noz.closeVal < noz.openVal && (
                    <Text style={styles.rowError}>
                      Closing ({noz.closeVal}) cannot be less than opening ({noz.openVal}).
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* Total Metered Sales Summary */}
            <View style={styles.meterTotalsBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.totalsLabel}>Total Fuel Dispensed:</Text>
                <Text style={styles.totalsValue}>{formatLitres(totalLitres)} L</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={[styles.totalsLabel, { fontWeight: '800', color: colors.text }]}>
                  Expected Shift Revenue:
                </Text>
                <Text style={[styles.totalsValue, { color: colors.emerald, fontSize: 14, fontWeight: '900' }]}>
                  {formatGHS(totalExpectedSales)}
                </Text>
              </View>
            </View>

            {/* Step 4: Corrected Payment Remittance */}
            <Text style={[styles.stepTitle, { marginTop: 16 }]}>4. ENTER CORRECTED PAYMENT REMITTANCE</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              <View>
                <Text style={styles.inputSubLabel}>Cash Handed Over (GHS)</Text>
                <StyledTextInput
                  value={cash}
                  onChangeText={t => setCash(t.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  keyboardType="number-pad"
                />
              </View>

              <View>
                <Text style={styles.inputSubLabel}>Mobile Money / MoMo (GHS)</Text>
                <StyledTextInput
                  value={momo}
                  onChangeText={t => setMomo(t.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  keyboardType="number-pad"
                />
              </View>

              <View>
                <Text style={styles.inputSubLabel}>POS / Card / Voucher (GHS)</Text>
                <StyledTextInput
                  value={card}
                  onChangeText={t => setCard(t.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  keyboardType="number-pad"
                />
              </View>

              <View>
                <Text style={styles.inputSubLabel}>Credit Sales / Invoices (GHS)</Text>
                <StyledTextInput
                  value={credit}
                  onChangeText={t => setCredit(t.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Live Variance Reconciliation Box */}
            <View style={styles.reconcileBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.reconcileLabel}>Total Remitted:</Text>
                <Text style={styles.reconcileValue}>{formatGHS(totalRemitted)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.reconcileLabel}>Expected Revenue:</Text>
                <Text style={styles.reconcileValue}>{formatGHS(totalExpectedSales)}</Text>
              </View>
              <View style={[styles.reconcileDivider, { marginVertical: 6 }]} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.reconcileLabel, { fontWeight: '800', color: colors.text }]}>Variance Status:</Text>
                <Text
                  style={{
                    fontWeight: '900',
                    fontSize: 13,
                    color: variance === 0 ? colors.emerald : variance > 0 ? colors.blue : colors.rose,
                  }}
                >
                  {variance === 0
                    ? '✓ Balanced (GHS 0.00)'
                    : variance > 0
                    ? `+${formatGHS(variance)} Overage`
                    : `${formatGHS(variance)} Shortage`}
                </Text>
              </View>
            </View>

            {/* Step 5: Attendant Correction Note */}
            <Text style={[styles.stepTitle, { marginTop: 16 }]}>5. CORRECTION NOTE FOR SUPERVISOR</Text>
            <StyledTextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Recounted cash drawer, corrected opening meter typo"
              style={{ marginTop: 6 }}
            />

            {/* Submit Action Buttons */}
            <PrimaryButton
              title={busy ? 'Resubmitting to Manager…' : 'Confirm & Resubmit Shift to Manager'}
              onPress={handleResubmit}
              disabled={!canSubmit}
              tone="emerald"
              style={{ marginTop: 18 }}
            />

            <Pressable onPress={onClose} style={styles.cancelActionBtn}>
              <Text style={styles.cancelActionText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.panel,
  },
  rejectionBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  rejectionHeaderTitle: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  rejectionBody: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  reviewedByText: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: '700',
  },
  stepTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  pumpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  pumpChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: colors.emerald,
  },
  pumpChipInactive: {
    backgroundColor: colors.panel2,
    borderColor: colors.border,
  },
  nozzleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  nozzleChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: colors.emerald,
  },
  nozzleChipInactive: {
    backgroundColor: colors.panel2,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fuelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meterCard: {
    backgroundColor: colors.panel2,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meterNozzleLabel: {
    color: colors.emerald,
    fontSize: 12,
    fontWeight: '900',
  },
  meterPriceTag: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  inputSubLabel: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  meterSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowError: {
    color: colors.rose,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  meterTotalsBox: {
    backgroundColor: colors.panel,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalsLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  totalsValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  reconcileBox: {
    backgroundColor: colors.panel,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reconcileLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  reconcileValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  reconcileDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  cancelActionBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },
  cancelActionText: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
})
