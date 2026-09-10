import React, { useState } from 'react'
import { View, Text, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native'
import { Flame, ShieldCheck, UserCog, Zap } from 'lucide-react-native'
import { colors } from '../theme'
import { PrimaryButton, StyledTextInput } from '../components/ui'
import { mobileAuth, type MobileRole } from '../core/services/authService'

export interface MobileSession {
  role: MobileRole
  fullName: string
  employeeCode: string
  stationId?: string | null
  stationName?: string
  companyShortCode?: string | null
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
      const { role, attendant, supervisor, cloudSession } = await mobileAuth.authenticate(employeeCode, pin)
      if (role === 'superadmin' || role === 'headoffice') {
        throw new Error('This mobile app is exclusively for Forecourt Attendants and Station Supervisors. OMC HQ Admin and Super Admin portals must be accessed via desktop browser.')
      }
      const fullName =
        cloudSession?.fullName ||
        supervisor?.fullName ||
        attendant?.fullName ||
        (role === 'supervisor' ? 'Station Supervisor' : 'Pump Attendant')
      onAuthenticated({
        role,
        fullName,
        employeeCode: employeeCode.toUpperCase(),
        stationId: cloudSession?.stationId ?? null,
        stationName: cloudSession?.stationName,
        companyShortCode: cloudSession?.companyShortCode ?? null,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPin('')
    } finally {
      setSigningIn(false)
    }
  }

  const codeUpper = employeeCode.trim().toUpperCase()
  const isExcludedRole = codeUpper === 'SUPER-ADMIN' || codeUpper === 'ADMIN' || codeUpper.startsWith('SUPER') || codeUpper.includes('HQ')
  const roleHint = isExcludedRole
    ? 'desktop_only'
    : codeUpper.startsWith('SUP') || codeUpper.endsWith('M') || codeUpper.includes('-M')
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
            <Text style={styles.subtitle}>Forecourt Operating System</Text>
          </View>

          <Text style={styles.hint}>
            <UserCog size={13} color={colors.flame} /> One login for every forecourt role
          </Text>

          <View style={styles.form}>
            <Text style={styles.fieldLabel}>EMPLOYEE CODE</Text>
            <StyledTextInput
              value={employeeCode}
              onChangeText={t => setEmployeeCode(t.toUpperCase())}
              placeholder="Enter your employee code"
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
                {roleHint === 'desktop_only' ? (
                  <>
                    <ShieldCheck size={13} color={colors.rose} />
                    <Text style={[styles.roleText, { color: colors.rose }]}>OMC HQ Admin & Super Admin portals are desktop web only.</Text>
                  </>
                ) : roleHint === 'supervisor' ? (
                  <>
                    <UserCog size={13} color={colors.flame} />
                    <Text style={[styles.roleText, { color: colors.flame }]}>Station Supervisor — shift verification, tank dipping & staff oversight.</Text>
                  </>
                ) : (
                  <>
                    <Zap size={13} color={colors.amber} />
                    <Text style={[styles.roleText, { color: colors.amber }]}>Pump Attendant — forecourt fuel dispensing POS & shift sales.</Text>
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

            <Text style={styles.offlineNote}>
              Manager & Attendant accounts are created by the OMC HQ Admin.
            </Text>
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
  offlineNote: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 16 },
})
