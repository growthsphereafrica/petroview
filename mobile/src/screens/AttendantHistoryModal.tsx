/**
 * Attendant Shift & Submissions History Modal (Mobile)
 * Filterable by date, displays cumulative remittances (cash, MoMo, POS),
 * volume dispensed, and individual digital handover receipts.
 */

import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Clock,
  ChevronRight,
  X,
  Fuel,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Layers,
} from 'lucide-react-native'
import { colors } from '../theme'
import { Card, PrimaryButton } from '../components/ui'
import { formatGHS, formatLitres, formatDateTime } from '../shared/currencyFormatter'
import { formatShiftNozzles, extractShiftNozzlesList } from '../core/domain/config'
import type { Shift, ShiftStatus } from '../core/domain/types'

type DateFilter = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'ALL'

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'WEEK', label: '7 Days' },
  { key: 'MONTH', label: 'Month' },
  { key: 'ALL', label: 'All' },
]

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const today = new Date()
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

function isYesterday(iso: string): boolean {
  const d = new Date(iso)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
}

function isWithinDays(iso: string, days: number): boolean {
  const d = new Date(iso).getTime()
  const now = Date.now()
  return now - d <= days * 24 * 60 * 60 * 1000
}

function isSameMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export const AttendantHistoryModal: React.FC<{
  visible: boolean
  shifts: Shift[]
  attendantName: string
  onClose: () => void
  onCorrectShift?: (shift: Shift) => void
}> = ({ visible, shifts, attendantName, onClose, onCorrectShift }) => {
  const insets = useSafeAreaInsets()
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL')
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)

  const filteredShifts = useMemo(() => {
    return shifts.filter(s => {
      const date = s.closedAt || s.openedAt
      if (dateFilter === 'TODAY') return isToday(date)
      if (dateFilter === 'YESTERDAY') return isYesterday(date)
      if (dateFilter === 'WEEK') return isWithinDays(date, 7)
      if (dateFilter === 'MONTH') return isSameMonth(date)
      return true
    })
  }, [shifts, dateFilter])

  const aggregates = useMemo(() => {
    let totalExpected = 0
    let totalSubmitted = 0
    let totalCash = 0
    let totalMomo = 0
    let totalPos = 0
    let totalLitres = 0

    for (const s of filteredShifts) {
      totalExpected += s.salesTotal || 0
      totalSubmitted += s.actualTotal || 0
      totalCash += s.payments?.CASH || 0
      totalMomo += s.payments?.MOMO || 0
      totalPos += s.payments?.VOUCHER || 0

      if (Array.isArray(s.sales)) {
        for (const sale of s.sales) {
          totalLitres += Number(sale.litres || 0)
        }
      }
    }

    const netVariance = totalSubmitted - totalExpected

    return {
      count: filteredShifts.length,
      totalExpected,
      totalSubmitted,
      totalCash,
      totalMomo,
      totalPos,
      totalLitres,
      netVariance,
    }
  }, [filteredShifts])

  const statusTone = (status: ShiftStatus) => {
    switch (status) {
      case 'APPROVED':
        return colors.emerald
      case 'REJECTED':
        return colors.rose
      case 'CLOSED':
        return colors.amber
      case 'OPEN':
        return colors.blue
      default:
        return colors.textDim
    }
  }

  const statusLabel = (status: ShiftStatus) => {
    switch (status) {
      case 'APPROVED':
        return 'APPROVED'
      case 'REJECTED':
        return 'REJECTED'
      case 'CLOSED':
        return 'AWAITING REVIEW'
      case 'OPEN':
        return 'ACTIVE'
      default:
        return status
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.sheetCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Submissions History</Text>
              <Text style={styles.subtitle}>{attendantName} · {aggregates.count} shifts</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <X size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Date Filter Chips */}
          <View style={styles.chipsRow}>
            {DATE_FILTERS.map(f => {
              const active = dateFilter === f.key
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setDateFilter(f.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}>
            {/* Aggregate Period KPI Card */}
            <Card style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>TOTAL REMITTED ({DATE_FILTERS.find(d => d.key === dateFilter)?.label})</Text>
              <Text style={styles.kpiBigNumber}>{formatGHS(aggregates.totalSubmitted)}</Text>

              <View style={styles.kpiGrid}>
                <View style={styles.kpiGridItem}>
                  <Text style={styles.kpiSubLabel}>Cash Handed</Text>
                  <Text style={styles.kpiSubVal}>{formatGHS(aggregates.totalCash)}</Text>
                </View>
                <View style={styles.kpiGridItem}>
                  <Text style={styles.kpiSubLabel}>MoMo / POS</Text>
                  <Text style={[styles.kpiSubVal, { color: colors.blue }]}>
                    {formatGHS(aggregates.totalMomo + aggregates.totalPos)}
                  </Text>
                </View>
                <View style={styles.kpiGridItem}>
                  <Text style={styles.kpiSubLabel}>Pump Expected</Text>
                  <Text style={styles.kpiSubVal}>{formatGHS(aggregates.totalExpected)}</Text>
                </View>
                <View style={styles.kpiGridItem}>
                  <Text style={styles.kpiSubLabel}>Net Variance</Text>
                  <Text
                    style={[
                      styles.kpiSubVal,
                      {
                        color:
                          aggregates.netVariance === 0
                            ? colors.emerald
                            : aggregates.netVariance > 0
                            ? colors.blue
                            : colors.rose,
                      },
                    ]}
                  >
                    {aggregates.netVariance === 0
                      ? 'Balanced'
                      : formatGHS(aggregates.netVariance, { showSign: true })}
                  </Text>
                </View>
              </View>

              <View style={styles.volumeRow}>
                <Text style={{ color: colors.textDim, fontSize: 11 }}>Total Fuel Volume Dispensed:</Text>
                <Text style={{ color: colors.amber, fontWeight: '800', fontSize: 11 }}>
                  {formatLitres(aggregates.totalLitres)} Litres
                </Text>
              </View>
            </Card>

            {/* Shift List */}
            <Text style={styles.sectionTitle}>SHIFTS IN PERIOD ({filteredShifts.length})</Text>

            {filteredShifts.length === 0 ? (
              <View style={styles.emptyState}>
                <Layers size={32} color={colors.textFaint} />
                <Text style={styles.emptyText}>No shifts in this selected period.</Text>
              </View>
            ) : (
              filteredShifts.map(s => {
                const isRejected = s.status === 'REJECTED'
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelectedShift(s)}
                    style={[
                      styles.shiftItem,
                      isRejected && { borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.08)' },
                    ]}
                  >
                    <View style={styles.shiftHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.shiftNumber}>{s.number}</Text>
                          <View style={[styles.badge, { backgroundColor: `${statusTone(s.status)}20`, borderColor: `${statusTone(s.status)}50` }]}>
                            <Text style={[styles.badgeText, { color: statusTone(s.status) }]}>
                              {statusLabel(s.status)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.shiftMeta}>
                          {s.pumpName || 'Pump'} · Nozzles: {formatShiftNozzles(s as any)}
                        </Text>
                        <Text style={styles.shiftDate}>{formatDateTime(s.openedAt)}</Text>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.shiftDeclared}>{formatGHS(s.actualTotal)}</Text>
                        <Text
                          style={[
                            styles.shiftVariance,
                            {
                              color:
                                s.variance === 0
                                  ? colors.emerald
                                  : Math.abs(s.variance) < 5
                                  ? colors.amber
                                  : colors.rose,
                            },
                          ]}
                        >
                          Var: {formatGHS(s.variance, { showSign: true })}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.shiftFooter}>
                      <Text style={styles.footerTag}>
                        Cash: <Text style={{ color: colors.text, fontWeight: '700' }}>{formatGHS(s.payments?.CASH ?? 0)}</Text>
                      </Text>
                      <Text style={styles.footerTag}>
                        MoMo: <Text style={{ color: colors.blue, fontWeight: '700' }}>{formatGHS(s.payments?.MOMO ?? 0)}</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text style={{ color: colors.amber, fontSize: 11, fontWeight: '700' }}>Receipt</Text>
                        <ChevronRight size={13} color={colors.amber} />
                      </View>
                    </View>

                    {isRejected && s.reviewerNotes && (
                      <View style={styles.rejectWarningBox}>
                        <AlertTriangle size={13} color={colors.rose} />
                        <Text style={styles.rejectWarningText} numberOfLines={2}>
                          {s.reviewerNotes}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )
              })
            )}
          </ScrollView>
        </View>
      </View>

      {/* Handover Receipt Modal */}
      {selectedShift && (
        <ShiftReceiptModal
          shift={selectedShift}
          onClose={() => setSelectedShift(null)}
          onCorrectShift={onCorrectShift}
        />
      )}
    </Modal>
  )
}

