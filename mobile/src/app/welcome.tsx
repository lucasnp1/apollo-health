// First run: what Magno is, what you inject, Apple Health, reminders and how it looks, one step a screen, every step
// skippable. Shown once (localStorage `magno.onboarded`), from the root layout; You keeps every setting for later.
import * as Haptics from 'expo-haptics'
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { compoundGroups, findCompoundByName, randomDistinctColor } from '@shared/lib/compounds'
import { db } from '@shared/lib/db'
import { type Choice, CHOICE_LABEL, setAppearance, useAppearance } from '@/appearance'
import { useAccount } from '@/account/auth'
import { useCompounds, useInjections } from '@/data/useLog'
import { isAncillary } from '@/timeline'
import { enableHealth, healthAvailable, useHealth } from '@/health'
import { Card, FieldRow, Input, MenuPicker, s as kit, Segmented } from '@/kit'
import Reminders from './reminders'
import { C, F } from '@/theme'

const KEY = 'magno.onboarded'
export const needsOnboarding = () => {
  try {
    return !localStorage.getItem(KEY)
  } catch {
    return false
  }
}
const finish = () => {
  try { localStorage.setItem(KEY, String(Date.now())) } catch {}
  router.back()
}

const STEPS = ['welcome', 'compounds', 'health', 'reminders', 'look'] as const

