import React from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, TextStyle, ViewStyle } from 'react-native'
import { colors } from '../theme'

export const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.screen}>{children}</View>
)

export const StyledTextInput: React.FC<{
  value: string
  onChangeText: (t: string) => void
  placeholder: string
  secureTextEntry?: boolean
  keyboardType?: 'default' | 'number-pad'
  autoCapitalize?: 'none' | 'characters'
  style?: TextStyle
}> = ({ value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, style }) => (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={colors.textFaint}
    secureTextEntry={secureTextEntry}
    keyboardType={keyboardType}
    autoCapitalize={autoCapitalize}
    style={[styles.input, style]}
  />
)

export const PrimaryButton: React.FC<{
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  tone?: 'flame' | 'emerald' | 'amber' | 'rose' | 'violet'
  style?: ViewStyle
}> = ({ title, onPress, disabled, loading, tone = 'flame', style }) => {
  const bg = tone === 'flame' ? colors.flame : tone === 'emerald' ? colors.emerald : tone === 'amber' ? colors.amber : tone === 'rose' ? colors.rose : colors.violet
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled || loading ? 0.45 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  )
}

export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
)

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={styles.label}>{children}</Text>
)

export type BadgeTone = 'default' | 'flame' | 'success' | 'warning' | 'danger' | 'info'

const BADGE_TONES: Record<BadgeTone, { bg: string; color: string }> = {
  default: { bg: '#1e293b', color: '#e2e8f0' },
  flame: { bg: '#431407', color: '#fb923c' },
  success: { bg: '#064e3b', color: '#34d399' },
  warning: { bg: '#78350f', color: '#fbbf24' },
  danger: { bg: '#881337', color: '#fb7185' },
  info: { bg: '#172554', color: '#60a5fa' },
}

export const Badge: React.FC<{ tone?: BadgeTone; children: React.ReactNode }> = ({ tone = 'default', children }) => (
  <View style={[styles.badge, { backgroundColor: BADGE_TONES[tone].bg }]}>
    <Text style={[styles.badgeText, { color: BADGE_TONES[tone].color }]}>{children}</Text>
  </View>
)

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    fontFamily: 'monospace',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.flame,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: { backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginLeft: 6 },
  badgeText: { fontSize: 10, fontWeight: '800' },
})

export const stylesExport = styles