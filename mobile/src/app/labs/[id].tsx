// One blood test: every result as the lab printed it, by section, against the lab's own range, with the previous
// result for the same marker when there is one. Facts only; no reading of what they mean (see docs/decisions.md).
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { ActionSheetIOS, Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { setExamArchived } from '@shared/lib/archive'
import { fmtDay } from '@shared/lib/dates'
import { prevText, printedValue, type TestMarker } from '@shared/lib/labTests'
import { fmtRange } from '@shared/lib/labRules'
import { SECTION_ORDER } from '@shared/lib/markers'
import { useTests } from '@/labs/useTests'
import { Eyebrow } from '@/kit'
import { C, F } from '@/theme'

export default function TestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const test = useTests()?.find((t) => String(t.id) === id)

  const sections = SECTION_ORDER.map((title) => ({ title, data: test?.markers.filter((m) => m.section === title) ?? [] })).filter((s) => s.data.length)

  const more = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Archive this test', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: 'dark', message: 'An archived test leaves Labs and charts. It is kept, and can be brought back.' },
      (i) => {
        if (i !== 0 || !test) return
        void setExamArchived(test.id, true).then(() => router.back(), console.error)
      },
    )

  return (
    <>
      <Stack.Screen
        options={{
          title: test?.title ?? 'Blood test',
          headerRight: () => (
            <Pressable hitSlop={12} onPress={more} accessibilityLabel="More">
              <Text style={{ fontFamily: F.semi, fontSize: 22, color: C.primary, marginTop: -6 }}>…</Text>
            </Pressable>
          ),
        }}
      />
      <SectionList
        style={{ backgroundColor: C.bg }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
        sections={sections}
        keyExtractor={(m) => String(m.resultId)}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={test ? <Text style={d.date}>{[fmtDay(test.date), test.provider].filter(Boolean).join(' · ')}</Text> : null}
        renderSectionHeader={({ section }) => <Eyebrow style={{ marginTop: 22, marginBottom: 8 }}>{section.title}</Eyebrow>}
        renderItem={({ item, index }) => <Row m={item} first={index === 0} />}
        renderSectionFooter={() => <View style={d.foot} />}
      />
    </>
  )
}

function Row({ m, first }: { m: TestMarker; first: boolean }) {
  const open = () => router.push({ pathname: '/labs/marker/[key]', params: { key: m.key } })
  const flag = m.labFlag === 'high' ? 'Above range' : m.labFlag === 'low' ? 'Below range' : undefined
  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [d.row, first && d.first, pressed && { opacity: 0.75 }]}>
      {first ? null : <View style={d.sep} />}
      <View style={d.line}>
        <Text style={d.label} numberOfLines={2}>{m.label}</Text>
        <Text style={[d.value, flag && { color: C.warn }]}>
          {printedValue(m)}
          <Text style={d.unit}> {m.unit}</Text>
        </Text>
      </View>
      <View style={d.line}>
        <Text style={d.meta}>Lab range {fmtRange(m.low, m.high).replace('No range printed', 'not printed')}</Text>
        {flag ? <Text style={[d.meta, { color: C.warn }]}>{flag}</Text> : null}
      </View>
      {m.prev ? <Text style={d.meta}>Before: {prevText(m.prev)} {m.prev.unit} on {fmtDay(m.prev.date)}</Text> : null}
    </Pressable>
  )
}

const d = StyleSheet.create({
  date: { fontFamily: F.mono, fontSize: 13, color: C.muted, marginTop: 4 },
  row: { backgroundColor: C.card, paddingHorizontal: 14, paddingBottom: 12, gap: 4, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginBottom: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { flex: 1, fontFamily: F.medium, fontSize: 16, color: C.fg },
  value: { fontFamily: F.monoSemi, fontSize: 16, color: C.fg },
  unit: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  meta: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  foot: { height: 4, backgroundColor: C.card, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: C.line },
})
