// One blood test as its own report: what it says overall, when it was drawn against your shots, then every section
// with each result read against the lab's range (and, with Pro, Magno's read: act, watch, expected or fine, why, and
// what people usually do). The read is informational and says so; it never prescribes.
import { SymbolView } from 'expo-symbols'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { setExamArchived } from '@shared/lib/archive'
import { mergeTests } from '@shared/lib/bloodTestsDb'
import { fmtDay } from '@shared/lib/dates'
import { buildFindings, type Finding } from '@shared/lib/labFindings'
import { derivedFor, type LabTest } from '@shared/lib/labTests'
import { SECTION_ORDER, type LabSection } from '@shared/lib/markers'
import { Eyebrow, Widget } from '@/kit'
import { mergeCandidates, phaseLabel, testChip, verdictLine } from '@/labs/reads'
import { MarkerRow, Tag } from '@/labs/ui'
import { useTests } from '@/labs/useTests'
import { usePro } from '@/money/pro'
import { exportTestPdf } from '@/report/export'
import { showToast, withUndo } from '@/toast'
import { unitLabel } from '@/timeline'
import { C, F } from '@/theme'

const DATE_SOURCE: Record<string, string> = {
  report: 'Date from the report',
  'report-date': 'Report date (the draw is usually a day or two earlier)',
  filename: 'Date from the file name',
  user: 'Date you entered',
  'import-time': 'Import day, not the draw: check it',
}

