// You: the account (optional; it backs up and syncs with magno.fit), your data, and the small print.
import { formatDistanceToNow } from 'date-fns'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { signOut, useAccount } from '@/account/auth'
import { syncNow, useSyncState } from '@/account/sync'
import { exportAll } from '@/exportData'
import { Card, Eyebrow } from '@/kit'
import { C, F } from '@/theme'

export default function You() {
  const insets = useSafeAreaInsets()
  const acc = useAccount()
  const sync = useSyncState()

  const out = () =>
    Alert.alert('Sign out?', 'Your data stays in your account and comes back when you sign in again. It is removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut(syncNow).catch((e) => Alert.alert("Couldn't sign out", String(e?.message ?? e))) },
    ])

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90, gap: 28 }}>
      <View>
        <Eyebrow>Settings</Eyebrow>
        <Text style={y.h1}>You</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Account</Eyebrow>
        {acc.status === 'authed' ? (
          <Card style={{ paddingVertical: 4 }}>
            <Row label="Signed in as" value={acc.user.email} />
            <Row
              label="Sync"
              value={sync.running ? 'Syncing…' : sync.error ? "Couldn't sync" : sync.lastAt ? `Synced ${formatDistanceToNow(sync.lastAt, { addSuffix: true })}` : 'Not yet'}
              tone={sync.error ? C.warn : undefined}
              onPress={() => void syncNow()}
              action="Sync now"
            />
            <Row label="Sign out" onPress={out} danger />
            <Row label="Delete account" onPress={() => router.push('/account/delete')} danger last />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={y.body}>Everything you log is kept on this phone. With a Magno account it's also backed up, and the same on magno.fit and your other devices.</Text>
            <Pressable style={y.primary} onPress={() => router.push('/account/sign-in')} accessibilityRole="button">
              <Text style={y.primaryText}>Sign in or create an account</Text>
            </Pressable>
          </Card>
        )}
        {sync.error && acc.status === 'authed' ? <Text style={y.small}>{sync.error}</Text> : null}
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Your data</Eyebrow>
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Export everything" value="JSON file" onPress={() => void exportAll().catch((e) => Alert.alert("Couldn't export", String(e?.message ?? e)))} last />
        </Card>
        <Text style={y.small}>Export is free, always. Your data is yours.</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>About</Eyebrow>
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Privacy policy" onPress={() => void WebBrowser.openBrowserAsync('https://magno.fit/privacy.html')} />
          <Row label="Terms" onPress={() => void WebBrowser.openBrowserAsync('https://magno.fit/terms.html')} last />
        </Card>
        <Text style={y.small}>
          Magno is a log. It records what you did and what your tests measured, and never tells you what to take or how much. Talk to your
          doctor about your treatment.
        </Text>
        <Text style={y.small}>Version {Constants.expoConfig?.version} ({Constants.expoConfig?.ios?.buildNumber})</Text>
      </View>
    </ScrollView>
  )
}

function Row({ label, value, onPress, action, danger, tone, last }: { label: string; value?: string; onPress?: () => void; action?: string; danger?: boolean; tone?: string; last?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [y.row, !last && y.sep, pressed && { opacity: 0.7 }]}>
      <Text style={[y.label, danger && { color: C.danger }]}>{label}</Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
        {value ? <Text style={[y.value, tone && { color: tone }]} numberOfLines={1}>{value}</Text> : null}
        {action ? <Text style={y.action}>{action}</Text> : null}
      </View>
    </Pressable>
  )
}

const y = StyleSheet.create({
  h1: { fontFamily: F.semi, fontSize: 32, letterSpacing: -0.6, color: C.fg, marginTop: 6 },
  body: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 21, opacity: 0.9 },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.primaryFg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14 },
  sep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  label: { fontFamily: F.medium, fontSize: 16, color: C.fg },
  value: { fontFamily: F.body, fontSize: 15, color: C.muted },
  action: { fontFamily: F.semi, fontSize: 13, color: C.accentInk, marginTop: 2 },
})
