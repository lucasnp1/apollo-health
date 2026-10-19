// One "What needs a look" row, in full: what it's about, the numbers behind it, why it tends to happen on a protocol,
// The web's copy (src/lib/homeInsights.ts) minus "what people usually do": the iPhone app flags and explains, it never
// says what to do (decided by Lucas for App Review, 19 Oct 2026).
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { currentInsight } from '@/insights/useInsights'
import { Eyebrow } from '@/kit'
import { C, F, TONE, type Tone, toneHex, usePalette } from '@/theme'

export default function InsightScreen() {
  const [i] = useState(currentInsight)
  const pal = usePalette()
  if (!i) return null
  const tone = TONE[(i.tone === 'neutral' ? 'neutral' : i.tone) as Tone]
  return (
    <>
      <Stack.Screen
        options={{
          title: i.area,
        }}
      />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 22 }}>
        <View style={{ gap: 8 }}>
          <View style={[s.chip, { backgroundColor: toneHex(pal, i.tone === 'neutral' ? 'neutral' : (i.tone as Tone)) + '22' }]}>
            <Text style={[s.chipText, { color: tone }]}>{i.chip}</Text>
          </View>
          <Text style={s.title}>{i.title}</Text>
          <Text style={s.sub}>{i.sub}</Text>
        </View>
        {i.summary ? <Text style={s.body}>{i.summary}</Text> : null}
        {i.signals.length ? (
          <View style={{ gap: 4 }}>
            {i.signalsTitle ? <Eyebrow>{i.signalsTitle}</Eyebrow> : null}
            {i.signals.map((sg, n) => {
              const t = sg.tone ? TONE[sg.tone as Tone] : C.faint
              return (
                <View key={sg.label} style={[s.signal, n > 0 && s.sep]}>
                  <View style={s.signalHead}>
                    <View style={[s.dot, { backgroundColor: t }]} />
                    <Text style={s.signalLabel}>{sg.label}</Text>
                    {sg.value ? <Text style={[s.signalValue, sg.tone && { color: t }]}>{sg.value}</Text> : null}
                  </View>
                  {sg.text ? <Text style={s.signalText}>{sg.text}</Text> : null}
                </View>
              )
            })}
          </View>
        ) : null}
        {i.causes?.length ? (
          <View style={{ gap: 8 }}>
            <Eyebrow>Why it happens on a protocol</Eyebrow>
            {i.causes.map((c) => (
              <Text key={c} style={s.bullet}>•  {c}</Text>
            ))}
          </View>
        ) : null}
        {i.testId !== undefined ? (
          <Pressable style={s.button} onPress={() => (router.back(), router.push({ pathname: '/labs/[id]', params: { id: String(i.testId) } }))}>
            <Text style={s.buttonText}>Open the test</Text>
          </Pressable>
        ) : null}
        {i.logBleed ? (
          <Pressable style={[s.button, s.secondary]} onPress={() => (router.back(), router.push('/log/bleed'))}>
            <Text style={[s.buttonText, { color: C.fg }]}>Log a blood-letting</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  )
}

const s = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: F.semi, fontSize: 12 },
  title: { fontFamily: F.semi, fontSize: 24, color: C.fg, letterSpacing: -0.3 },
  sub: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21 },
  body: { fontFamily: F.body, fontSize: 16, color: C.fg, lineHeight: 24, opacity: 0.92 },
  signal: { paddingVertical: 12, gap: 4 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  signalHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  signalLabel: { flex: 1, fontFamily: F.semi, fontSize: 15, color: C.fg },
  signalValue: { fontFamily: F.monoMedium, fontSize: 15, color: C.fg },
  signalText: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20, paddingLeft: 18 },
  bullet: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 22, opacity: 0.92 },
  button: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.input },
  buttonText: { fontFamily: F.semi, fontSize: 16, color: C.primaryFg },
})
