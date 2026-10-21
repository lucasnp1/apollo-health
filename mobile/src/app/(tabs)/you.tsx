// You: the account (optional; it backs up and syncs with magno.fit), your data, and the small print.
import { formatDistanceToNow } from 'date-fns'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Alert, type ColorValue, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { signOut, useAccount } from '@/account/auth'
import { syncNow, useSyncState } from '@/account/sync'
import { exportAll } from '@/exportData'
import { disableHealth, enableHealth, healthAvailable, useHealth } from '@/health'
import { usePro } from '@/money/pro'
import { type Choice, CHOICE_LABEL, setAppearance, useAppearance } from '@/appearance'
import { Card, Eyebrow, MenuPicker, PageHeader, Pill, useInsets } from '@/kit'
import { setUnits, useUnits } from '@/units'
import { C, F } from '@/theme'

const toggleHealth = (on: boolean) =>
  void (on ? enableHealth() : Promise.resolve(disableHealth())).catch((e) => Alert.alert("Couldn't reach Apple Health", String(e?.message ?? e)))

export default function You() {
  const insets = useInsets()
  const acc = useAccount()
  const sync = useSyncState()
  const pro = usePro()
  const health = useHealth()
  const look = useAppearance()
  const units = useUnits()

  const out = () =>
    Alert.alert('Sign out?', 'Your data stays in your account and comes back when you sign in again. It is removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut(syncNow).catch((e) => Alert.alert("Couldn't sign out", String(e?.message ?? e))) },
    ])

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90, gap: 28 }}>
      <PageHeader eyebrow="Settings" title="You" action={<Pill label="Feedback" icon="bubble.left" onPress={() => router.push('/account/feedback')} />} />

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
            {acc.user.has_password === false ? (
              <Row label="Signed in with" value={acc.user.apple ? 'Apple' : 'Google'} />
            ) : (
              <>
                <Row label="Change password" onPress={() => router.push('/account/password')} />
                <Row label="Recovery codes" value="If you forget your password" onPress={() => router.push('/account/recovery')} />
              </>
            )}
            <Row label="Sign out" onPress={out} last />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={y.body}>Everything you log is kept on this phone. With a Magno account it's also backed up, and the same on your other devices.</Text>
            <Pressable style={y.primary} onPress={() => router.push('/account/sign-in')} accessibilityRole="button">
              <Text style={y.primaryText}>Sign in or create an account</Text>
            </Pressable>
          </Card>
        )}
        {sync.error && acc.status === 'authed' ? <Text style={y.small}>{sync.error}</Text> : null}
      </View>

      {healthAvailable ? (
        <View style={{ gap: 10 }}>
          <Eyebrow>Apple Health</Eyebrow>
          <Card style={{ gap: 6 }}>
            <Pressable style={y.switchRow} onPress={() => toggleHealth(!health.on)} accessibilityRole="switch" accessibilityState={{ checked: health.on }}>
              <Text style={y.label}>Weight and blood pressure</Text>
              <Switch value={health.on} trackColor={{ true: C.primary }} onValueChange={toggleHealth} accessibilityElementsHidden />
            </Pressable>
            <Text style={y.small}>
              {health.on
                ? `What you log goes into Health, and readings from your scale or cuff come in here.${health.lastAt ? ` Last checked ${formatDistanceToNow(health.lastAt, { addSuffix: true })}.` : ''}`
                : 'Send what you log to Apple Health, and bring in readings from a smart scale or a blood pressure cuff.'}
            </Text>
          </Card>
          {health.on ? <Text style={y.small}>Choose exactly what Magno can read and write in the Health app: Profile &gt; Apps &gt; Magno.</Text> : null}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Eyebrow>Reminders and export</Eyebrow>
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Reminders" value="Shots, ancillaries, weight, BP" onPress={() => router.push('/reminders')} />
          <Row label="Export for your doctor" value="PDF or spreadsheet" onPress={() => router.push('/export')} last />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Display</Eyebrow>
        <Card style={{ paddingVertical: 4 }}>
          <View style={[y.row, { paddingVertical: 8 }]}>
            <Text style={y.label}>Appearance</Text>
            <MenuPicker value={look} onChange={setAppearance} options={(Object.keys(CHOICE_LABEL) as Choice[]).map((c) => ({ value: c, label: CHOICE_LABEL[c] }))} />
          </View>
          <View style={[y.row, y.divided, { paddingVertical: 8 }]}>
            <Text style={y.label}>Weight</Text>
            <MenuPicker value={units.weight} onChange={(weight) => setUnits({ weight })} options={[{ value: 'kg', label: 'Kilograms (kg)' }, { value: 'lb', label: 'Pounds (lb)' }]} />
          </View>
          <View style={[y.row, y.divided, { paddingVertical: 8 }]}>
            <Text style={y.label}>Syringe volume</Text>
            <MenuPicker value={units.volume} onChange={(volume) => setUnits({ volume })} options={[{ value: 'mL', label: 'mL' }, { value: 'cc', label: 'cc' }]} />
          </View>
        </Card>
        <Text style={y.small}>Only how they read changes: what you saved stays the same, and doses in mg or tablets are never converted.</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Plan</Eyebrow>
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Magno Pro" value={pro ? 'Active' : 'See what it adds'} onPress={() => router.push('/pro')} last />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>Your data</Eyebrow>
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Archive" value="Bring entries back" onPress={() => router.push('/archive')} />
          <Row label="Export everything" value="JSON file" onPress={() => void exportAll().catch((e) => Alert.alert("Couldn't export", String(e?.message ?? e)))} last />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <Eyebrow>About</Eyebrow>
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Privacy policy" onPress={() => void WebBrowser.openBrowserAsync('https://magno.fit/privacy.html')} />
          <Row label="Terms" onPress={() => void WebBrowser.openBrowserAsync('https://magno.fit/terms.html')} />
          <Row label="Send feedback" onPress={() => router.push('/account/feedback')} last />
        </Card>
        <Text style={y.small}>
          Magno is a log. It records what you did and what your tests measured, and never tells you what to take or how much. Talk to your
          doctor about your treatment.
        </Text>
        <Text style={y.small}>Version {Constants.expoConfig?.version} ({Constants.expoConfig?.ios?.buildNumber})</Text>
      </View>

      {acc.status === 'authed' ? (
        <Pressable onPress={() => router.push('/account/delete')} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [y.deleteLink, pressed && { opacity: 0.6 }]}>
          <Text style={y.deleteText}>Delete account</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function Row({ label, value, onPress, action, danger, tone, last }: { label: string; value?: string; onPress?: () => void; action?: string; danger?: boolean; tone?: ColorValue; last?: boolean }) {
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
  body: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 21, opacity: 0.9 },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.primaryFg },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  sep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  label: { fontFamily: F.medium, fontSize: 16, color: C.fg },
  value: { fontFamily: F.body, fontSize: 15, color: C.muted },
  action: { fontFamily: F.semi, fontSize: 13, color: C.accentInk, marginTop: 2 },
  deleteLink: { alignSelf: 'center', paddingVertical: 8 },
  deleteText: { fontFamily: F.medium, fontSize: 14, color: C.danger },
})
