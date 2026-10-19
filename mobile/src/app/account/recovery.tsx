// Recovery codes: how many are left, and a fresh set (the password is asked again; the old codes stop working).
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { recoveryStatus, regenerateCodes } from '@/account/auth'
import { setCodes } from '@/account/codes'
import { Card, Input, Section } from '@/kit'
import { C, F } from '@/theme'

export default function Recovery() {
  const [status, setStatus] = useState<{ remaining: number; total: number } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    recoveryStatus().then(setStatus, () => setLoadError(true))
  }, [])

  async function go() {
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      setCodes(await regenerateCodes(password))
      router.replace('/account/codes')
    } catch (e) {
      setError((e as Error).message || "Couldn't make new codes. Try again.")
      setBusy(false)
    }
  }

  const low = status && status.remaining <= 2
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Card style={{ gap: 6 }}>
        <Text style={[k.count, low && { color: C.warn }]}>
          {status ? `${status.remaining} of ${status.total} left` : loadError ? "Couldn't check" : 'Checking…'}
        </Text>
        <Text style={k.small}>
          {loadError ? 'Check your connection and try again.' : 'If you forget your password, one of these codes gets you back in. Each works once.'}
        </Text>
      </Card>
      {asking ? (
        <>
          <Section title="Password" hint="Making new codes means the old ones stop working.">
            <Input value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry textContentType="password" autoComplete="current-password" autoFocus onSubmitEditing={go} />
          </Section>
          {error ? <Text style={k.error}>{error}</Text> : null}
          <Pressable onPress={go} disabled={!password || busy} style={[k.primary, (!password || busy) && { opacity: 0.45 }]} accessibilityRole="button">
            <Text style={k.primaryText}>{busy ? 'One moment…' : 'Make new codes'}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => setAsking(true)} style={k.primary} accessibilityRole="button">
          <Text style={k.primaryText}>Make new codes</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}

const k = StyleSheet.create({
  count: { fontFamily: F.semi, fontSize: 22, color: C.fg },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  error: { fontFamily: F.medium, fontSize: 14, color: C.danger },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
})
