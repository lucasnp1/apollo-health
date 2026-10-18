// A blood test to check and save: the rows read from a report, or none to type in by hand. Every row stays editable,
// and rows the reader was unsure of say so. Saved through the web's own saveTest (src/lib/bloodTestsDb.ts).
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type Draft, saveTest } from '@shared/lib/bloodTestsDb'
import { parseEntry, parseRange } from '@shared/lib/labTests'
import { takeDraft } from '@/labs/draft'
import { Card, Input, Section, When } from '@/kit'
import { LogForm } from '@/LogForm'
import { C, F } from '@/theme'

type Row = { key: number; marker: string; raw: string; unit: string; low: string; high: string; unsure?: boolean; status?: 'H' | 'L' }

let nextKey = 0
const blank = (): Row => ({ key: nextKey++, marker: '', raw: '', unit: '', low: '', high: '' })
const fromDate = (iso: string) => new Date(`${iso}T12:00:00`)
const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function EditTest() {
  // read once: the draft handed over by Labs after reading a report, or a blank test
  const [start] = useState<Draft>(
    () => takeDraft() ?? { date: toDay(new Date()), name: 'Blood test', meta: { dateSource: 'user' }, rows: [], source: 'manual' },
  )
  const [name, setName] = useState(start.name)
  const [date, setDate] = useState(() => fromDate(start.date))
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>(() =>
    start.rows.length
      ? start.rows.map((r) => ({
          key: nextKey++, marker: r.marker, raw: r.rawValue, unit: r.unit, status: r.status,
          low: r.low !== undefined ? String(r.low) : '', high: r.high !== undefined ? String(r.high) : '',
          unsure: (r as { confidence?: string }).confidence === 'low',
        }))
      : [blank()],
  )
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, unsure: false } : r)))
  const filled = rows.filter((r) => r.marker.trim() && parseEntry(r.raw).value !== undefined)
  const imported = start.source !== 'manual'

  const save = () =>
    saveTest(
      {
        ...start,
        name: name.trim() || 'Blood test',
        date: toDay(date),
        // a date picked by hand is the person's word for it
        meta: { ...start.meta, dateSource: toDay(date) === start.date ? start.meta.dateSource : 'user' },
        notes: notes.trim() || undefined,
        rows: filled.map((r) => ({
          marker: r.marker.trim(), rawValue: r.raw.trim(), value: parseEntry(r.raw).value, unit: r.unit.trim(), status: r.status,
          ...parseRange(r.low, r.high),
        })),
      },
      { kind: 'new' },
    )

  return (
    <LogForm canSave={filled.length > 0} onSave={save}>
      {imported ? (
        <Text style={e.lead}>
          {rows.length} result{rows.length === 1 ? '' : 's'} read from your report. Check each one against the report before saving
          {rows.some((r) => r.unsure) ? ': the ones marked "Check" were hard to read.' : '.'}
        </Text>
      ) : null}
      <Section title="Test">
        <Input placeholder="Name" value={name} onChangeText={setName} />
        <When value={date} onChange={setDate} time={false} />
      </Section>

      <Section title="Results">
        {rows.map((r) => (
          <Card key={r.key} style={[e.row, r.unsure && { borderColor: C.warn }]}>
            <View style={e.head}>
              <View style={{ flex: 1 }}>
                <Input style={e.name} placeholder="Marker, e.g. Testosterone" value={r.marker} onChangeText={(v) => set(r.key, { marker: v })} autoCorrect={false} />
              </View>
              {r.unsure ? <Text style={e.check}>Check</Text> : null}
              <Pressable hitSlop={10} accessibilityLabel={`Remove ${r.marker || 'row'}`} onPress={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}>
                <Text style={e.remove}>×</Text>
              </Pressable>
            </View>
            <View style={e.pair}>
              <View style={{ flex: 1.2 }}>
                <Input placeholder="Value" keyboardType="numbers-and-punctuation" value={r.raw} onChangeText={(v) => set(r.key, { raw: v })} autoCorrect={false} />
              </View>
              <View style={{ flex: 1 }}>
                <Input placeholder="Unit" value={r.unit} onChangeText={(v) => set(r.key, { unit: v })} autoCorrect={false} autoCapitalize="none" />
              </View>
            </View>
            <Text style={e.rangeLabel}>Lab range</Text>
            <View style={e.pair}>
              <View style={{ flex: 1 }}>
                <Input placeholder="Low" keyboardType="numbers-and-punctuation" value={r.low} onChangeText={(v) => set(r.key, { low: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Input placeholder="High" keyboardType="numbers-and-punctuation" value={r.high} onChangeText={(v) => set(r.key, { high: v })} />
              </View>
            </View>
          </Card>
        ))}
        <Pressable onPress={() => setRows((rs) => [...rs, blank()])} style={e.addRow} accessibilityRole="button">
          <Text style={e.addText}>+ Add a result</Text>
        </Pressable>
      </Section>

      <Section title="Notes">
        <Input placeholder="Optional, e.g. fasted, 8am" value={notes} onChangeText={setNotes} multiline />
      </Section>
    </LogForm>
  )
}

const e = StyleSheet.create({
  lead: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21 },
  row: { gap: 8, padding: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: F.semi },
  check: { fontFamily: F.semi, fontSize: 12, color: C.warn },
  remove: { fontSize: 26, color: C.faint, paddingHorizontal: 4 },
  pair: { flexDirection: 'row', gap: 8 },
  rangeLabel: { fontFamily: F.monoMedium, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted, marginTop: 2, marginLeft: 2 },
  addRow: { alignSelf: 'flex-start', paddingVertical: 8 },
  addText: { fontFamily: F.semi, fontSize: 16, color: C.accentInk },
})
