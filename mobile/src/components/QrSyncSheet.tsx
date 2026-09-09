import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Modal } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { QrCode, Camera, ArrowLeft, CheckCircle2 } from 'lucide-react-native'
import { colors } from '../theme'
import { buildSyncPayload, frameToText, FrameCollector, type QrFrame, type ScanOutcome } from '../core/services/qrSync'

type Mode = 'choose' | 'send' | 'receive'

const decodeLabel = (o: ScanOutcome): string | null => {
  switch (o.state) {
    case 'need-more': return `Frame ${o.received}/${o.total} received — scan the next code`
    case 'error': return o.message
    case 'done': return `Synced: ${o.shifts} shift(s), ${o.audits} audit event(s) merged`
    default: return null
  }
}

export const QrSyncSheet: React.FC<{ visible: boolean; onClose: () => void; onSynced?: () => void }> = ({ visible, onClose, onSynced }) => {
  const [mode, setMode] = useState<Mode>('choose')
  const [frames, setFrames] = useState<QrFrame[]>([])
  const [frameIdx, setFrameIdx] = useState(0)
  const [permission, requestPermission] = useCameraPermissions()
  const [collector] = useState(() => new FrameCollector())
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<string | null>(null)

  const prepareSend = useCallback(async () => {
    const { frames } = await buildSyncPayload()
    setFrames(frames)
    setFrameIdx(0)
  }, [])

  useEffect(() => {
    if (visible) {
      setMode('choose')
      setScanResult(null)
      setScanStatus(null)
      collector.reset()
    }
  }, [visible, collector])

  useEffect(() => {
    if (mode === 'send') void prepareSend()
  }, [mode, prepareSend])

  useEffect(() => {
    if (visible && mode === 'receive' && permission && !permission.granted) {
      void requestPermission()
    }
  }, [visible, mode, permission, requestPermission])

  if (!visible) return null

  const onScan = async (data: string) => {
    const outcome = await collector.feed(data)
    const label = decodeLabel(outcome)
    if (label) setScanStatus(label)
    if (outcome.state === 'done') {
      setScanResult('sync-complete')
      onSynced?.()
    }
  }

  const currentFrame = frames[frameIdx]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'choose' ? 'QR Code Sync' : mode === 'send' ? 'Send — show this code' : 'Receive — scan a code'}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}><Text style={styles.closeText}>✕</Text></Pressable>
          </View>

        {mode === 'choose' && (
          <View style={styles.choices}>
            <View style={styles.choiceRow}>
              <ActionCard
                icon={<QrCode size={20} color={colors.emerald} />}
                title="Send data"
                subtitle="Shifts & audit events leave this device (offline, no WiFi/cloud needed)"
                onPress={() => setMode('send')}
              />
              <ActionCard
                icon={<Camera size={20} color={colors.violet} />}
                title="Receive data"
                subtitle="Scan another device’s codes to merge its shifts into this one"
                onPress={() => setMode('receive')}
              />
            </View>
            <Text style={styles.note}>Works fully offline between any two devices. Ideal for air-gapped transfer when the network or cloud is down.</Text>
          </View>
        )}

        {mode === 'send' && (
          <View style={styles.center}>
            {currentFrame ? (
              <>
                <View style={styles.qrBox}>
                  <QRCode value={frameToText(currentFrame)} size={200} backgroundColor="#ffffff" color="#020617" />
                </View>
                {frames.length > 1 && (
                  <Text style={styles.pager}>Code {frameIdx + 1} of {frames.length}</Text>
                )}
                <View style={styles.qrNav}>
                  <Pressable onPress={() => setFrameIdx(i => Math.max(0, i - 1))} disabled={frameIdx === 0} style={[styles.navBtn, frameIdx === 0 && styles.navDisabled]}>
                    <Text style={styles.navText}>‹ Prev</Text>
                  </Pressable>
                  <Text style={styles.navHint}>{frames.length > 1 ? 'Swipe/shift codes on the other device' : 'Single code'}</Text>
                  <Pressable onPress={() => setFrameIdx(i => Math.min(frames.length - 1, i + 1))} disabled={frameIdx === frames.length - 1} style={[styles.navBtn, frameIdx === frames.length - 1 && styles.navDisabled]}>
                    <Text style={styles.navText}>Next ›</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => setMode('choose')} style={styles.backBtn}>
                  <ArrowLeft size={13} color={colors.textDim} /><Text style={styles.backText}>Back</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator color={colors.emerald} size="large" />
            )}
          </View>
        )}

        {mode === 'receive' && (
          <View style={styles.center}>
            {Platform.OS === 'web' ? (
              <Text style={styles.note}>QR scanning is available in the iOS/Android app (Expo Go). On web, use the Send side of another device.</Text>
            ) : permission?.granted ? (
              <>
                <View style={styles.cameraBox}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={e => onScan(e.data)}
                  />
                </View>
                <Text style={styles.scanHint}>Point at the other device’s code. It auto-merges when finished.</Text>
              </>
            ) : (
              <>
                <Text style={styles.note}>Camera permission is needed to scan sync codes.</Text>
                <Pressable onPress={() => void requestPermission()} style={styles.permitBtn}>
                  <Text style={styles.permitText}>Grant camera access</Text>
                </Pressable>
              </>
            )}

            {scanStatus && (
              <View style={styles.statusRow}>
                {scanResult && <CheckCircle2 size={14} color={colors.emerald} />}
                <Text style={[styles.statusText, { color: scanResult ? colors.emerald : colors.amber }]}>{scanStatus}</Text>
              </View>
            )}
            <Pressable onPress={() => setMode('choose')} style={styles.backBtn}>
              <ArrowLeft size={13} color={colors.textDim} /><Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
    </Modal>
  )
}

const ActionCard: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; onPress: () => void }> = ({ icon, title, subtitle, onPress }) => (
  <Pressable onPress={onPress} style={styles.actionCard}>
    {icon}
    <Text style={styles.actionTitle}>{title}</Text>
    <Text style={styles.actionSub}>{subtitle}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2,6,23,0.9)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: colors.text, fontSize: 15, fontWeight: '900' },
  closeBtn: { backgroundColor: colors.panel2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  closeText: { color: colors.textDim, fontSize: 13 },
  choices: { gap: 12 },
  choiceRow: { flexDirection: 'row', gap: 10 },
  actionCard: { flex: 1, backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  actionTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  actionSub: { color: colors.textFaint, fontSize: 10, lineHeight: 14 },
  note: { color: colors.textFaint, fontSize: 11, lineHeight: 16, marginTop: 4, textAlign: 'center' },
  center: { alignItems: 'center', gap: 12 },
  qrBox: { backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center' },
  pager: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  qrNav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  navBtn: { backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  navDisabled: { opacity: 0.4 },
  navText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  navHint: { color: colors.textFaint, fontSize: 10, flex: 1, textAlign: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  backText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  cameraBox: { width: '100%', height: 240, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  scanHint: { color: colors.textFaint, fontSize: 11, textAlign: 'center', paddingHorizontal: 12 },
  permitBtn: { backgroundColor: colors.emerald, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  permitText: { color: '#04130d', fontWeight: '800', fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  statusText: { fontSize: 12, fontWeight: '700' },
})