// Before anything leaves the phone: a separate, explicit yes to storing the health log on Magno's servers (GDPR
// Art. 9(2)(a)), apart from the Terms. Shown once after signing in, for any account without it yet. No means signed
// out with the log kept on this phone; the person can sign in and say yes later.
import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { giveConsent, signOut } from '@/account/auth'
import { syncNow } from '@/account/sync'
import { Card, Eyebrow } from '@/kit'
import { C, F } from '@/theme'

const STORED = ['Your injections, ancillaries and the notes on them', 'Your blood tests and lab results', 'Weight, blood pressure, pulse and check-ins', 'Your compounds, lab targets and blood-letting entries']

export default function Consent() {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)

  async function yes() {
    setBusy('yes')
    try {
      await giveConsent()
      void syncNow()
      router.back()
    } catch (e) {
      Alert.alert("Couldn't save that", (e as Error).message || 'Check your connection and try again.')
      setBusy(null)
    }
  }

  async function no() {
    setBusy('no')
    await signOut(async () => {}, { keepOnPhone: true })
    router.back()
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, gap: 22 }}>
      <View style={{ gap: 8 }}>
        <Text style={c.h1}>Back up your health log?</Text>
        <Text style={c.body}>
          Your account can keep a copy of your log on Magno's servers, so it's backed up and the same on your other devices. This is health
          information, so we only store it if you say yes.
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>What is stored</Eyebrow>
        <Card style={{ gap: 10 }}>
          {STORED.map((s) => (
            <Text key={s} style={c.item}>{s}</Text>
          ))}
        </Card>
        <Text style={c.small}>
          Kept on Cloudflare's servers, sent encrypted, used only to back up and sync your own log. Never sold, never shared for ads, never used to
          profile you. Lab files you import are read on this phone and never uploaded.
        </Text>
      </View>

      <Text style={c.small}>
        You can stop any time by deleting your account in You: the account and everything stored with it are deleted. Export everything first if you want to keep a copy. Details in the Privacy policy.
      </Text>

      <View style={{ gap: 10 }}>
        <Pressable onPress={yes} disabled={!!busy} style={({ pressed }) => [c.primary, (pressed || busy === 'yes') && { opacity: 0.8 }]} accessibilityRole="button">
          <Text style={c.primaryText}>{busy === 'yes' ? 'Saving…' : 'Yes, back up my health log'}</Text>
        </Pressable>
        <Pressable onPress={no} disabled={!!busy} style={({ pressed }) => [c.secondary, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <Text style={c.secondaryText}>No, keep it on this phone only</Text>
        </Pressable>
        <Text style={[c.small, { textAlign: 'center' }]}>No signs you out. Your log stays on this phone, and you can sign in again later.</Text>
      </View>
    </ScrollView>
  )
}

const c = StyleSheet.create({
  h1: { fontFamily: F.semi, fontSize: 26, letterSpacing: -0.4, color: C.fg },
  body: { fontFamily: F.body, fontSize: 16, lineHeight: 23, color: C.muted },
  item: { fontFamily: F.medium, fontSize: 15, color: C.fg },
  small: { fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.muted },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.primaryFg },
  secondary: { minHeight: 52, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryText: { fontFamily: F.semi, fontSize: 16, color: C.fg },
})
