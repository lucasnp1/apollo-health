// Export for your doctor: the log for a range as a PDF or one spreadsheet. Only what you logged and what your labs
// measured, against each lab's own range (the web's ExportSheet).
import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { compoundGroups } from '@shared/lib/compounds'
import { useCompounds, useInjections } from '@/data/useLog'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Card, Input, RANGE_LABEL, type RangeId, RangeMenu, rangeDomain, Section } from '@/kit'
import { exportCsv, exportLogPdf, getPatientName, setPatientName, type Include } from '@/report/export'
import { C, F } from '@/theme'


const ROWS: { key: keyof Include; label: string }[] = [
  { key: 'injections', label: 'Injections' },
  { key: 'ancillaries', label: 'Ancillaries' },
  { key: 'weight', label: 'Weight' },
  { key: 'bp', label: 'Blood pressure' },
  { key: 'checkins', label: 'Check-ins' },
  { key: 'bloods', label: 'Blood tests' },
]

// The Timeline's kinds, as the export's sections
const FROM_KIND: Record<string, keyof Include> = { injection: 'injections', ancillary: 'ancillaries', weight: 'weight', bp: 'bp', symptom: 'checkins', lab: 'bloods' }

export default function Export() {
  // Opened from the Timeline: what it showed (kinds, one compound, the range)
  const params = useLocalSearchParams<{ range?: string; kinds?: string; group?: string }>()
  const compounds = useCompounds()
  const injections = useInjections()
  const [range, setRange] = useState<RangeId>(params.range && params.range in RANGE_LABEL ? (params.range as RangeId) : '3M')
  const [include, setInclude] = useState<Include>(() => {
    const only = params.kinds ? FROM_KIND[params.kinds] : undefined
    const all = { injections: true, ancillaries: true, weight: true, bp: true, checkins: true, bloods: true }
    return only ? (Object.fromEntries(Object.keys(all).map((k) => [k, k === only])) as Include) : all
  })
  const group = useMemo(() => (params.group ? compoundGroups(compounds, injections).find((g) => g.key === params.group) : undefined), [params.group, compounds, injections])
  const [onlyGroup, setOnlyGroup] = useState(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'pdf' | 'csv'>()

  useEffect(() => { void getPatientName().then(setName, () => {}) }, [])

  const any = Object.values(include).some(Boolean)
  const run = async (kind: 'pdf' | 'csv') => {
    const to = new Date()
    const from = range === 'ALL' ? new Date(0) : new Date(rangeDomain(range, [])[0])
    const compoundIds = group && onlyGroup && include.injections ? group.ids : undefined
    setBusy(kind)
    try {
      await setPatientName(name)
      await (kind === 'pdf' ? exportLogPdf({ from, to, include, name, compoundIds }) : exportCsv({ from, to, include, name, compoundIds }))
    } catch (e) {
      Alert.alert("Couldn't export", String((e as Error)?.message ?? e))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Export for your doctor' }} />
      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, gap: 28 }}
      >
        <Card style={[e.row, { paddingVertical: 8 }]}>
          <Text style={e.label}>Date range</Text>
          <RangeMenu value={range} onChange={setRange} />
        </Card>

        <Section title="Include">
          <Card style={{ paddingVertical: 4 }}>
            {ROWS.map((r, i) => {
              const on = include[r.key]
              const flip = () => setInclude((p) => ({ ...p, [r.key]: !p[r.key] }))
              return (
                <Pressable key={r.key} onPress={flip} accessibilityRole="switch" accessibilityState={{ checked: on }} style={[e.row, i < ROWS.length - 1 && e.sep]}>
                  <Text style={e.label}>{r.label}</Text>
                  <Switch value={on} onValueChange={flip} trackColor={{ true: C.primary }} accessibilityElementsHidden />
                </Pressable>
              )
            })}
          </Card>
          {group && include.injections ? (
            <Card style={{ paddingVertical: 4 }}>
              <Pressable onPress={() => setOnlyGroup((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: onlyGroup }} style={e.row}>
                <Text style={[e.label, { flexShrink: 1 }]}>Only {group.name} shots</Text>
                <Switch value={onlyGroup} onValueChange={setOnlyGroup} trackColor={{ true: C.primary }} accessibilityElementsHidden />
              </Pressable>
            </Card>
          ) : null}
        </Section>

        <Section title="Your name (optional)" hint="Printed at the top of the PDF. It stays on this phone and is never synced.">
          <Input value={name} onChangeText={setName} placeholder="Name" autoComplete="name" textContentType="name" returnKeyType="done" />
        </Section>

        <View style={{ gap: 10 }}>
          <Pressable
            style={({ pressed }) => [e.primary, (!any || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
            disabled={!any || !!busy}
            onPress={() => void run('pdf')}
            accessibilityRole="button"
          >
            {busy === 'pdf' ? <ActivityIndicator color={C.primaryFg} /> : <Text style={e.primaryText}>Create PDF</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [e.secondary, (!any || busy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
            disabled={!any || !!busy}
            onPress={() => void run('csv')}
            accessibilityRole="button"
          >
            {busy === 'csv' ? <ActivityIndicator color={C.fg} /> : <Text style={e.secondaryText}>Spreadsheet (CSV)</Text>}
          </Pressable>
          <Text style={e.small}>
            Only what you logged and what your labs measured, against each lab's own range. Doses appear as you typed them. Magno adds no reads.
          </Text>
        </View>
      </ScrollView>
    </>
  )
}

const e = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12 },
  sep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  label: { fontFamily: F.medium, fontSize: 16, color: C.fg },
  primary: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  primaryText: { fontFamily: F.semi, fontSize: 16, color: C.primaryFg },
  secondary: { borderRadius: 12, borderWidth: 1, borderColor: C.input, backgroundColor: C.card, paddingVertical: 14, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  secondaryText: { fontFamily: F.semi, fontSize: 16, color: C.fg },
  small: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
})
