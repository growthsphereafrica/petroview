import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
} from 'react-native'
import { DollarSign, Plus, CheckCircle2, AlertTriangle, Receipt, X, ArrowDownRight } from 'lucide-react-native'
import { colors } from '../../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../../components/ui'
import {
  mobileExpenseService,
  STANDARD_EXPENSE_CATEGORIES,
} from '../../core/services/expenseService'
import { formatGHS, formatDateTime } from '../../shared/currencyFormatter'
import type { StationExpense, ExpensePaymentSource } from '../../core/domain/types'
import type { MobileSession } from '../LoginScreen'

export const ExpensesSheet: React.FC<{
  visible: boolean
  onClose: () => void
  session: MobileSession
}> = ({ visible, onClose, session }) => {
  const [expenses, setExpenses] = useState<StationExpense[]>([])
  const [summary, setSummary] = useState<{ total: number; today: number; count: number }>({
    total: 0,
    today: 0,
    count: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recordOpen, setRecordOpen] = useState(false)

  // Form state
  const [category, setCategory] = useState(STANDARD_EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [paymentSource, setPaymentSource] = useState<ExpensePaymentSource>('CASH')
  const [payee, setPayee] = useState('')
  const [refNumber, setRefNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [list, sum] = await Promise.all([
        mobileExpenseService.listExpenses(session.stationId),
        mobileExpenseService.getSummary(session.stationId),
      ])
      setExpenses(list)
      setSummary(sum)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible) {
      void load()
    }
  }, [visible])

  const handleCreate = async () => {
    const amt = parseFloat(amount.replace(/,/g, ''))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be greater than 0.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await mobileExpenseService.createExpense({
        companyId: session.companyId,
        companyShortCode: session.companyShortCode ?? undefined,
        stationId: session.stationId,
        stationName: session.stationName || 'Station Branch',
        category,
        amount: amt,
        paymentSource,
        payee: payee || undefined,
        referenceNumber: refNumber || undefined,
        notes: notes || undefined,
        recordedBy: {
          id: session.userId,
          name: session.fullName,
          employeeCode: session.employeeCode,
        },
      })
      setRecordOpen(false)
      setAmount('')
      setPayee('')
      setRefNumber('')
      setNotes('')
      await load()
    } catch (e: any) {
      setError(e.message || 'Failed to save expense.')
    } finally {
      setSaving(false)
    }
  }

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Station Expenses</Text>
              <Text style={styles.subtitle}>{session.stationName || 'Forecourt'} · Operating Outflows</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <X size={18} color={colors.textDim} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                <Text style={styles.summaryLabel}>TODAY'S OUTFLOW</Text>
                <Text style={[styles.summaryValue, { color: colors.rose }]}>{formatGHS(summary.today)}</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: 'rgba(255, 255, 255, 0.1)' }]}>
                <Text style={styles.summaryLabel}>TOTAL LOGGED ({summary.count})</Text>
                <Text style={styles.summaryValue}>{formatGHS(summary.total)}</Text>
              </View>
            </View>

            {/* Action */}
            <PrimaryButton
              title="Record New Expense"
              onPress={() => setRecordOpen(true)}
              tone="flame"
              style={{ marginVertical: 12 }}
            />

            {/* List */}
            <Text style={styles.sectionTitle}>RECENT EXPENSES</Text>
            {loading ? (
              <View style={styles.center}><ActivityIndicator color={colors.emerald} /></View>
            ) : expenses.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Receipt size={24} color={colors.textFaint} />
                <Text style={styles.emptyText}>No station expenses recorded yet.</Text>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {expenses.map(e => (
                  <Card key={e.id} style={styles.expenseRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.catText}>{e.category}</Text>
                      <Text style={styles.metaText}>
                        {formatDateTime(e.createdAt)} · {e.paymentSource} {e.payee ? `· ${e.payee}` : ''}
                      </Text>
                      {e.notes ? <Text style={styles.noteText}>{e.notes}</Text> : null}
                    </View>
                    <Text style={styles.amountText}>-{formatGHS(e.amount)}</Text>
                  </Card>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Record Modal */}
          {recordOpen && (
            <Modal visible transparent animationType="fade">
              <View style={styles.modalBackdrop}>
                <Card style={styles.recordCard}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={styles.header}>
                      <Text style={styles.title}>New Station Expense</Text>
                      <Pressable onPress={() => setRecordOpen(false)} hitSlop={8}>
                        <X size={16} color={colors.textDim} />
                      </Pressable>
                    </View>

                    {error && (
                      <View style={styles.errorBox}>
                        <AlertTriangle size={14} color={colors.rose} />
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}

                    {/* Amount */}
                    <Text style={styles.fieldLabel}>AMOUNT (GHS) *</Text>
                    <StyledTextInput
                      value={amount}
                      onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ''))}
                      placeholder="0.00"
                      keyboardType="number-pad"
                    />

                    {/* Category */}
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>CATEGORY *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {STANDARD_EXPENSE_CATEGORIES.map(c => (
                          <Pressable
                            key={c}
                            onPress={() => setCategory(c)}
                            style={[styles.catChip, category === c && styles.catChipActive]}
                          >
                            <Text style={[styles.catChipText, category === c && { color: '#04130d', fontWeight: '800' }]}>
                              {c}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>

                    {/* Payment Source */}
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>PAYMENT SOURCE</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}>
                      {(['CASH', 'MOMO', 'STATION_ACCOUNT', 'OTHER'] as const).map(s => (
                        <Pressable
                          key={s}
                          onPress={() => setPaymentSource(s)}
                          style={[styles.sourceChip, paymentSource === s && styles.sourceChipActive]}
                        >
                          <Text style={[styles.sourceChipText, paymentSource === s && { color: colors.emerald, fontWeight: '800' }]}>
                            {s === 'STATION_ACCOUNT' ? 'BANK' : s}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Payee */}
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>PAYEE / VENDOR (OPTIONAL)</Text>
                    <StyledTextInput
                      value={payee}
                      onChangeText={setPayee}
                      placeholder="e.g. ECG / Ghana Water / Technician"
                    />

                    {/* Ref Number */}
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>RECEIPT / REFERENCE # (OPTIONAL)</Text>
                    <StyledTextInput
                      value={refNumber}
                      onChangeText={setRefNumber}
                      placeholder="e.g. INV-2026-0042"
                    />

                    {/* Notes */}
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>DESCRIPTION / NOTES</Text>
                    <StyledTextInput
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Details of expense..."
                    />

                    <PrimaryButton
                      title={saving ? 'Recording…' : 'Save Expense'}
                      onPress={() => void handleCreate()}
                      tone="flame"
                      disabled={saving || !amount}
                      style={{ marginTop: 16 }}
                    />
                    <PrimaryButton
                      title="Cancel"
                      onPress={() => setRecordOpen(false)}
                      tone="rose"
                      style={{ marginTop: 8 }}
                    />
                  </ScrollView>
                </Card>
              </View>
            </Modal>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 11,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.panel2,
  },
  content: {
    paddingBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  summaryLabel: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.panel,
  },
  catText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  metaText: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: 2,
  },
  noteText: {
    color: colors.textFaint,
    fontSize: 10,
    marginTop: 2,
    fontStyle: 'italic',
  },
  amountText: {
    color: colors.rose,
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 12,
  },
  center: {
    padding: 24,
    alignItems: 'center',
  },
  recordCard: {
    margin: 16,
    maxHeight: '85%',
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.bg,
  },
  fieldLabel: {
    color: colors.textDim,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  errorText: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: '700',
  },
  catChip: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  catChipActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  catChipText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  sourceChip: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  sourceChipActive: {
    borderColor: colors.emerald,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  sourceChipText: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
  },
})
