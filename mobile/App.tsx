import React, { useCallback, useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from './src/theme'
import { LoginScreen, type MobileSession } from './src/screens/LoginScreen'
import { AttendantDashboard } from './src/screens/AttendantDashboard'
import { SupervisorConsole } from './src/screens/supervisor/SupervisorConsole'
import { HeadOfficeDashboard } from './src/screens/HeadOfficeDashboard'
import { SuperAdminDashboard } from './src/screens/SuperAdminDashboard'
import { mobileAuth } from './src/core/services/authService'
import { seedProductionData } from './src/core/infra/repositories'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null }

  static getDerivedStateFromError(err: unknown): { error: string } {
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  }

  render() {
    if (this.state.error) {
      return <StartupErrorView message={this.state.error} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}

function StartupErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorRoot}>
      <Text style={styles.errorTitle}>App error</Text>
      <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ paddingVertical: 8 }}>
        <Text style={styles.errorBody}>{message}</Text>
      </ScrollView>
      <TouchableOpacity style={styles.retry} onPress={onRetry}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function App() {
  const [session, setSession] = useState<MobileSession | null>(null)
  const [ready, setReady] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)

  const restore = useCallback(async () => {
    try {
      await seedProductionData()
      const auth = await mobileAuth.restore()
      if (auth && (auth.attendant || auth.supervisor)) {
        const info =
          auth.role === 'supervisor' || auth.role === 'headoffice' || auth.role === 'superadmin'
            ? auth.supervisor
            : auth.attendant
        if (info) {
          setSession({
            role: auth.role,
            fullName: info.fullName,
            employeeCode: info.employeeCode,
            stationId: info.stationId ?? null,
            stationName: undefined,
            companyShortCode: info.companyShortCode ?? null,
          })
        }
      }
    } catch (err) {
      setStartupError(err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void restore()
    // Watchdog: no matter what, surface something visible so the user is
    // never stuck on a black screen (e.g. if AsyncStorage hangs on a device).
    const watchdog = setTimeout(() => setReady(true), 8000)
    return () => clearTimeout(watchdog)
  }, [restore])

  if (!ready) {
    // Never return null here — a blank root view is exactly the "black screen"
    // users hit. Always render a visible branded splash while startup runs.
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <View style={styles.splashLogo}>
          <Text style={styles.splashLogoText}>MVP</Text>
        </View>
        <Text style={styles.splashTitle}>Master View Petroleum</Text>
        <Text style={styles.splashSub}>Starting local forecourt…</Text>
      </View>
    )
  }

  if (startupError) {
    return (
      <View style={styles.errorRoot}>
        <Text style={styles.errorTitle}>Startup error</Text>
        <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingVertical: 8 }}>
          <Text style={styles.errorBody}>{startupError}</Text>
        </ScrollView>
        <TouchableOpacity
          style={styles.retry}
          onPress={() => {
            setStartupError(null)
            setReady(false)
            void restore()
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!session) {
    return (
      <ErrorBoundary>
        <StatusBar style="light" />
        <LoginScreen onAuthenticated={s => setSession(s)} />
      </ErrorBoundary>
    )
  }

  const handleSignOut = async () => {
    await mobileAuth.logout()
    setSession(null)
  }

  const renderDashboard = () => {
    switch (session.role) {
      case 'superadmin':
        return <SuperAdminDashboard session={session} onSignOut={handleSignOut} />
      case 'headoffice':
        return <HeadOfficeDashboard session={session} onSignOut={handleSignOut} />
      case 'supervisor':
        return <SupervisorConsole session={session} onSignOut={handleSignOut} />
      case 'attendant':
      default:
        return <AttendantDashboard session={session} onSignOut={handleSignOut} />
    }
  }

  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      {renderDashboard()}
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: { color: '#f87171', fontSize: 16, fontWeight: '900', marginBottom: 12 },
  errorBody: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  retry: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.emerald,
  },
  retryText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 24,
  },
  splashLogo: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  splashLogoText: { color: '#ffffff', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  splashTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  splashSub: { color: colors.textFaint, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
})