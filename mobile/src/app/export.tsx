// Export for your doctor: the log for a range as a PDF or one spreadsheet. Only what you logged and what your labs
// measured, against each lab's own range (the web's ExportSheet).
import { subMonths } from 'date-fns'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Card, Chips, Input, Section } from '@/kit'
import { exportCsv, exportLogPdf, getPatientName, setPatientName, type Include } from '@/report/export'
import { C, F } from '@/theme'

type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL'
const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: 'Last month' },
  { value: '3M', label: '3 months' },
  { value: '6M', label: '6 months' },
  { value: '1Y', label: 'Year' },
  { value: 'ALL', label: 'All' },
]
const MONTHS: Record<Exclude<Range, 'ALL'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }

const ROWS: { key: keyof Include; label: string }[] = [
  { key: 'injections', label: 'Injections' },
  { key: 'weight', label: 'Weight' },
  { key: 'bp', label: 'Blood pressure' },
  { key: 'checkins', label: 'Check-ins' },
  { key: 'bloods', label: 'Blood tests' },
]

export default function Export() {
  const [range, setRange] = useState<Range>('3M')
  const [include, setInclude] = useState<Include>({ injections: true, weight: true, bp: true, checkins: true, bloods: true })
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'pdf' | 'csv'>()

  useEffect(() => { void getPatientName().then(setName, () => {}) }, [])

  const any = Object.values(include).some(Boolean)
  const run = async (kind: 'pdf' | 'csv') => {
    const to = new Date()
    const from = range === 'ALL' ? new Date(0) : subMonths(to, MONTHS[range])
    setBusy(kind)
    try {
      await setPatientName(name)
      await (kind === 'pdf' ? exportLogPdf({ from, to, include, name }) : exportCsv({ from, to, include, name }))
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
        <Section title="Date range">
          <Chips options={RANGES} value={range} onChange={(v) => v && setRange(v)} />
        </Section>

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
