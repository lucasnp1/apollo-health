// Feedback to the team. Signed in, it's stored with the account email; signed out, it opens an email instead
// (the endpoint needs an account).
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { mailto, sendFeedback, SUPPORT_EMAIL, useAccount } from '@/account/auth'
import { Input, Section } from '@/kit'
import { C, F } from '@/theme'
import { CancelButton } from './password'

export default function Feedback() {
  const acc = useAccount()
  const authed = acc.status === 'authed'
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const ok = !!message.trim()

  async function go() {
    if (!ok || busy) return
    if (!authed) return void Linking.openURL(mailto('Magno feedback', message))
    setBusy(true)
    setError('')
    try {
      await sendFeedback(message)
      setSent(true)
    } catch (e) {
      setError((e as Error).message || "Couldn't send it. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Send feedback' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {sent ? (
          <>
            <Text style={f.lead}>Thanks! Every message is read. If it needs a reply, it goes to {acc.status === 'authed' ? acc.user.email : 'your email'}.</Text>
            <Pressable style={f.primary} onPress={() => router.back()} accessibilityRole="button">
              <Text style={f.primaryText}>Done</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Section
              title="Message"
              hint={authed ? 'A bug, an idea, something missing. Your account email is sent with it.' : `You're not signed in, so Send opens an email to ${SUPPORT_EMAIL}.`}
            >
              <Input value={message} onChangeText={setMessage} placeholder="What's on your mind?" multiline maxLength={4000} style={{ minHeight: 140, textAlignVertical: 'top' }} autoFocus />
            </Section>
            {error ? <Text style={f.error}>{error}</Text> : null}
            <Pressable onPress={go} disabled={!ok || busy} style={[f.primary, (!ok || busy) && { opacity: 0.45 }]} accessibilityRole="button">
              <Text style={f.primaryText}>{busy ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  )
}

const f = StyleSheet.create({
  lead: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 22 },
  error: { fontFamily: F.medium, fontSize: 14, color: C.danger },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
})
