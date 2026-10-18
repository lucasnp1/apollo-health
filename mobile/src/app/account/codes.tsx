// Shown once, right after sign-up: the codes that reset the password if it's forgotten.
import * as Clipboard from 'expo-clipboard'
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { takeCodes } from '@/account/codes'
import { Card } from '@/kit'
import { C, F } from '@/theme'

export default function Codes() {
  const [codes] = useState(takeCodes)
  const [copied, setCopied] = useState(false)
  return (
    <>
      <Stack.Screen options={{ title: 'Recovery codes', headerBackVisible: false, gestureEnabled: false }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text style={k.lead}>
          Save these somewhere safe, like your password manager. If you forget your password, one of them gets you back in. Each works once, and
          they won't be shown again.
        </Text>
        <Card style={k.grid}>
          {codes.map((c) => (
            <Text key={c} style={k.code} selectable>{c}</Text>
          ))}
        </Card>
        <View style={{ gap: 10 }}>
          <Pressable
            style={k.secondary}
            onPress={() => void Clipboard.setStringAsync(codes.join('\n')).then(() => setCopied(true))}
            accessibilityRole="button"
          >
            <Text style={k.secondaryText}>{copied ? 'Copied' : 'Copy codes'}</Text>
          </Pressable>
          <Pressable style={k.primary} onPress={() => router.back()} accessibilityRole="button">
            <Text style={k.primaryText}>I've saved them</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  )
}

const k = StyleSheet.create({
  lead: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 21, opacity: 0.9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  code: { width: '46%', fontFamily: F.monoMedium, fontSize: 16, color: C.fg, textAlign: 'center', paddingVertical: 6 },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
  secondary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.input },
  secondaryText: { fontFamily: F.semi, fontSize: 16, color: C.fg },
})
