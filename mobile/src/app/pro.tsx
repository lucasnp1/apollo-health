// Magno Pro. Apple's rules for a subscription paywall are all here: what it unlocks, each plan's price and length,
// restore, and the terms and privacy links.
import { router, Stack, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Card } from '@/kit'
import { LEGAL, type PlanId, PLANS, PRO_FEATURES } from '@/money/plans'
import { buy, LIVE, manageSubscription, restore, type StorePlans, storePlans, usePro } from '@/money/pro'
import { C, F } from '@/theme'

export default function ProScreen() {
  const { feature } = useLocalSearchParams<{ feature?: string }>()
  const pro = usePro()
  const [plans, setPlans] = useState<StorePlans | null>(null)
  const [busy, setBusy] = useState<PlanId | 'restore' | null>(null)
  useEffect(() => void storePlans().then(setPlans, () => setPlans(null)), [])

  const purchase = async (id: PlanId) => {
    const pkg = plans?.[id]
    if (!pkg) return Alert.alert('Not on sale yet', 'Magno Pro is free for everyone while the app is new.')
    setBusy(id)
    try {
      if (await buy(pkg)) router.back()
    } catch (e) {
      Alert.alert("The purchase didn't go through", String((e as Error)?.message ?? e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Magno Pro',
          headerLeft: () => (
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <Text style={{ fontFamily: F.medium, fontSize: 17, color: C.muted }}>Close</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 22 }}>
        {feature ? <Text style={p.lead}>{feature} is part of Magno Pro.</Text> : null}
        <Card style={{ gap: 12 }}>
          {PRO_FEATURES.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={p.tick}>✓</Text>
              <Text style={p.feature}>{f}</Text>
            </View>
          ))}
        </Card>
        <Text style={p.small}>Logging, charts, results typed in by hand and exporting your data are free, always.</Text>

        {pro && LIVE ? (
          <Card style={{ gap: 10 }}>
            <Text style={p.feature}>You have Magno Pro.</Text>
            <Pressable onPress={() => void manageSubscription()}>
              <Text style={p.link}>Manage or cancel</Text>
            </Pressable>
          </Card>
        ) : !LIVE ? (
          <Card>
            <Text style={p.feature}>Magno Pro is free for everyone while the app is new. Enjoy it.</Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {(Object.keys(PLANS) as PlanId[]).map((id) => {
              const plan = PLANS[id]
              const store = plans?.[id]?.product
              return (
                <Pressable key={id} onPress={() => void purchase(id)} disabled={!!busy} style={[p.plan, id === 'monthly' && p.planMain, busy && { opacity: 0.6 }]} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={p.planName}>{plan.name}</Text>
                    {plan.note ? <Text style={p.note}>{plan.note}</Text> : null}
                  </View>
                  <Text style={p.price}>
                    {store?.priceString ?? plan.price}
                    <Text style={p.per}> {plan.per}</Text>
                  </Text>
                </Pressable>
              )
            })}
            <Text style={p.small}>
              Monthly renews every month until you cancel, at least 24 hours before it renews, in Settings &gt; Apple ID &gt; Subscriptions.
              Lifetime is paid once.
            </Text>
          </View>
        )}

        <View style={p.links}>
          <Pressable
            disabled={!!busy}
            onPress={async () => {
              setBusy('restore')
              const back = await restore().catch(() => false)
              setBusy(null)
              Alert.alert(back ? 'Magno Pro is back' : 'Nothing to restore', back ? undefined : 'No Magno Pro purchase was found for this Apple ID.')
            }}
          >
            <Text style={p.link}>Restore purchases</Text>
          </Pressable>
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(LEGAL.terms)}>
            <Text style={p.link}>Terms</Text>
          </Pressable>
          <Pressable onPress={() => void WebBrowser.openBrowserAsync(LEGAL.privacy)}>
            <Text style={p.link}>Privacy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  )
}

const p = StyleSheet.create({
  lead: { fontFamily: F.semi, fontSize: 17, color: C.fg },
  tick: { fontFamily: F.bold, fontSize: 15, color: C.primary },
  feature: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 21 },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.input, backgroundColor: C.card },
  planMain: { borderColor: 'rgba(251,182,54,0.5)', backgroundColor: 'rgba(251,182,54,0.06)' },
  planName: { fontFamily: F.semi, fontSize: 17, color: C.fg },
  note: { fontFamily: F.medium, fontSize: 13, color: C.accentInk, marginTop: 2 },
  price: { fontFamily: F.monoSemi, fontSize: 17, color: C.fg },
  per: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingVertical: 6 },
  link: { fontFamily: F.semi, fontSize: 14, color: C.accentInk },
})
