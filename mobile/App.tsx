import React, { useCallback, useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from './src/theme'
import { LoginScreen, type MobileSession } from './src/screens/LoginScreen'
import { AttendantDashboard } from './src/screens/AttendantDashboard'
import { SupervisorConsole } from './src/screens/supervisor/SupervisorConsole'
import { mobileAuth } from './src/core/services/authService'

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
      const auth = await mobileAuth.restore()
      if (auth) {
        setSession({
          role: auth.role,
          userId: auth.session.userId,
          fullName: auth.session.fullName,
          employeeCode: auth.session.employeeCode,
          stationId: auth.session.stationId,
          stationName: auth.session.stationName,
          companyId: auth.session.companyId,
          companyShortCode: auth.session.companyShortCode,
        })
      }
    } catch (err) {
      setStartupError(err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    let completed = false
    void restore().finally(() => {
      completed = true
    })
    // Watchdog: surface an explicit error if restore hangs unexpectedly.
    const watchdog = setTimeout(() => {
      if (!completed) {
        setStartupError('Startup timed out. Please check your network connection and retry.')
        setReady(true)
      }
    }, 12000)
    return () => clearTimeout(watchdog)
  }, [restore])

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.splash}>
          <StatusBar style="light" />
          <View style={styles.splashLogo}>
            <Text style={styles.splashLogoText}>MVP</Text>
          </View>
          <Text style={styles.splashTitle}>Master View Petroleum</Text>
          <Text style={styles.splashSub}>Connecting securely…</Text>
        </View>
      </SafeAreaProvider>
    )
  }

  if (startupError) {
    return (
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    )
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar style="light" />
          <LoginScreen onAuthenticated={s => setSession(s)} />
        </ErrorBoundary>
      </SafeAreaProvider>
    )
  }

  const handleSignOut = async () => {
    await mobileAuth.logout()
    setSession(null)
  }

  const renderDashboard = () => {
    if (session.role === 'supervisor') {
      return <SupervisorConsole session={session} onSignOut={handleSignOut} />
    }
    return <AttendantDashboard session={session} onSignOut={handleSignOut} />
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar style="light" />
        {renderDashboard()}
      </ErrorBoundary>
    </SafeAreaProvider>
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