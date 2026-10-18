// Labs: your blood tests, newest first. Add one from a PDF or a photo of the report (read on the phone), or by hand.
// What shows is what the lab printed: values, units and the lab's own range. Magno's reading of results (the web's
// plain-words analysis) is not in the iOS app yet; see docs/decisions.md.
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import { useMemo, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fmtDay } from '@shared/lib/dates'
import { defaultTestName } from '@shared/lib/labTests'
import { setDraft } from '@/labs/draft'
import { withPro } from '@/money/pro'
import { readReport } from '@/labs/read'
import { exportTestPdf } from '@/report/export'
import { useTests } from '@/labs/useTests'
import { Card, Eyebrow, Segmented, Widget } from '@/kit'
import { BleedsSection } from '@/labs/Bleeds'
import { attentionOf, MarkerRow, Tag } from '@/labs/ui'
import { phaseLabel, testChip, verdictLine } from '@/labs/reads'
import { usePro } from '@/money/pro'
import { changesFor, notInTest, previousTest, type LabTest } from '@shared/lib/labTests'
import { SECTION_ORDER } from '@shared/lib/markers'
import { C, F } from '@/theme'

const today = () => new Date().toISOString().slice(0, 10)

/** Read a report, hand its rows to the editor to check, and open it. */
async function importReport(kind: 'pdf' | 'photo' | 'camera', busy: (b: boolean) => void) {
  let uri: string | undefined
  let name: string | undefined
  if (kind === 'pdf') {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true })
    if (r.canceled) return
    ;({ uri, name } = r.assets[0])
  } else {
    if (kind === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
      return Alert.alert('Camera is off for Magno', 'Turn it on in Settings > Magno to photograph a report.')
    const r = kind === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    if (r.canceled) return
    uri = r.assets[0].uri
  }
  busy(true)
  try {
    const read = await readReport(uri, kind === 'pdf' ? 'pdf' : 'photo', name)
    if (!read.markers.length)
      return Alert.alert('No results found', "Magno couldn't find any results in that report. You can enter them by hand instead.", [
        { text: 'Enter by hand', onPress: () => router.push('/labs/edit') },
        { text: 'OK' },
      ])
    setDraft({
      date: read.date ?? today(),
      name: defaultTestName(read.provider),
      company: read.provider,
      meta: { dateSource: read.date ? 'report' : 'user' },
      source: kind === 'pdf' ? 'pdf' : 'photo',
      rows: read.markers.map((m) => ({
        marker: m.marker, value: m.value, rawValue: m.rawValue ?? String(m.value), unit: m.unit, low: m.low, high: m.high, status: m.flag,
        // ponytail: confidence rides along on the row for the editor; saveTest ignores fields it doesn't know
        ...({ confidence: m.confidence } as object),
      })),
    })
    router.push('/labs/edit')
  } catch (err) {
    console.error(err)
    Alert.alert("Couldn't read that report", String((err as Error)?.message ?? err))
  } finally {
    busy(false)
  }
}

export default function Labs() {
  const insets = useSafeAreaInsets()
  const tests = useTests()
  const pro = usePro()
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'latest' | 'tests' | 'markers'>('latest')

  const add = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['PDF report', 'Photo of a report', 'Take a photo', 'Enter by hand', 'Cancel'], cancelButtonIndex: 4, userInterfaceStyle: 'dark', title: 'Add a blood test' },
      (i) => {
        if (i === 3) return router.push('/labs/edit')
        const kind = (['pdf', 'photo', 'camera'] as const)[i]
        if (kind) withPro('Importing a blood test', () => void importReport(kind, setBusy))
      },
    )

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100, gap: 16 }}>
        <View>
          <Eyebrow>{tests?.length ? `${tests.length} test${tests.length === 1 ? '' : 's'}` : 'Blood tests'}</Eyebrow>
          <Text style={l.h1}>Bloods</Text>
        </View>
        <Pressable onPress={add} accessibilityRole="button" style={({ pressed }) => [l.add, pressed && { opacity: 0.8 }]}>
          <SymbolView name={'plus' as SymbolViewProps['name']} tintColor={C.primaryFg} size={18} />
          <Text style={l.addText}>Add a blood test</Text>
        </Pressable>
        {tests && tests.length ? (
          <>
            <Segmented value={tab} onChange={setTab} options={[{ value: 'latest', label: 'Latest' }, { value: 'tests', label: 'Tests' }, { value: 'markers', label: 'Markers' }]} />
            {tab === 'latest' ? <Latest tests={tests} pro={pro} /> : tab === 'tests' ? <Tests tests={tests} pro={pro} /> : <Markers tests={tests} pro={pro} />}
          </>
        ) : tests ? (
          <Empty />
        ) : null}
      </ScrollView>
      {busy ? (
        <View style={l.busy}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={l.busyText}>Reading your report…</Text>
        </View>
      ) : null}
    </View>
  )
}

