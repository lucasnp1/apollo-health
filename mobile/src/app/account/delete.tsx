// Delete the account: everything in it on the server, and everything on this phone. The password is asked again so
// a borrowed, signed-in phone can't wipe someone's history. Apple 5.1.1(v).
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { deleteAccount, deleteAccountWithApple, deleteAccountWithGoogle, useAccount } from '@/account/auth'
import { Input, Section } from '@/kit'
import { C, F } from '@/theme'

export default function DeleteAccount() {
  const acc = useAccount()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // An account made with Apple or Google has no password: the provider confirms it's them instead
  const noPassword = acc.status === 'authed' && acc.user.has_password === false
  const via = noPassword ? (acc.user.apple ? 'Apple' : acc.user.google ? 'Google' : undefined) : undefined
  const viaApple = !!via

  async function go() {
    if ((!viaApple && !password) || busy) return
    setBusy(true)
    setError('')
    try {
      if (via ? await (via === 'Apple' ? deleteAccountWithApple() : deleteAccountWithGoogle()) : (await deleteAccount(password), true)) router.back()
    } catch (e) {
      setError((e as Error).message || "Couldn't delete the account. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Delete account',
        }}
      />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={d.lead}>
          This permanently deletes {acc.status === 'authed' ? acc.user.email : 'your account'} and everything in it: every injection, reading,
          check-in and blood test, from our server and this phone. It can't be undone. A Magno Pro subscription is billed by Apple, so cancel it in Settings, under your name, then Subscriptions.
        </Text>
        <Text style={d.small}>Want a copy first? Export everything from You before you delete.</Text>
        {viaApple ? (
          <Text style={d.small}>{via === 'Apple' ? 'Apple will ask you to confirm with Face ID. Your Apple sign-in for Magno is removed too.' : 'Google will ask you to pick the account to confirm.'}</Text>
        ) : (
          <Section title="Password">
            <Input value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry textContentType="password" autoComplete="current-password" />
          </Section>
        )}
        {error ? <Text style={d.error}>{error}</Text> : null}
        <Pressable onPress={go} disabled={(!viaApple && !password) || busy} style={[d.danger, ((!viaApple && !password) || busy) && { opacity: 0.45 }]} accessibilityRole="button">
          <Text style={d.dangerText}>{busy ? 'Deleting…' : via ? `Confirm with ${via} and delete` : 'Delete my account'}</Text>
        </Pressable>
      </ScrollView>
    </>
  )
}

const d = StyleSheet.create({
  lead: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 22 },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  error: { fontFamily: F.medium, fontSize: 14, color: C.danger },
  danger: { backgroundColor: C.danger, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  dangerText: { fontFamily: F.semi, fontSize: 17, color: '#fff' },
})