export default function TestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const tests = useTests()
  const pro = usePro()
  const test = tests?.find((t) => String(t.id) === id)
  const findings = useMemo(
    () =>
      test && pro
        ? buildFindings(test.markers.map((m) => ({ id: m.resultId, examId: test.id, marker: m.printedName, value: m.value, rawValue: m.rawValue, unit: m.unit, low: m.low, high: m.high })), [test.exam], test.id)
        : [],
    [test, pro],
  )
  if (!tests) return null
  if (!test) return <Stack.Screen options={{ title: 'Blood test' }} />

  const more = () => {
    const merge = mergeCandidates(test, tests)
    const opts = ['Edit this test', 'Add more results', ...(merge.length ? ['Merge with another test'] : []), ...(tests.length > 1 ? ['Compare with another test'] : []), 'Report for your doctor (PDF)', 'Archive this test', 'Cancel']
    ActionSheetIOS.showActionSheetWithOptions({ options: opts, destructiveButtonIndex: opts.length - 2, cancelButtonIndex: opts.length - 1, userInterfaceStyle: 'dark' }, (i) => {
      const o = opts[i]
      if (o === 'Edit this test') router.push({ pathname: '/labs/edit', params: { mode: 'edit', id: String(test.id) } })
      else if (o === 'Add more results') router.push({ pathname: '/labs/edit', params: { mode: 'add', id: String(test.id) } })
      else if (o === 'Merge with another test') pickMerge(test, merge)
      else if (o === 'Compare with another test') pickCompare(test, tests)
      else if (o === 'Report for your doctor (PDF)') void exportTestPdf(test.id).catch((e) => Alert.alert("Couldn't make the report", String(e?.message ?? e)))
      else if (o === 'Archive this test')
        void withUndo('Test archived', () => setExamArchived(test.id, true), () => setExamArchived(test.id, false)).then(() => router.back())
    })
  }

  const chip = testChip(test, pro)
  const sections = SECTION_ORDER.map((sec) => ({ sec, markers: test.markers.filter((m) => m.section === sec) })).filter((s) => s.markers.length)
  const derived = derivedFor(test)
  const meta = test.exam.meta
  return (
    <>
      <Stack.Screen
        options={{
          title: test.title,
          headerRight: () => (
            <Pressable hitSlop={12} onPress={more} accessibilityLabel="More actions">
              <SymbolView name="ellipsis.circle" tintColor={C.primary} size={24} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 16 }}>
        <Widget
          eyebrow={[fmtDay(test.date), test.provider].filter(Boolean).join(' · ')}
          title={verdictLine(test, pro)}
          sub={[test.dateSource !== 'legacy' && DATE_SOURCE[test.dateSource], meta?.drawTime && `Drawn at ${meta.drawTime}`, meta?.fasted === true ? 'Fasted' : meta?.fasted === false ? 'Not fasted' : undefined]
            .filter(Boolean)
            .join(' · ') || undefined}
          action={chip ? <Tag label={chip.label} tone={chip.tone} /> : undefined}
        >
          {pro ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {test.counts.act ? <Tag label={`${test.counts.act} act`} tone="bad" /> : null}
              {test.counts.watch ? <Tag label={`${test.counts.watch} watch`} tone="warn" /> : null}
              {test.counts.expected ? <Tag label={`${test.counts.expected} expected`} tone="neutral" /> : null}
              {test.counts.fine ? <Tag label={`${test.counts.fine} fine`} tone="good" /> : null}
            </View>
          ) : null}
          {test.needsCheck.map((n) => (
            <Pressable
              key={n}
              onPress={() => (n.startsWith('Same day as') ? pickMerge(test, mergeCandidates(test, tests)) : router.push({ pathname: '/labs/edit', params: { mode: 'edit', id: String(test.id) } }))}
            >
              <Text style={s.warn}>⚠︎  {n}  ·  <Text style={{ textDecorationLine: 'underline' }}>{n.startsWith('Same day as') ? 'Merge' : 'Fix'}</Text></Text>
            </Pressable>
          ))}
          {meta?.conditions?.length ? <Text style={s.meta}>Noted: {meta.conditions.join(', ')}</Text> : null}
          {test.exam.notes ? <Text style={s.note}>{test.exam.notes}</Text> : null}
        </Widget>

        {test.timing.length ? (
          <Widget eyebrow="At the draw" sub={phaseLabel(test) ?? 'Your logged shots before this test'}>
            {test.timing.map((d) => (
              <View key={d.group} style={s.timing}>
                <Text style={s.timingName}>{d.name}</Text>
                <Text style={s.meta}>
                  {d.dose != null ? `${d.dose} ${unitLabel(d.unit)} · ` : ''}
                  {d.daysBefore < 1 ? 'same day' : `${Math.round(d.daysBefore * 10) / 10} days before`}
                  {d.phase ? ` · ${phaseLabel({ ...test, baseline: false, timing: [{ ...d, androgen: true }] })}` : ''}
                </Text>
              </View>
            ))}
          </Widget>
        ) : null}

        {sections.map(({ sec, markers }) => (
          <Section key={sec} sec={sec} test={test} markers={markers} pro={pro} findings={findings.filter((f) => f.section === sec)} />
        ))}

        {derived.length ? (
          <Widget eyebrow="Calculated from this test">
            {derived.map((d) => (
              <View key={d.label} style={s.timing}>
                <Text style={s.timingName}>{d.label}</Text>
                <Text style={s.value}>{d.value}</Text>
              </View>
            ))}
          </Widget>
        ) : null}
        <Text style={s.small}>Results as your lab printed them, against the lab's own range. {pro ? "Magno's read is informational, not medical advice. " : ''}Talk to your doctor about what they mean for you.</Text>
      </ScrollView>
    </>
  )
}