const openTest = (id: number) => router.push({ pathname: '/labs/[id]', params: { id: String(id) } })
const openMarker = (key: string) => router.push({ pathname: '/labs/marker/[key]', params: { key } })

/** The newest test in short: what needs attention, what changed, what wasn't tested, and the next steps. */
function Latest({ tests, pro }: { tests: LabTest[]; pro: boolean }) {
  const t = tests[0]
  const previous = previousTest(tests, t)
  const attention = attentionOf(t, pro)
  const shown = attention.slice(0, 3)
  const shownKeys = new Set(shown.map((m) => m.key))
  const changes = pro ? changesFor(t).filter((m) => !shownKeys.has(m.key)).slice(0, 3) : []
  const missing = notInTest(tests, t)
  const chip = testChip(t, pro)
  const phase = phaseLabel(t)
  return (
    <>
      <Widget eyebrow="Latest test" title={verdictLine(t, pro)} sub={[fmtDay(t.date), t.provider, phase].filter(Boolean).join(' · ')} action={chip ? <Tag label={chip.label} tone={chip.tone} /> : undefined} onPress={() => openTest(t.id)}>
        {t.needsCheck.map((n) => (
          <Text key={n} style={l.warn}>⚠︎  {n}</Text>
        ))}
      </Widget>

      <Widget eyebrow={pro ? 'Needs attention' : 'Outside the lab range'} sub={`From your ${fmtDay(t.date)} test`}>
        {shown.length ? (
          <View>
            {shown.map((m, i) => (
              <MarkerRow key={m.resultId} m={m} pro={pro} attention first={i === 0} onPress={() => openMarker(m.key)} />
            ))}
          </View>
        ) : (
          <Text style={l.muted}>{pro ? 'Nothing in this test needs attention.' : 'Nothing in this test is outside the lab range.'}</Text>
        )}
        {attention.length > shown.length ? (
          <Pressable onPress={() => openTest(t.id)} hitSlop={8}>
            <Text style={l.link}>Show {attention.length - shown.length} more</Text>
          </Pressable>
        ) : null}
        {!pro ? (
          <Pressable onPress={() => router.push({ pathname: '/pro', params: { feature: 'Reading your bloods' } })}>
            <Text style={l.link}>What Pro reads in a test</Text>
          </Pressable>
        ) : null}
      </Widget>

      {pro ? (
        <Widget eyebrow="What changed" sub={previous ? `Since your ${fmtDay(previous.date)} test` : undefined}>
          {changes.length ? (
            <View>
              {changes.map((m, i) => (
                <MarkerRow key={m.resultId} m={m} pro={pro} first={i === 0} onPress={() => openMarker(m.key)} />
              ))}
            </View>
          ) : (
            <Text style={l.muted}>{previous ? `Nothing moved enough to matter since ${fmtDay(previous.date)}.` : 'This is your first test, so there is nothing to compare yet.'}</Text>
          )}
        </Widget>
      ) : null}

      {missing.length ? (
        <Widget eyebrow="Not in this test" title={missing.map((m) => m.label).join(', ')} sub="From earlier tests. Worth including next time.">
          <View>
            {missing.map((m, i) => (
              <Pressable key={m.key} onPress={() => openMarker(m.key)} style={[l.mini, i > 0 && l.sep]}>
                <Text style={l.miniLabel}>{m.label}</Text>
                <Text style={l.miniValue}>{Number(m.value.toPrecision(4))} {m.unit} · {fmtDay(m.date)}</Text>
              </Pressable>
            ))}
          </View>
        </Widget>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {tests.length > 1 ? (
          <Pressable style={l.outline} onPress={() => router.push({ pathname: '/labs/compare', params: { a: String(t.id), b: String(previous?.id ?? tests[1].id) } } as never)}>
            <Text style={l.outlineText}>Compare with previous</Text>
          </Pressable>
        ) : null}
        <Pressable style={l.outline} onPress={() => void exportTestPdf(t.id).catch((e) => Alert.alert("Couldn't make the report", String(e?.message ?? e)))}>
          <Text style={l.outlineText}>For your doctor</Text>
        </Pressable>
      </View>
      <BleedsSection />
      <Text style={l.small}>Not medical advice. Flags come from your lab; check anything you act on with your doctor.</Text>
    </>
  )
}

function Tests({ tests, pro }: { tests: LabTest[]; pro: boolean }) {
  const [only, setOnly] = useState(false)
  const check = tests.filter((t) => t.needsCheck.length)
  const list = only ? check : tests
  return (
    <>
      {check.length ? (
        <Pressable onPress={() => setOnly((v) => !v)}>
          <Text style={l.link}>{only ? 'Show every test' : `${check.length} test${check.length === 1 ? ' needs' : 's need'} a quick check`}</Text>
        </Pressable>
      ) : null}
      {list.map((t) => {
        const chip = testChip(t, pro)
        return (
          <Pressable key={t.id} onPress={() => openTest(t.id)} style={({ pressed }) => pressed && { opacity: 0.8 }}>
            <Card style={{ gap: 6 }}>
              <View style={l.top}>
                <Text style={l.title} numberOfLines={1}>{t.title}</Text>
                {chip ? <Tag label={chip.label} tone={chip.tone} /> : null}
              </View>
              <Text style={l.sub}>{[fmtDay(t.date), t.provider, `${t.counts.total} markers`, phaseLabel(t)].filter(Boolean).join(' · ')}</Text>
              {t.needsCheck.map((n) => (
                <Text key={n} style={l.warn}>⚠︎  {n}</Text>
              ))}
            </Card>
          </Pressable>
        )
      })}
      <BleedsSection />
    </>
  )
}

/** Every marker you've ever had measured, by section, with its latest value. */
function Markers({ tests, pro }: { tests: LabTest[]; pro: boolean }) {
  const sections = useMemo(() => {
    const latest = new Map<string, LabTest['markers'][number]>()
    const counts = new Map<string, number>()
    for (const t of [...tests].reverse())
      for (const m of t.markers) {
        latest.set(m.key, m)
        counts.set(m.key, (counts.get(m.key) ?? 0) + 1)
      }
    return SECTION_ORDER.map((sec) => ({ sec, rows: [...latest.values()].filter((m) => m.section === sec) })).filter((s) => s.rows.length)
  }, [tests])
  return (
    <>
      {sections.map(({ sec, rows }) => (
        <Widget key={sec} eyebrow={sec}>
          <View>
            {rows.map((m, i) => (
              <MarkerRow key={m.key} m={m} pro={pro} first={i === 0} onPress={() => openMarker(m.key)} />
            ))}
          </View>
        </Widget>
      ))}
    </>
  )
}

function Empty() {
  return (
    <Widget eyebrow="Your first test" title="Add a blood test to see what it says" sub="Import the PDF from your lab, a photo of the report, or type the results in. It's read on this phone and you check every value before it's saved.">
      <Text style={l.muted}>A protocol panel usually includes total and free testosterone, oestradiol, SHBG, haematocrit and haemoglobin, PSA, lipids, liver and kidney markers. Labs usually suggest drawing in the morning, before your next dose.</Text>
    </Widget>
  )
}

const l = StyleSheet.create({
  h1: { fontFamily: F.semi, fontSize: 32, letterSpacing: -0.6, color: C.fg, marginTop: 6 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15 },
  addText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontFamily: F.semi, fontSize: 17, color: C.fg },
  sub: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  warn: { fontFamily: F.medium, fontSize: 13, color: C.warn },
  muted: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20 },
  link: { fontFamily: F.semi, fontSize: 14, color: C.accentInk },
  small: { fontFamily: F.body, fontSize: 12, color: C.muted, lineHeight: 17 },
  mini: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  miniLabel: { fontFamily: F.medium, fontSize: 15, color: C.fg },
  miniValue: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  outline: { flex: 1, borderWidth: 1, borderColor: C.input, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  outlineText: { fontFamily: F.semi, fontSize: 14, color: C.fg },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(13,14,17,0.82)', alignItems: 'center', justifyContent: 'center', gap: 14 },
  busyText: { fontFamily: F.medium, fontSize: 16, color: C.fg },
})
