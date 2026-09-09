import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator } from 'react-native'
import { Droplets, Gauge, Plus, Save, History } from 'lucide-react-native'
import { colors } from '../../theme'
import { Card } from '../../components/ui'
import { cloudGetTankReadings, cloudRecordTankReadings, type TankReadingEntry, type TankReadingRow } from '../../core/infra/cloudApi'
import { formatDateTime } from '../../shared/currencyFormatter'

const FUEL_OPTIONS = [
  { code: 'PMS', label: 'Super Petrol', color: '#22c55e' },
  { code: 'AGO', label: 'Diesel', color: '#3b82f6' },
  { code: 'DPK', label: 'DPK', color: '#f97316' },
  { code: 'KERO', label: 'Kerosene', color: '#a855f7' },
]

function EmptyEntry(): TankReadingEntry {
  return { tankId: '', fuelCode: 'PMS', openingLevel: 0, closingLevel: 0, dipStock: 0, received: 0 }
}

export const TankReadingsSheet: React.FC<{
  visible: boolean
  onClose: () => void
  stationId: string | null
  stationName?: string
}> = ({ visible, onClose, stationId, stationName }) => {
  const [mode, setMode] = useState<'history' | 'record'>('history')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [rows, setRows] = useState<TankReadingRow[]>([])
  const [entries, setEntries] = useState<TankReadingEntry[]>([{ ...EmptyEntry(), tankId: 'TK1' }, { ...EmptyEntry(), tankId: 'TK2' }])
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await cloudGetTankReadings(stationId, 30)
      setRows(res.readings ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tank readings.')
    } finally {
      setLoading(false)
    }
  }, [stationId])

  useEffect(() => {
    if (visible) {
      setMode('history')
      setSuccess(null)
      void load()
    }
  }, [visible, load])

  const updateEntry = (index: number, field: keyof TankReadingEntry, value: string) => {
    setEntries(prev =>
      prev.map((e, i) => {
        if (i !== index) return e
        if (field === 'tankId' || field === 'fuelCode' || field === 'notes') return { ...e, [field]: value }
        return { ...e, [field]: Number(value) || 0 }
      }),
    )
  }

  const addEntry = () => setEntries(prev => [...prev, EmptyEntry()])
  const removeEntry = (index: number) => setEntries(prev => prev.filter((_, i) => i !== index))

  const submit = async () => {
    if (!stationId) {
      setError('No station is linked to this account. Contact your OMC head office.')
      return
    }
    const validEntries = entries.filter(e => /^[A-Z]{3}(\d)?$/i.test(e.tankId.trim()))
    if (validEntries.length === 0) {
      setError('Add at least one tank with a valid ID (e.g. TK1).')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await cloudRecordTankReadings({ stationId, readings: validEntries, notes: notes || undefined })
      setSuccess(`Saved ${res.readingsCount} reading${res.readingsCount === 1 ? '' : 's'}.`)
      setEntries([{ ...EmptyEntry(), tankId: 'TK1' }, { ...EmptyEntry(), tankId: 'TK2' }])
      setNotes('')
      setMode('history')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save readings.')
    } finally {
      setSaving(false)
    }
  }

  const totalDip = rows.reduce((a, r) => a + r.readings.reduce((x, y) => x + (y.dipStock || 0), 0), 0)

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Tank Readings</Text>
            {!!stationName && <Text style={styles.sub}>{stationName}</Text>}
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}><Text style={styles.closeText}>✕</Text></Pressable>
        </View>

        <View style={styles.seg}>
          {(['history', 'record'] as const).map(m => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segItem, mode === m && styles.segActive]}>
              <Text style={[styles.segText, mode === m && { color: '#04130d' }]}>{m === 'history' ? 'History' : 'Record'}</Text>
            </Pressable>
          ))}
        </View>

        {!!success && <Text style={styles.success}>{success}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {mode === 'history' && (
          loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.emerald} size="large" /></View>
          ) : rows.length === 0 ? (
            <Text style={styles.empty}>No readings recorded yet. Tap “Record” to enter today’s dip levels.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
              <Card style={styles.summaryCard}>
                <View style={styles.summaryInner}>
                  <Gauge size={16} color={colors.emerald} />
                  <View>
                    <Text style={styles.summaryValue}>{totalDip.toFixed(0)} L</Text>
                    <Text style={styles.summaryLabel}>aggregate dip stock</Text>
                  </View>
                </View>
              </Card>
              <Card style={styles.listCard}>
                {rows.map(r => (
                  <View key={r.id} style={styles.row}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowTitle}>{formatDateTime(r.recordedAt)}</Text>
                      <Text style={styles.rowDim}>{r.readings.length} tank{r.readings.length === 1 ? '' : 's'}</Text>
                    </View>
                    <Text style={styles.rowDim}>{r.recordedByName}</Text>
                    <View style={styles.readingList}>
                      {r.readings.map((rd, i) => {
                        const meta = FUEL_OPTIONS.find(f => f.code === rd.fuelCode)
                        return (
                          <View key={i} style={styles.readingChip}>
                            <View style={[styles.dot, { backgroundColor: meta?.color ?? colors.emerald }]} />
                            <Text style={styles.readingTank}>{rd.tankId || 'Tank'}</Text>
                            <Text style={styles.readingDim}>{meta?.label ?? rd.fuelCode}</Text>
                            <Text style={styles.readingDip}>{rd.dipStock || 0}L dip</Text>
                          </View>
                        )
                      })}
                    </View>
                    {!!r.notes && <Text style={styles.notes}>{r.notes}</Text>}
                  </View>
                ))}
              </Card>
            </ScrollView>
          )
        )}

        {mode === 'record' && (
          <ScrollView style={{ maxHeight: 380 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <View style={{ gap: 10 }}>
              {entries.map((entry, index) => (
                <View key={index} style={styles.entryCard}>
                  <View style={styles.entryHeader}>
                    <TextInput
                      value={entry.tankId}
                      onChangeText={t => updateEntry(index, 'tankId', t.toUpperCase())}
                      placeholder="TK1"
                      placeholderTextColor={colors.textFaint}
                      autoCapitalize="characters"
                      style={styles.tankInput}
                    />
                    <View style={styles.fuelPicker}>
                      {FUEL_OPTIONS.map(f => (
                        <Pressable
                          key={f.code}
                          onPress={() => updateEntry(index, 'fuelCode', f.code)}
                          style={[styles.fuelChip, entry.fuelCode === f.code && { backgroundColor: f.color }]}
                        >
                          <Text style={[styles.fuelChipText, entry.fuelCode === f.code && { color: '#04130d' }]}>{f.code}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable onPress={() => removeEntry(index)} disabled={entries.length === 1} style={styles.removeBtn}>
                      <Text style={{ color: colors.textDim, fontSize: 13 }}>✕</Text>
                    </Pressable>
                  </View>
                  <View style={styles.entryGrid}>
                    <NumField label="Opening" value={entry.openingLevel} onChange={v => updateEntry(index, 'openingLevel', v)} />
                    <NumField label="Closing" value={entry.closingLevel} onChange={v => updateEntry(index, 'closingLevel', v)} />
                    <NumField label="Dip stock" value={entry.dipStock} onChange={v => updateEntry(index, 'dipStock', v)} />
                    <NumField label="Received" value={entry.received} onChange={v => updateEntry(index, 'received', v)} />
                  </View>
                </View>
              ))}
              <Pressable onPress={addEntry} style={styles.addRow}>
                <Plus size={13} color={colors.emerald} />
                <Text style={styles.addRowText}>Add tank</Text>
              </Pressable>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes (optional) — delivery, pump issues…"
                placeholderTextColor={colors.textFaint}
                multiline
                numberOfLines={2}
                style={styles.notesInput}
              />
              <Pressable
                onPress={() => void submit()}
                disabled={saving}
                style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              >
                {saving ? <ActivityIndicator color="#04130d" size="small" /> : <Save size={15} color="#04130d" />}
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save Readings'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  )
}

const NumField: React.FC<{ label: string; value: number; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <View>
    <Text style={styles.numLabel}>{label} (L)</Text>
    <TextInput
      value={value ? String(value) : ''}
      onChangeText={onChange}
      placeholder="0"
      placeholderTextColor={colors.textFaint}
      keyboardType="numeric"
      style={styles.numInput}
    />
  </View>
)

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2,6,23,0.9)', justifyContent: 'flex-end', zIndex: 20 },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.text, fontSize: 16, fontWeight: '900' },
  sub: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  closeBtn: { backgroundColor: colors.panel2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  closeText: { color: colors.textDim, fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: colors.panel2, borderRadius: 12, padding: 3, marginBottom: 12 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segActive: { backgroundColor: colors.emerald },
  segText: { color: colors.textDim, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  success: { color: colors.emerald, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  error: { color: colors.rose, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  center: { paddingVertical: 50, alignItems: 'center' },
  empty: { color: colors.textFaint, fontSize: 12, paddingVertical: 30, textAlign: 'center' },
  summaryCard: { padding: 12, marginBottom: 10 },
  summaryInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  summaryLabel: { color: colors.textFaint, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  listCard: { overflow: 'hidden' },
  row: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  rowDim: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  readingList: { gap: 4, marginTop: 6 },
  readingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  readingTank: { color: colors.text, fontSize: 11, fontWeight: '800' },
  readingDim: { color: colors.textFaint, fontSize: 10, flex: 1 },
  readingDip: { color: colors.textDim, fontSize: 10, fontFamily: 'monospace' },
  notes: { color: colors.textFaint, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  entryCard: { backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tankInput: { backgroundColor: colors.bg, borderColor: colors.borderLight, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.text, fontFamily: 'monospace', fontSize: 13, fontWeight: '800', width: 54, textAlign: 'center' },
  fuelPicker: { flex: 1, flexDirection: 'row', gap: 4 },
  fuelChip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7, backgroundColor: colors.bg, borderColor: colors.borderLight, borderWidth: 1 },
  fuelChipText: { color: colors.textDim, fontSize: 10, fontWeight: '900' },
  removeBtn: { width: 28, alignItems: 'center' },
  entryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  numLabel: { color: colors.textFaint, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  numInput: { backgroundColor: colors.bg, borderColor: colors.borderLight, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.text, fontFamily: 'monospace', fontSize: 13, width: 82 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderLight, borderRadius: 10 },
  addRowText: { color: colors.emerald, fontSize: 12, fontWeight: '800' },
  notesInput: { backgroundColor: colors.panel2, borderColor: colors.borderLight, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 12, minHeight: 48, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: colors.emerald, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveText: { color: '#04130d', fontSize: 13, fontWeight: '900' },
})