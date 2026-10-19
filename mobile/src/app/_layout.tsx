// one file per weight, so only these get bundled
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular'
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium'
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold'
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold'
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular'
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium'
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold'
import { useFonts } from 'expo-font'
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { startAccount, useAccount } from '@/account/auth'
import { billingFollowsAccount, startBilling } from '@/money/pro'
import { startSync } from '@/account/sync'
import { loadData } from '@/data/persist'
import { startHealth } from '@/health'
import { startReminders } from '@/reminders'
import { Toaster } from '@/toast'
import { startAppearance } from '@/appearance'
import { C, F, usePalette, useScheme } from '@/theme'

SplashScreen.preventAutoHideAsync()
startAppearance()

// A log sheet: native page sheet with its own header (the X, the title, and the screen's own Save)
const LOG = {
  presentation: 'modal',
  headerShown: true,
  unstable_headerLeftItems: () => [{ type: 'button' as const, label: 'Close', icon: { type: 'sfSymbol' as const, name: 'xmark' as const }, onPress: () => router.back() }],
  headerStyle: { backgroundColor: C.bg },
  headerTitleStyle: { fontFamily: F.semi, color: C.fg },
  headerTintColor: C.primary,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: C.bg },
} as const

// A pushed screen with a native header
const PUSH = { headerShown: true, headerStyle: { backgroundColor: C.bg }, headerTitleStyle: { fontFamily: F.semi, color: C.fg }, headerTintColor: C.primary, headerShadowVisible: false } as const

export default function Root() {
  const [fonts] = useFonts({
    HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold,
  })
  const [loaded, setLoaded] = useState(false)
  // A failed load still opens the app: writes are per row, so nothing already saved gets overwritten
  // Sync starts once the data is in and the account is known; signed out, it does nothing
  useEffect(() => void loadData().catch(console.error).finally(() => {
    setLoaded(true)
    void startAccount().then(() => {
      startSync()
      startBilling()
      startHealth()
      startReminders()
    })
  }), [])
  // purchases belong to the account: RevenueCat signs in and out with it
  const acc = useAccount()
  const who = acc.status === 'authed' ? acc.user.id : acc.status
  useEffect(() => void billingFollowsAccount().catch(console.error), [who])
  const scheme = useScheme()
  const pal = usePalette()
  const base = scheme === 'light' ? DefaultTheme : DarkTheme
  const theme = { ...base, colors: { ...base.colors, background: pal.bg, card: pal.bg, text: pal.fg, primary: pal.primary, border: pal.line } }
  const ready = fonts && loaded
  useEffect(() => void (ready && SplashScreen.hideAsync()), [ready])
  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="log/injection" options={{ ...LOG, title: 'Injection' }} />
        <Stack.Screen name="log/weight" options={{ ...LOG, title: 'Weight' }} />
        <Stack.Screen name="log/bp" options={{ ...LOG, title: 'Blood pressure' }} />
        <Stack.Screen name="log/checkin" options={{ ...LOG, title: 'Check-in' }} />
        <Stack.Screen name="log/ancillary" options={{ ...LOG, title: 'Ancillary' }} />
        <Stack.Screen name="labs/edit" options={{ ...LOG, title: 'Blood test' }} />
        <Stack.Screen name="labs/[id]" options={{ ...PUSH, headerBackTitle: 'Bloods' }} />
        <Stack.Screen name="labs/marker/[key]" options={PUSH} />
        <Stack.Screen name="account/sign-in" options={{ ...LOG, title: 'Sign in' }} />
        <Stack.Screen name="account/codes" options={{ ...LOG, title: 'Recovery codes' }} />
        <Stack.Screen name="account/delete" options={{ ...LOG, title: 'Delete account' }} />
        <Stack.Screen name="pro" options={{ ...LOG, title: 'Magno Pro' }} />
        <Stack.Screen name="reminders" options={{ ...PUSH, title: 'Reminders', headerBackTitle: 'You' }} />
        <Stack.Screen name="export" options={{ ...PUSH, title: 'Export for your doctor', headerBackTitle: 'Back' }} />
        <Stack.Screen name="insight" options={{ ...LOG, title: '' }} />
        <Stack.Screen name="account/password" options={{ ...LOG, title: 'Change password' }} />
        <Stack.Screen name="account/recovery" options={{ ...LOG, title: 'Recovery codes' }} />
        <Stack.Screen name="account/feedback" options={{ ...LOG, title: 'Send feedback' }} />
        <Stack.Screen name="log/bleed" options={{ ...LOG, title: 'Blood-letting' }} />
        <Stack.Screen name="archive" options={{ ...PUSH, title: 'Archive', headerBackTitle: 'You' }} />
        <Stack.Screen name="labs/compare" options={{ ...PUSH, title: 'Compare tests', headerBackTitle: 'Back' }} />
      </Stack>
      <Toaster />
    </ThemeProvider>
    </GestureHandlerRootView>
  )
}