/**
 * Detailed Mobile Shift Handover Receipt
 */
const ShiftReceiptModal: React.FC<{
  shift: Shift
  onClose: () => void
  onCorrectShift?: (shift: Shift) => void
}> = ({ shift, onClose, onCorrectShift }) => {
  const nozzles = extractShiftNozzlesList(shift as any)

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.receiptCard, { maxHeight: '90%' }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Receipt Header */}
            <View style={styles.receiptHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptTitle}>Handover Receipt</Text>
                <Text style={styles.receiptShiftNum}>{shift.number}</Text>
                <Text style={styles.receiptSub}>
                  {shift.stationName || 'Forecourt'} · {shift.pumpName || 'Pump'}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <X size={18} color={colors.text} />
              </Pressable>
            </View>

            {/* Attendant & Times */}
            <View style={styles.receiptSection}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Attendant:</Text>
                <Text style={styles.receiptVal}>{shift.attendantName}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Opened:</Text>
                <Text style={styles.receiptVal}>{formatDateTime(shift.openedAt)}</Text>
              </View>
              {shift.closedAt && (
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Closed:</Text>
                  <Text style={styles.receiptVal}>{formatDateTime(shift.closedAt)}</Text>
                </View>
              )}
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Status:</Text>
                <Text style={[styles.receiptVal, { color: colors.amber, fontWeight: '900' }]}>{shift.status}</Text>
              </View>
            </View>

            {/* Meter Readings */}
            <Text style={styles.receiptSectionTitle}>PUMP METER VOLUMES</Text>
            <View style={{ gap: 6, marginBottom: 12 }}>
              {nozzles.map((nz, i) => (
                <View key={i} style={styles.nozzleBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                      {nz.nozzleLabel || `Nozzle ${nz.nozzleIndex || i + 1}`}
                    </Text>
                    <Text style={{ color: colors.amber, fontWeight: '800', fontSize: 11 }}>{nz.fuelCode}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.textDim, fontSize: 10 }}>
                      Open: {nz.openingValue.toFixed(2)} → Close: {nz.closingValue > 0 ? nz.closingValue.toFixed(2) : '—'}
                    </Text>
                    <Text style={{ color: colors.emerald, fontWeight: '800', fontSize: 11 }}>
                      {nz.litres.toFixed(2)} L
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Remittance Breakdown */}
            <Text style={styles.receiptSectionTitle}>PAYMENT REMITTANCE</Text>
            <View style={styles.remittanceBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>💵 Cash at Hand:</Text>
                <Text style={styles.receiptVal}>{formatGHS(shift.payments?.CASH ?? 0)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>📱 Mobile Money (MoMo):</Text>
                <Text style={[styles.receiptVal, { color: colors.blue }]}>{formatGHS(shift.payments?.MOMO ?? 0)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>💳 POS / Vouchers:</Text>
                <Text style={styles.receiptVal}>{formatGHS(shift.payments?.VOUCHER ?? 0)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>📑 Credit / Invoices:</Text>
                <Text style={styles.receiptVal}>{formatGHS(shift.payments?.CREDIT ?? 0)}</Text>
              </View>

              <View style={[styles.receiptRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }]}>
                <Text style={[styles.receiptLabel, { color: colors.text, fontWeight: '800' }]}>Total Declared Takings:</Text>
                <Text style={[styles.receiptVal, { color: colors.amber, fontWeight: '900', fontSize: 13 }]}>
                  {formatGHS(shift.actualTotal)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Expected (From Meters):</Text>
                <Text style={styles.receiptVal}>{formatGHS(shift.salesTotal)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Variance:</Text>
                <Text
                  style={[
                    styles.receiptVal,
                    {
                      color:
                        shift.variance === 0
                          ? colors.emerald
                          : shift.variance > 0
                          ? colors.blue
                          : colors.rose,
                      fontWeight: '800',
                    },
                  ]}
                >
                  {shift.variance === 0 ? '0.00 (Balanced)' : formatGHS(shift.variance, { showSign: true })}
                </Text>
              </View>
            </View>

            {/* Supervisor Notes */}
            {shift.reviewerNotes && (
              <View style={styles.noteBox}>
                <Text style={styles.noteTitle}>SUPERVISOR FEEDBACK</Text>
                <Text style={styles.noteText}>{shift.reviewerNotes}</Text>
              </View>
            )}

            {/* Actions */}
            <View style={{ marginTop: 16 }}>
              {shift.status === 'REJECTED' && onCorrectShift ? (
                <PrimaryButton
                  title="Correct & Resubmit Shift"
                  onPress={() => {
                    onClose()
                    onCorrectShift(shift)
                  }}
                  tone="rose"
                />
              ) : (
                <PrimaryButton title="Close Receipt" onPress={onClose} tone="amber" />
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: '#0a0f1d',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#131b2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
  },
  chipText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#05101a',
    fontWeight: '900',
  },
  content: {
    padding: 16,
  },
  kpiCard: {
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#0e172a',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  kpiLabel: {
    color: colors.textDim,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  kpiBigNumber: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
    marginBottom: 10,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  kpiGridItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: 8,
  },
  kpiSubLabel: {
    color: colors.textDim,
    fontSize: 10,
  },
  kpiSubVal: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  volumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 12,
  },
  shiftItem: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  shiftNumber: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  shiftMeta: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  shiftDate: {
    color: colors.textFaint,
    fontSize: 10,
    marginTop: 1,
  },
  shiftDeclared: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  shiftVariance: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  shiftFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerTag: {
    color: colors.textDim,
    fontSize: 10,
  },
  rejectWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  rejectWarningText: {
    color: colors.rose,
    fontSize: 10,
    fontWeight: '700',
    flex: 1,
  },
  receiptCard: {
    backgroundColor: '#0a0f1d',
    borderRadius: 20,
    margin: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 12,
    marginBottom: 12,
  },
  receiptTitle: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  receiptShiftNum: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  receiptSub: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  receiptSection: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    borderRadius: 10,
    gap: 4,
    marginBottom: 12,
  },
  receiptSectionTitle: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  receiptLabel: {
    color: colors.textDim,
    fontSize: 11,
  },
  receiptVal: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  nozzleBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: 8,
  },
  remittanceBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    borderRadius: 10,
    gap: 4,
    marginBottom: 12,
  },
  noteBox: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderColor: 'rgba(234, 179, 8, 0.3)',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  noteTitle: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 2,
  },
  noteText: {
    color: colors.text,
    fontSize: 11,
  },
})
