// Blood-lettings on the Labs tab: venesections and donations, read against hematocrit before and after. The web's
// BleedsCard + bleedRowProps (views/bloods/Bleeds.tsx, bleedFeed.ts).
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Phlebotomy } from '@shared/lib/db'
import { dayOf, daysBetween, fmtDay } from '@shared/lib/dates'
import { bleedEffect, hctSeries, phlebotomyTitle } from '@shared/lib/phlebotomy'
import { Pill, Widget } from '@/kit'
import { useBleeds } from '@/labs/useBleeds'
import { useTests } from '@/labs/useTests'
import { C, F } from '@/theme'

const SHOWN = 3

const ago = (day: string) => {
  const n = daysBetween(day, dayOf(new Date().toISOString()))
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 60 ? `${n} days ago` : `${Math.round(n / 30)} months ago`
}

export function BleedsSection() {
  const bleeds = useBleeds()
  const tests = useTests()
  const [all, setAll] = useState(false)
  const series = useMemo(() => hctSeries(tests ?? []), [tests])
  if (!bleeds || !tests) return null
  if (!bleeds.length && !series.length) return null
  const list = all ? bleeds : bleeds.slice(0, SHOWN)
  return (
    <Widget
      eyebrow="Blood-letting"
      sub={bleeds.length ? 'Venesections and donations, read against your hematocrit' : 'A venesection or donation, so your next test shows what it did'}
      action={<Pill label="+ Log" onPress={() => router.push('/log/bleed' as never)} />}
    >
      {list.length ? (
        <View>
          {list.map((p, i) => <BleedRow key={p.id} p={p} series={series} first={i === 0} />)}
        </View>
      ) : null}
      {bleeds.length > SHOWN ? (
        <Pressable onPress={() => setAll((a) => !a)} accessibilityRole="button" style={({ pressed }) => [b.more, pressed && { opacity: 0.6 }]}>
          <Text style={b.moreText}>{all ? 'Show less' : `Show ${bleeds.length - SHOWN} more`}</Text>
        </Pressable>
      ) : null}
    </Widget>
  )
}

function BleedRow({ p, series, first }: { p: Phlebotomy; series: ReturnType<typeof hctSeries>; first: boolean }) {
  const effect = bleedEffect(p, series)
  const fell = effect.before && effect.after ? effect.after.pct < effect.before.pct : undefined
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/log/bleed', params: { id: String(p.id) } } as never)}
      accessibilityRole="button"
      style={({ pressed }) => [b.row, !first && b.sep, pressed && { opacity: 0.7 }]}
    >
      <Text style={b.title} numberOfLines={1}>{phlebotomyTitle(p)}</Text>
      <Text style={b.sub}>{[fmtDay(p.performedAt), ago(p.performedAt), p.place].filter(Boolean).join(' · ')}</Text>
      {effect.text ? <Text style={[b.effect, { color: fell === true ? C.good : fell === false ? C.warn : C.fg }]}>{effect.text}</Text> : null}
      {p.notes ? <Text style={b.note} numberOfLines={3}>{p.notes}</Text> : null}
    </Pressable>
  )
}

const b = StyleSheet.create({
  row: { gap: 3, paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  title: { fontFamily: F.semi, fontSize: 16, color: C.fg },
  sub: { fontFamily: F.mono, fontSize: 12, color: C.muted, lineHeight: 17 },
  effect: { fontFamily: F.medium, fontSize: 14, lineHeight: 19, marginTop: 2 },
  note: { fontFamily: F.body, fontSize: 14, color: C.fg, opacity: 0.8, lineHeight: 19, marginTop: 2 },
  more: { alignItems: 'center', paddingVertical: 8 },
  moreText: { fontFamily: F.semi, fontSize: 14, color: C.muted },
})
