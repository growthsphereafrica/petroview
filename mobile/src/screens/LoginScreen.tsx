import React, { useState } from 'react'
import { View, Text, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native'
import { Flame, UserCog, Zap } from 'lucide-react-native'
import { colors } from '../theme'
import { PrimaryButton, StyledTextInput } from '../components/ui'
import { mobileAuth, type MobileRole } from '../core/services/authService'
import { seedProductionData } from '../core/infra/repositories'

export interface MobileSession {
  role: MobileRole
  fullName: string
  employeeCode: string
}

export const LoginScreen: React.FC<{ onAuthenticated: (s: MobileSession) => void }> = ({ onAuthenticated }) => {
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  const submit = async () => {
    setError(null)
    setSigningIn(true)
    try {
      await seedProductionData()
      const { role, attendant, supervisor, session } = await mobileAuth.authenticate(employeeCode, pin)
      const fullName = role === 'supervisor' ? (supervisor as NonNullable<typeof supervisor>).fullName : (attendant as NonNullable<typeof attendant>).fullName
      void session
      onAuthenticated({ role, fullName, employeeCode: employeeCode.toUpperCase() })
    } catch (e) {
      const { describeError } = await import('../core/services/shiftService')
      setError(describeError(e))
      setPin('')
    } finally {
      setSigningIn(false)
    }
  }

  const codeUpper = employeeCode.trim().toUpperCase()
  const roleHint =
    codeUpper === 'SUPER-ADMIN' || codeUpper === 'ADMIN' || codeUpper.startsWith('SUPER')
      ? 'superadmin'
      : codeUpper.includes('HQ') || codeUpper.startsWith('SUP') || codeUpper.endsWith('M') || codeUpper.includes('-M')
      ? 'supervisor'
      : codeUpper.length >= 3
      ? 'attendant'
      : null

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Flame size={36} color="#fff" />
            </View>
            <View style={styles.titleRow}>
              <Text style={styles.titlePetro}>PETRO</Text>
              <Text style={styles.titleView}>VIEW</Text>
            </View>
            <Text style={styles.subtitle}>Forecourt Operating System · Local-First</Text>
          </View>

          <Text style={styles.hint}>
            <UserCog size={13} color={colors.flame} /> One login for every forecourt role
          </Text>

          <View style={styles.form}>
            <Text style={styles.fieldLabel}>EMPLOYEE CODE</Text>
            <StyledTextInput
              value={employeeCode}
              onChangeText={t => setEmployeeCode(t.toUpperCase())}
              placeholder="SUPER-ADMIN, PV-HQ01, PV-ACC-001-A…"
              autoCapitalize="characters"
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>PIN (4 DIGITS)</Text>
            <StyledTextInput
              value={pin}
              onChangeText={t => setPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              secureTextEntry
              keyboardType="number-pad"
            />

            {roleHint && (
              <View style={styles.roleBanner}>
                {roleHint === 'superadmin' ? (
                  <>
                    <UserCog size={13} color={colors.rose} />
                    <Text style={[styles.roleText, { color: colors.rose }]}>Platform Master detected — full platform administrative authority.</Text>
                  </>
                ) : roleHint === 'supervisor' ? (
                  <>
                    <UserCog size={13} color={colors.flame} />
                    <Text style={[styles.roleText, { color: colors.flame }]}>Management portal detected — shift review & forecourt controls.</Text>
                  </>
                ) : (
                  <>
                    <Zap size={13} color={colors.amber} />
                    <Text style={[styles.roleText, { color: colors.amber }]}>Attendant terminal detected — forecourt POS & dispensing.</Text>
                  </>
                )}
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <PrimaryButton
              title={signingIn ? 'Signing in…' : 'Sign In'}
              onPress={() => void submit()}
              disabled={signingIn || employeeCode.length < 3 || pin.length !== 4}
              loading={signingIn}
              tone="flame"
            />

            {/* Quick Demo Credentials for Fast Testing */}
            <View style={styles.demoSection}>
              <Text style={styles.demoTitle}>QUICK DEMO CREDENTIALS (1-TAP FILL)</Text>
              <View style={styles.demoGrid}>
                <TouchableOpacity
                  style={styles.demoChip}
                  onPress={() => {
                    setEmployeeCode('SUPER-ADMIN')
                    setPin('7256')
                    setError(null)
                  }}
                >
                  <Text style={[styles.demoChipText, { color: colors.rose }]}>👑 SUPER-ADMIN · 7256</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.demoChip}
                  onPress={() => {
                    setEmployeeCode('PV-HQ01')
                    setPin('9999')
                    setError(null)
                  }}
                >
                  <Text style={[styles.demoChipText, { color: colors.flame }]}>🏢 PV-HQ01 · 9999</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.demoChip}
                  onPress={() => {
                    setEmployeeCode('GOIL-HQ01')
                    setPin('9999')
                    setError(null)
                  }}
                >
                  <Text style={[styles.demoChipText, { color: colors.amber }]}>🏢 GOIL-HQ01 · 9999</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.demoChip}
                  onPress={() => {
                    setEmployeeCode('TOTAL-HQ01')
                    setPin('9999')
                    setError(null)
                  }}
                >
                  <Text style={[styles.demoChipText, { color: colors.rose }]}>🏢 TOTAL-HQ01 · 9999</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.demoChip}
                  onPress={() => {
                    setEmployeeCode('SHELL-HQ01')
                    setPin('9999')
                    setError(null)
                  }}
                >
                  <Text style={[styles.demoChipText, { color: colors.amber }]}>🏢 SHELL-HQ01 · 9999</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.demoChip}
                  onPress={() => {
                    setEmployeeCode('PV-ACC-001-M')
                    setPin('1234')
                    setError(null)
                  }}
                >
                  <Text style={[styles.demoChipText, { color: colors.flame }]}>👨‍💼 PV-ACC-001-M · 1234</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.demoChip, { width: '100%' }]}
                  onPress={() => {
                    setEmployeeCode('PV-ACC-001-A')
                    setPin('1234')
                    setError(null)
                  }}
                >
                  <Text style={[styles.demoChipText, { color: colors.emerald }]}>⚡ PV-ACC-001-A · 1234 (Attendant)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  brand: { alignItems: 'center', marginTop: 24, marginBottom: 20 },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.flame,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: colors.flame,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline' },
  titlePetro: { color: colors.text, fontWeight: '900', fontSize: 24, letterSpacing: 0.5 },
  titleView: { color: colors.flame, fontWeight: '900', fontSize: 24, letterSpacing: 0.5, marginLeft: 2 },
  subtitle: { color: colors.textFaint, fontSize: 11, marginTop: 4, fontFamily: 'monospace' },
  hint: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  form: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 },
  fieldLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  roleBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  roleText: { fontSize: 11, fontWeight: '600', flex: 1 },
  error: { color: colors.rose, fontSize: 12, fontWeight: '600', marginTop: 12 },
  demoSection: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  demoTitle: { color: colors.flame, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  demoChip: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  demoChipText: { fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
})