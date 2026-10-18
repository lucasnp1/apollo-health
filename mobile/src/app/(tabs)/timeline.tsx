// Every entry, newest first, by day. Filter by kind; press and hold an entry to archive it (kept and restorable, as on
// the web: Archive is never a delete).
import * as Haptics from 'expo-haptics'
import { useMemo, useState } from 'react'
import { ActionSheetIOS, Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { archiveRow } from '@shared/lib/archive'
import { useBodyMetrics, useCompounds, useInjections, useSymptoms, useVitals } from '@/data/useLog'
import { EventRow } from '@/EventRow'
import { Chips, Eyebrow } from '@/kit'
import { buildEvents, byDay, type Event, KIND_LABEL, type Kind } from '@/timeline'
import { C, F } from '@/theme'

const FILTERS = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))

function archive(e: Event) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  ActionSheetIOS.showActionSheetWithOptions(
    { title: e.title, message: 'Archived entries leave your timeline and charts. They are kept, and you can bring them back.', options: ['Archive', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: 'dark' },
    (i) => void (i === 0 && archiveRow(e.table, e.rowId).catch(console.error)),
  )
}

export default function Timeline() {
  const insets = useSafeAreaInsets()
  const compounds = useCompounds()
  const injections = useInjections()
  const vitals = useVitals()
  const bodyMetrics = useBodyMetrics()
  const symptoms = useSymptoms()
  const [kind, setKind] = useState<Kind | undefined>()

  const all = useMemo(() => buildEvents({ compounds, injections, vitals, bodyMetrics, symptoms }), [compounds, injections, vitals, bodyMetrics, symptoms])
  const sections = useMemo(() => byDay(kind ? all.filter((e) => e.kind === kind) : all), [all, kind])

  return (
    <SectionList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 }}
      sections={sections}
      keyExtractor={(e) => e.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 8 }}>
          <View>
            <Eyebrow>{all.length} entr{all.length === 1 ? 'y' : 'ies'}</Eyebrow>
            <Text style={t.h1}>Timeline</Text>
          </View>
          <Chips options={FILTERS} value={kind} onChange={setKind} clearable />
        </View>
      }
      renderSectionHeader={({ section }) => <Eyebrow style={t.day}>{section.title}</Eyebrow>}
      renderItem={({ item, index }) => (
        <Pressable onLongPress={() => archive(item)} delayLongPress={350} style={({ pressed }) => [t.item, index === 0 && t.first, pressed && { opacity: 0.75 }]}>
          {index ? <View style={t.sep} /> : null}
          <EventRow e={item} />
        </Pressable>
      )}
      renderSectionFooter={() => <View style={t.foot} />}
      ListEmptyComponent={
        <Text style={t.empty}>{kind ? `No ${KIND_LABEL[kind].toLowerCase()} logged yet.` : 'Nothing logged yet. What you log on Home shows up here, newest first.'}</Text>
      }
    />
  )
}

// Each day's rows sit on one card: first row rounds the top, the footer rounds the bottom
const t = StyleSheet.create({
  h1: { fontFamily: F.semi, fontSize: 32, letterSpacing: -0.6, color: C.fg, marginTop: 6 },
  day: { marginTop: 22, marginBottom: 8 },
  item: { backgroundColor: C.card, paddingHorizontal: 14, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2 },
  foot: {
    height: 8, backgroundColor: C.card, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: C.line,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 46 },
  empty: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21, paddingVertical: 24 },
})