export default function Welcome() {
  const insets = useSafeAreaInsets()
  const [n, setN] = useState(0)
  const step = STEPS[n]
  const last = n === STEPS.length - 1
  const next = () => {
    void Haptics.selectionAsync()
    if (last) finish()
    else setN(n + 1)
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 12 }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={w.top}>
        <View style={w.dots}>
          {STEPS.map((x, i) => <View key={x} style={[w.dot, i <= n && { backgroundColor: C.primary }]} />)}
        </View>
        {n > 0 && !last ? (
          <Pressable onPress={finish} hitSlop={10} accessibilityRole="button">
            <Text style={w.skip}>Skip setup</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        {step === 'welcome' ? <Intro /> : step === 'compounds' ? <Compounds /> : step === 'health' ? <HealthStep /> : step === 'reminders' ? <RemindersStep /> : <Look />}
      </View>
      <View style={[w.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {n > 0 ? (
          <Pressable onPress={() => setN(n - 1)} style={w.back} accessibilityRole="button">
            <Text style={w.backText}>Back</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={next} style={({ pressed }) => [w.primary, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={w.primaryText}>{n === 0 ? 'Get started' : last ? 'Start using Magno' : 'Continue'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Page({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={{ gap: 8 }}>
        <Text style={w.h1}>{title}</Text>
        <Text style={w.sub}>{sub}</Text>
      </View>
      {children}
    </ScrollView>
  )
}

// Real screens, the same ones as magno.fit's "Take a look inside"
const SLIDES = [
  { img: require('../../assets/onboarding/home.jpg'), title: 'Everything in one place', sub: 'Shots, bloods, pressure, weight and how you feel, on one home.' },
  { img: require('../../assets/onboarding/shot.jpg'), title: 'Log a shot in seconds', sub: 'Dose, what you drew, syringe, needle and site, with rotation.' },
  { img: require('../../assets/onboarding/levels.jpg'), title: 'See every dose', sub: 'Each compound, each shot and its dose, by week or month.' },
  { img: require('../../assets/onboarding/bloods.jpg'), title: 'Your bloods, readable', sub: 'Import a PDF, photo or spreadsheet. Read on your phone.' },
  { img: require('../../assets/onboarding/analysis.jpg'), title: 'Every marker over time', sub: 'Against your lab\'s range, or your own target.' },
  { img: require('../../assets/onboarding/export.jpg'), title: 'Ready for your doctor', sub: 'A clean PDF or spreadsheet of exactly what you choose.' },
]

function Intro() {
  const acc = useAccount()
  const { width, height } = useWindowDimensions()
  const [at, setAt] = useState(0)
  // The phone shot fills most of the screen, keeping the iPhone's own proportions
  const shotH = Math.min(height * 0.5, 470)
  const shotW = shotH * (1320 / 2868)
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 4 }}>
        <Text style={w.h1}>Welcome to Magno</Text>
        <Text style={w.sub}>A private log for your protocol, kept on your phone.</Text>
      </View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flexGrow: 0, marginTop: 18 }}
      >
        {SLIDES.map((sl) => (
          <View key={sl.title} style={{ width, alignItems: 'center', gap: 14 }}>
            <View style={[w.phone, { width: shotW + 12, height: shotH + 12 }]}>
              <Image source={sl.img} style={{ width: shotW, height: shotH, borderRadius: 26 }} resizeMode="cover" accessibilityIgnoresInvertColors />
            </View>
            <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 28 }}>
              <Text style={w.slideTitle}>{sl.title}</Text>
              <Text style={[w.sub, { textAlign: 'center' }]}>{sl.sub}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={w.pager}>
        {SLIDES.map((sl, n) => <View key={sl.title} style={[w.pagerDot, n === at && { backgroundColor: C.fg, width: 16 }]} />)}
      </View>
      <View style={{ paddingHorizontal: 20, gap: 10, marginTop: 'auto', paddingBottom: 8 }}>
        <Text style={[kit.hint, { textAlign: 'center' }]}>Magno is a log, not medical advice. It never works out a dose.</Text>
        {acc.status === 'authed' ? (
          <Text style={[kit.hint, { textAlign: 'center' }]}>Signed in as {acc.user.email}.</Text>
        ) : (
          <Pressable onPress={() => router.push('/account/sign-in')} accessibilityRole="button" style={{ alignSelf: 'center' }}>
            <Text style={w.link}>Already have an account? Sign in</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

/** What you inject: a name and a route each, so the injection sheet knows them from the first shot. */
function Compounds() {
  const compounds = useCompounds()
  const shots = useInjections()
  const [name, setName] = useState('')
  const [route, setRoute] = useState<'IM' | 'SubQ'>('IM')
  async function add() {
    const n = name.trim()
    if (!n) return
    if (findCompoundByName(compounds, n)) return Alert.alert('Already there', `${n} is on your list.`)
    await db.compounds.add({
      name: n, category: 'Other', defaultDose: 0, unit: 'mg', schedule: 'As needed', defaultRoute: route,
      color: randomDistinctColor(compoundGroups(compounds).map((g) => g.color ?? '').filter(Boolean)),
    })
    setName('')
  }
  // Anything you've injected, or a compound that isn't filed as an ancillary (hCG is often filed as one but injected)
  const injected = new Set(shots.filter((i) => !isAncillary(i)).map((i) => i.compoundId))
  const list = compounds.filter((c) => !c.archived && (injected.has(c.id!) || (c.category !== 'Ancillary' && c.category !== 'Supplement')))
  return (
    <Page title="What do you inject?" sub="Add each compound once. Doses come later, when you log a shot. You can skip this.">
      {list.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((c, i) => (
            <View key={c.id} style={[w.row, i > 0 && w.sep]}>
              <View style={[w.cdot, { backgroundColor: c.color }]} />
              <Text style={[w.feature, { flex: 1 }]}>{c.name}</Text>
              <Text style={kit.hint}>{c.defaultRoute === 'SubQ' ? 'Subcutaneous' : c.defaultRoute === 'IM' ? 'Intramuscular' : ''}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <Input placeholder="Name, e.g. Testosterone cypionate" value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void add()} />
      <Segmented value={route} onChange={setRoute} options={[{ value: 'IM', label: 'Intramuscular' }, { value: 'SubQ', label: 'Subcutaneous' }]} />
      <Pressable onPress={() => void add()} disabled={!name.trim()} style={[w.secondary, !name.trim() && { opacity: 0.5 }]} accessibilityRole="button">
        <Text style={w.secondaryText}>Add</Text>
      </Pressable>
    </Page>
  )
}

function HealthStep() {
  const health = useHealth()
  if (!healthAvailable) return <Page title="Apple Health" sub="Apple Health isn't available on this device. You can carry on." />
  return (
    <Page title="Connect Apple Health" sub="Weight from your smart scale and blood pressure from your cuff come in on their own, and what you log goes into Health.">
      {health.on ? (
        <Card><Text style={w.feature}>Connected. Choose what Magno reads and writes in the Health app: Profile &gt; Apps &gt; Magno.</Text></Card>
      ) : (
        <Pressable onPress={() => void enableHealth().catch((e) => Alert.alert("Couldn't reach Apple Health", String(e?.message ?? e)))} style={w.secondary} accessibilityRole="button">
          <Text style={w.secondaryText}>Connect Apple Health</Text>
        </Pressable>
      )}
      <Text style={kit.hint}>Magno never deletes anything in Health, and nothing removed in Health is deleted here. You can turn it off any time in You.</Text>
    </Page>
  )
}

function RemindersStep() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 8 }}>
        <Text style={w.h1}>Reminders</Text>
        <Text style={w.sub}>Turn on the nudges you want. They stay on this phone and never name a drug or a dose.</Text>
      </View>
      <Reminders />
    </View>
  )
}

function Look() {
  const look = useAppearance()
  return (
    <Page title="How it looks" sub="Light, dark, or the same as your phone. Change it any time in You.">
      <FieldRow label="Appearance">
        <MenuPicker value={look} onChange={setAppearance} options={(Object.keys(CHOICE_LABEL) as Choice[]).map((c) => ({ value: c, label: CHOICE_LABEL[c] }))} />
      </FieldRow>
    </Page>
  )
}

const w = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 28 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 22, height: 4, borderRadius: 2, backgroundColor: C.input },
  skip: { fontFamily: F.semi, fontSize: 15, color: C.muted },
  h1: { fontFamily: F.semi, fontSize: 30, letterSpacing: -0.6, color: C.fg },
  sub: { fontFamily: F.body, fontSize: 16, color: C.muted, lineHeight: 22 },
  feature: { fontFamily: F.semi, fontSize: 16, color: C.fg },
  phone: { borderRadius: 32, padding: 6, backgroundColor: C.card, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, boxShadow: '0 18px 40px -12px rgba(0,0,0,0.45)' },
  slideTitle: { fontFamily: F.semi, fontSize: 21, letterSpacing: -0.3, color: C.fg, textAlign: 'center' },
  pager: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16 },
  pagerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.input },
  link: { fontFamily: F.semi, fontSize: 15, color: C.accentInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  cdot: { width: 10, height: 10, borderRadius: 5 },
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 10 },
  primary: { flex: 1, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
  back: { borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, borderWidth: 1, borderColor: C.input },
  backText: { fontFamily: F.semi, fontSize: 17, color: C.fg },
  secondary: { borderRadius: 12, borderWidth: 1, borderColor: C.input, backgroundColor: C.card, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { fontFamily: F.semi, fontSize: 16, color: C.fg },
})
