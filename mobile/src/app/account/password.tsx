// Change the password while signed in. The current one is asked again; every other device is signed out after.
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { passwordOk } from '@shared/lib/password'
import { changePassword } from '@/account/auth'
import { Input, Section } from '@/kit'
import { C, F } from '@/theme'

/** The live password checklist (the web's PasswordRules); ticks turn green as each rule is met. */
export function PasswordRules({ password }: { password: string }) {
  const rules: [boolean, string][] = [
    [password.length >= 10, 'At least 10 characters'],
    [/[a-z]/.test(password) && /[A-Z]/.test(password), 'Upper and lowercase letters'],
    [/\d/.test(password), 'A number'],
  ]
  return (
    <View style={{ gap: 4 }}>
      {rules.map(([ok, label]) => (
        <Text key={label} style={[r.rule, ok && { color: C.good }]}>
          <Text style={{ opacity: ok ? 1 : 0.35 }}>✓</Text>  {label}
        </Text>
      ))}
    </View>
  )
}

export default function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const mismatch = !!confirm && confirm !== next
  const ok = !!current && passwordOk(next) && confirm === next

  async function go() {
    if (!ok || busy) return
    setBusy(true)
    setError('')
    try {
      await changePassword(current, next)
      setDone(true)
    } catch (e) {
      setError((e as Error).message || "Couldn't change the password. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Change password' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {done ? (
          <>
            <Text style={r.lead}>Password changed. Any other phone or browser signed in to this account has been signed out.</Text>
            <Pressable style={r.primary} onPress={() => router.back()} accessibilityRole="button">
              <Text style={r.primaryText}>Done</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Section title="Current password">
              <Input value={current} onChangeText={setCurrent} placeholder="Current password" secureTextEntry textContentType="password" autoComplete="current-password" />
            </Section>
            <Section title="New password">
              <Input value={next} onChangeText={setNext} placeholder="New password" secureTextEntry textContentType="newPassword" autoComplete="new-password" />
              <PasswordRules password={next} />
            </Section>
            <Section title="Confirm new password" hint={mismatch ? "The passwords don't match." : undefined}>
              <Input value={confirm} onChangeText={setConfirm} placeholder="New password again" secureTextEntry textContentType="newPassword" autoComplete="new-password" onSubmitEditing={go} />
            </Section>
            {error ? <Text style={r.error}>{error}</Text> : null}
            <Pressable onPress={go} disabled={!ok || busy} style={[r.primary, (!ok || busy) && { opacity: 0.45 }]} accessibilityRole="button">
              <Text style={r.primaryText}>{busy ? 'One moment…' : 'Change password'}</Text>
            </Pressable>
            <Text style={r.small}>Other phones and browsers signed in to this account will be signed out.</Text>
          </>
        )}
      </ScrollView>
    </>
  )
}

const r = StyleSheet.create({
  rule: { fontFamily: F.body, fontSize: 13, color: C.muted },
  lead: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 22 },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  error: { fontFamily: F.medium, fontSize: 14, color: C.danger },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
})
