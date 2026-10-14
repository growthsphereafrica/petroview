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
import { DollarSign, Edit3, Fuel, Info, Save, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react-native'
import { colors } from '../../theme'
import { Card, Badge, PrimaryButton, StyledTextInput } from '../../components/ui'
import { mobileProductService } from '../../core/services/productService'
import { formatGHS } from '../../shared/currencyFormatter'
import type { Product } from '../../core/domain/types'
import type { MobileSession } from '../LoginScreen'

export const FuelPricesTab: React.FC<{
  session: MobileSession
  onChanged?: () => void
}> = ({ session, onChanged }) => {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const list = await mobileProductService.listActiveProducts(session.companyId)
      setProducts(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [session.companyId])

  const notify = (text: string, tone: 'success' | 'error' = 'success') => {
    setMessage({ text, tone })
    setTimeout(() => setMessage(null), 3500)
  }

  const handleStartEdit = (prod: Product) => {
    setEditingId(prod.id)
    setEditPrice(prod.unitPrice.toString())
  }

  const handleSave = async (prod: Product) => {
    const val = parseFloat(editPrice)
    if (!Number.isFinite(val) || val <= 0) {
      notify('Unit price must be a positive number.', 'error')
      return
    }

    setSaving(true)
    try {
      await mobileProductService.updateProduct(prod.id, {
        name: prod.name,
        unitPrice: Math.round(val * 100) / 100,
        actorName: `${session.fullName} (Supervisor)`,
      })
      notify(`Updated ${prod.name} to GHS ${val.toFixed(2)}/L.`, 'success')
      setEditingId(null)
      setEditPrice('')
      await load()
      onChanged?.()
    } catch {
      notify('Failed to save fuel price.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>STATION FUEL PRICES</Text>

      {/* Info Banner */}
      <View style={styles.banner}>
        <Info size={16} color={colors.amber} style={{ marginTop: 2 }} />
        <Text style={styles.bannerText}>
          Unit prices configured here apply station-wide and are strictly enforced for all attendant pump shifts. Attendants cannot alter fuel rates.
        </Text>
      </View>

      {message && (
        <View style={[styles.feedback, message.tone === 'success' ? styles.feedbackSuccess : styles.feedbackError]}>
          {message.tone === 'success' ? (
            <CheckCircle2 size={14} color={colors.emerald} />
          ) : (
            <AlertTriangle size={14} color={colors.rose} />
          )}
          <Text style={[styles.feedbackText, { color: message.tone === 'success' ? colors.emerald : colors.rose }]}>
            {message.text}
          </Text>
        </View>
      )}

      {loading ? (
        <Card style={styles.center}>
          <ActivityIndicator color={colors.emerald} size="small" />
          <Text style={styles.loadText}>Loading official forecourt rates…</Text>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {products.map(prod => {
            const isEditing = editingId === prod.id
            const color = prod.color || (prod.code === 'PMS' ? '#22c55e' : prod.code === 'AGO' ? '#3b82f6' : colors.amber)

            return (
              <Card key={prod.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.fuelBadge, { backgroundColor: color }]}>
                      <Text style={styles.fuelBadgeText}>{prod.code}</Text>
                    </View>
                    <View>
                      <Text style={styles.fuelName}>{prod.name}</Text>
                      <Text style={styles.fuelUnit}>{prod.unit || 'Per Litre'}</Text>
                    </View>
                  </View>
                  {!isEditing && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.rateText}>{formatGHS(prod.unitPrice)}</Text>
                      <Text style={styles.ratePerL}>/ Litre</Text>
                    </View>
                  )}
                </View>

                {isEditing ? (
                  <View style={styles.editSection}>
                    <Text style={styles.inputLabel}>NEW UNIT PRICE PER LITRE (GHS)</Text>
                    <StyledTextInput
                      value={editPrice}
                      onChangeText={t => setEditPrice(t.replace(/[^0-9.]/g, ''))}
                      placeholder="e.g. 15.50"
                      keyboardType="number-pad"
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <PrimaryButton
                        title={saving ? 'Saving…' : 'Save Price'}
                        onPress={() => void handleSave(prod)}
                        tone="emerald"
                        disabled={saving || !editPrice}
                        style={{ flex: 1 }}
                      />
                      <PrimaryButton
                        title="Cancel"
                        onPress={() => {
                          setEditingId(null)
                          setEditPrice('')
                        }}
                        tone="rose"
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                ) : (
                  <Pressable onPress={() => handleStartEdit(prod)} style={styles.editBtn}>
                    <Edit3 size={13} color={colors.textDim} />
                    <Text style={styles.editBtnText}>Adjust Unit Price</Text>
                  </Pressable>
                )}
              </Card>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { marginTop: 4 },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  banner: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bannerText: {
    color: '#fed7aa',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  feedback: {
    padding: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
  },
  feedbackError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
  },
  feedbackText: {
    fontSize: 11,
    fontWeight: '700',
  },
  card: { padding: 12, borderRadius: 14, backgroundColor: colors.panel },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fuelBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuelBadgeText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
  },
  fuelName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  fuelUnit: {
    color: colors.textDim,
    fontSize: 10,
  },
  rateText: {
    color: colors.emerald,
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  ratePerL: {
    color: colors.textDim,
    fontSize: 9,
    textAlign: 'right',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  editBtnText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  editSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inputLabel: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  center: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadText: {
    color: colors.textDim,
    fontSize: 11,
  },
})