/** One section: count, its read (what the numbers say together, why, what people usually do), then each marker. */
function Section({ sec, test, markers, pro, findings }: { sec: LabSection; test: LabTest; markers: LabTest['markers']; pro: boolean; findings: Finding[] }) {
  const [readOpen, setReadOpen] = useState(false)
  const flagged = markers.filter((m) => (pro ? m.read === 'act' || m.read === 'watch' : m.labFlag === 'high' || m.labFlag === 'low')).length
  const worst = findings.find((f) => f.status === 'bad') ?? findings.find((f) => f.status === 'warn') ?? findings[0]
  return (
    <Widget eyebrow={sec} title={worst?.headline} action={<Tag label={flagged ? `${flagged} of ${markers.length} ${pro ? 'to look at' : 'outside'}` : `${markers.length} marker${markers.length === 1 ? '' : 's'}`} tone={flagged ? 'warn' : 'neutral'} />}>
      {findings.length ? (
        <Pressable onPress={() => setReadOpen((v) => !v)} hitSlop={6}>
          <Text style={s.link}>{readOpen ? 'Hide the read' : 'Read what this means'}</Text>
        </Pressable>
      ) : null}
      {readOpen
        ? findings.map((f) => (
            <View key={f.id} style={s.read}>
              {findings.length > 1 ? <Eyebrow>{f.label}</Eyebrow> : null}
              <Text style={s.story}>{f.story}</Text>
              {f.causes.length ? (
                <>
                  <Text style={s.readHead}>Why it happens on a protocol</Text>
                  {f.causes.map((c) => <Text key={c} style={s.bullet}>•  {c}</Text>)}
                </>
              ) : null}
              {f.practices.length ? (
                <>
                  <Text style={s.readHead}>What people usually do</Text>
                  <Text style={s.small}>Common practice on a protocol, not a recommendation.</Text>
                  {f.practices.map((p, n) => (
                    <Text key={p} style={s.bullet}>
                      <Text style={{ color: C.accentInk, fontFamily: F.mono }}>{n + 1}. </Text>
                      {p}
                    </Text>
                  ))}
                </>
              ) : null}
            </View>
          ))
        : null}
      <View>
        {markers.map((m, i) => (
          <MarkerRow
            key={m.resultId}
            m={m}
            pro={pro}
            printed
            attention={pro && (m.read === 'act' || m.read === 'watch')}
            first={i === 0}
            onPress={() => router.push({ pathname: '/labs/marker/[key]', params: { key: m.key, from: String(test.id) } })}
          />
        ))}
      </View>
    </Widget>
  )
}

function pickMerge(test: LabTest, candidates: LabTest[]) {
  if (!candidates.length) return Alert.alert('Nothing to merge', 'No other test is within two weeks of this one.')
  const opts = [...candidates.map((c) => `${c.title} · ${fmtDay(c.date)} (${c.counts.total} markers)`), 'Cancel']
  ActionSheetIOS.showActionSheetWithOptions(
    { title: 'Merge into this test', message: 'Its results join this one; the other test is archived, so you can bring it back.', options: opts, cancelButtonIndex: opts.length - 1, userInterfaceStyle: 'dark' },
    (i) => {
      const src = candidates[i]
      if (!src) return
      void mergeTests(src.id, test.id).then(
        (undo) => showToast({ message: 'Tests merged', action: { label: 'Undo', run: undo } }),
        (e) => Alert.alert("Couldn't merge", String(e?.message ?? e)),
      )
    },
  )
}

function pickCompare(test: LabTest, tests: LabTest[]) {
  const others = tests.filter((t) => t.id !== test.id)
  const opts = [...others.map((o) => `${o.title} · ${fmtDay(o.date)}`), 'Cancel']
  ActionSheetIOS.showActionSheetWithOptions({ title: 'Compare with', options: opts, cancelButtonIndex: opts.length - 1, userInterfaceStyle: 'dark' }, (i) => {
    const o = others[i]
    if (o) router.push({ pathname: '/labs/compare', params: { a: String(test.id), b: String(o.id) } } as never)
  })
}

const s = StyleSheet.create({
  warn: { fontFamily: F.medium, fontSize: 13, color: C.warn, lineHeight: 19 },
  meta: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  note: { fontFamily: F.body, fontSize: 14, color: C.fg, opacity: 0.85, lineHeight: 20 },
  timing: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 4 },
  timingName: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.fg },
  value: { fontFamily: F.monoMedium, fontSize: 14, color: C.fg },
  link: { fontFamily: F.semi, fontSize: 14, color: C.accentInk },
  read: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.secondary },
  story: { fontFamily: F.body, fontSize: 15, color: C.fg, lineHeight: 22 },
  readHead: { fontFamily: F.semi, fontSize: 13, color: C.muted, marginTop: 4 },
  bullet: { fontFamily: F.body, fontSize: 14, color: C.fg, lineHeight: 21, opacity: 0.92 },
  small: { fontFamily: F.body, fontSize: 12, color: C.muted, lineHeight: 17 },
})
