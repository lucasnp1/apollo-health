// Labs: your blood tests, newest first. Add one from a PDF or a photo of the report (read on the phone), or by hand.
// What shows is what the lab printed: values, units and the lab's own range. Magno's reading of results (the web's
// plain-words analysis) is not in the iOS app yet; see docs/decisions.md.
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import { useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fmtDay } from '@shared/lib/dates'
import { defaultTestName } from '@shared/lib/labTests'
import { setDraft } from '@/labs/draft'
import { readReport } from '@/labs/read'
import { useTests } from '@/labs/useTests'
import { Card, Eyebrow } from '@/kit'
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
  const [busy, setBusy] = useState(false)

  const add = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['PDF report', 'Photo of a report', 'Take a photo', 'Enter by hand', 'Cancel'], cancelButtonIndex: 4, userInterfaceStyle: 'dark', title: 'Add a blood test' },
      (i) => {
        if (i === 3) return router.push('/labs/edit')
        const kind = (['pdf', 'photo', 'camera'] as const)[i]
        if (kind) void importReport(kind, setBusy)
      },
    )

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={tests ?? []}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 10 }}>
            <View>
              <Eyebrow>{tests?.length ? `${tests.length} test${tests.length === 1 ? '' : 's'}` : 'Blood tests'}</Eyebrow>
              <Text style={l.h1}>Labs</Text>
            </View>
            <Pressable onPress={add} accessibilityRole="button" style={({ pressed }) => [l.add, pressed && { opacity: 0.8 }]}>
              <SymbolView name={'plus' as SymbolViewProps['name']} tintColor={C.primaryFg} size={18} />
              <Text style={l.addText}>Add a blood test</Text>
            </Pressable>
            <Text style={l.hint}>Import a PDF or a photo of your report: it's read on this phone, and you check every value before it's saved.</Text>
          </View>
        }
        renderItem={({ item: t }) => {
          const out = t.counts.outOfLabRange
          return (
            <Pressable onPress={() => router.push({ pathname: '/labs/[id]', params: { id: String(t.id) } })} style={({ pressed }) => pressed && { opacity: 0.8 }}>
              <Card style={{ gap: 6 }}>
                <View style={l.top}>
                  <Text style={l.title} numberOfLines={1}>{t.title}</Text>
                  <SymbolView name="chevron.right" tintColor={C.faint} size={13} />
                </View>
                <Text style={l.sub}>{[fmtDay(t.date), t.provider].filter(Boolean).join(' · ')}</Text>
                <Text style={l.sub}>
                  {t.counts.total} result{t.counts.total === 1 ? '' : 's'}
                  {out ? <Text style={{ color: C.warn }}>{`  ·  ${out} outside the lab's range`}</Text> : null}
                </Text>
              </Card>
            </Pressable>
          )
        }}
        ListEmptyComponent={tests ? <Text style={l.empty}>No blood tests yet.</Text> : null}
      />
      {busy ? (
        <View style={l.busy}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={l.busyText}>Reading your report…</Text>
        </View>
      ) : null}
    </View>
  )
}

const l = StyleSheet.create({
  h1: { fontFamily: F.semi, fontSize: 32, letterSpacing: -0.6, color: C.fg, marginTop: 6 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15 },
  addText: { fontFamily: F.semi, fontSize: 17, color: C.primaryFg },
  hint: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontFamily: F.semi, fontSize: 17, color: C.fg },
  sub: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  empty: { fontFamily: F.body, fontSize: 15, color: C.muted, paddingVertical: 20 },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(13,14,17,0.82)', alignItems: 'center', justifyContent: 'center', gap: 14 },
  busyText: { fontFamily: F.medium, fontSize: 16, color: C.fg },
})
