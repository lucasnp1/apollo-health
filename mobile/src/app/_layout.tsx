// one file per weight, so only these get bundled
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular'
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium'
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold'
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold'
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular'
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium'
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold'
import { useFonts } from 'expo-font'
import { DarkTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { loadData } from '@/data/persist'
import { C, F } from '@/theme'

SplashScreen.preventAutoHideAsync()

const THEME = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.fg, primary: C.primary, border: C.line } }

// A log sheet: native page sheet with its own header (Cancel, the title, Save)
const LOG = {
  presentation: 'modal',
  headerShown: true,
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
  useEffect(() => void loadData().catch(console.error).finally(() => setLoaded(true)), [])
  const ready = fonts && loaded
  useEffect(() => void (ready && SplashScreen.hideAsync()), [ready])
  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={THEME}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="log/injection" options={{ ...LOG, title: 'Injection' }} />
        <Stack.Screen name="log/weight" options={{ ...LOG, title: 'Weight' }} />
        <Stack.Screen name="log/bp" options={{ ...LOG, title: 'Blood pressure' }} />
        <Stack.Screen name="log/checkin" options={{ ...LOG, title: 'Check-in' }} />
        <Stack.Screen name="labs/edit" options={{ ...LOG, title: 'Blood test' }} />
        <Stack.Screen name="labs/[id]" options={{ ...PUSH, headerBackTitle: 'Labs' }} />
        <Stack.Screen name="labs/marker/[key]" options={PUSH} />
      </Stack>
    </ThemeProvider>
    </GestureHandlerRootView>
  )
}
