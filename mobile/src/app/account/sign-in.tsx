// Sign in, create an account, or reset a forgotten password with a recovery code (the account's own way back in:
// there's no email reset yet).
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { passwordOk } from '@shared/lib/password'
import { resetWithCode, signIn, signUp } from '@/account/auth'
import { syncNow } from '@/account/sync'
import { setCodes } from '@/account/codes'
import { Input, Section, Segmented } from '@/kit'
import { C, F } from '@/theme'

type Mode = 'in' | 'up' | 'reset'

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const strong = passwordOk(password)
  const ok = email.includes('@') && (mode === 'in' ? !!password : strong) && (mode !== 'reset' || code.trim().length > 3)

  async function go() {
    if (!ok || busy) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'up') {
        const codes = await signUp(email, password)
        void syncNow()
        if (codes.length) {
          setCodes(codes)
          return router.replace('/account/codes')
        }
      } else {
        await (mode === 'in' ? signIn(email, password) : resetWithCode(email, code, password))
        void syncNow()
      }
      router.back()
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: mode === 'up' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Sign in',
          headerLeft: () => (
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <Text style={{ fontFamily: F.medium, fontSize: 17, color: C.muted }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {mode !== 'reset' ? (
          <Segmented value={mode} onChange={(m) => (setMode(m), setError(''))} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }]} />
        ) : null}
        <Section title="Email">
          <Input value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="email" />
        </Section>
        {mode === 'reset' ? (
          <Section title="Recovery code" hint="One of the codes you saved when you created the account. Each works once.">
            <Input value={code} onChangeText={setCode} placeholder="XXXX-XXXX" autoCapitalize="characters" autoCorrect={false} />
          </Section>
        ) : null}
        <Section
          title={mode === 'reset' ? 'New password' : 'Password'}
          hint={mode !== 'in' ? (password && !strong ? 'At least 10 characters, with upper and lower case letters and a number.' : 'At least 10 characters, with upper and lower case letters and a number.') : undefined}
        >
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            textContentType={mode === 'in' ? 'password' : 'newPassword'}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            onSubmitEditing={go}
          />
        </Section>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable onPress={go} disabled={!ok || busy} style={[s.primary, (!ok || busy) && { opacity: 0.45 }]} accessibilityRole="button">
          <Text style={s.primaryText}>{busy ? 'One moment…' : mode === 'up' ? 'Create account' : mode === 'reset' ? 'Reset and sign in' : 'Sign in'}</Text>
        </Pressable>
        {mode === 'in' ? (
          <Pressable onPress={() => (setMode('reset'), setError(''))} hitSlop={8}>
            <Text style={s.link}>Forgot your password?</Text>
          </Pressable>
        ) : mode === 'reset' ? (
          <Pressable onPress={() => (setMode('in'), setError(''))} hitSlop={8}>
            <Text style={s.link}>Back to sign in</Text>
          </Pressable>
        ) : (
          <Text style={s.small}>
            Anything already on this phone is added to your new account. By creating an account you agree to the Terms and the Privacy policy (in You).
          </Text>
        )}
      </ScrollView>
    </>
  )
}

const s = StyleSheet.create({
  error: { fontFamily: F.medium, fontSize: 14, color: C.danger },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
  link: { fontFamily: F.semi, fontSize: 15, color: C.accentInk, textAlign: 'center' },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
})
