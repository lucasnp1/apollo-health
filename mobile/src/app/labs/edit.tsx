// A blood test to check and save. Three ways in: a report just read (rows to check), by hand, or an existing test to
// edit or add results to (?mode=edit|add&id=). Every row stays editable, rows the reader was unsure of come first and
// say so, units fill in from the marker name, and saving a new test checks it isn't a duplicate or part of the same
// draw as one you already have. Saved through the web's own saveTest (src/lib/bloodTestsDb.ts).
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { type Draft, type SaveTarget, saveTest } from '@shared/lib/bloodTestsDb'
import { fmtDay } from '@shared/lib/dates'
import { canonicalKey, findSameDraw, parseEntry, parseRange } from '@shared/lib/labTests'
import { UK_UNIT } from '@shared/lib/labUnits'
import { allMarkerMeta } from '@shared/lib/markers'
import { takeDraft } from '@/labs/draft'
import { useTests } from '@/labs/useTests'
import { Card, Chips, Input, Section, Segmented, When } from '@/kit'
import { LogForm } from '@/LogForm'
import { showToast } from '@/toast'
import { C, F } from '@/theme'

type Row = { key: number; resultId?: number; marker: string; raw: string; unit: string; low: string; high: string; unsure?: boolean; status?: 'H' | 'L' }
type Fasted = 'yes' | 'no' | 'unsure'

const LABS = ['Medichecks', 'Thriva', 'Forth', 'Lola', 'e-Val', 'Randox', 'Bluecrest', 'London Medical Laboratory', 'NHS']
const CONDITIONS = ['Hard training', 'Alcohol', 'Unwell', 'Gave blood in last 8 weeks', 'Cycling or sex in last 48 h']
const MARKER_LABELS = [...new Set(allMarkerMeta().map((m) => m.label))].sort()
const DATE_HINT: Record<string, string> = {
  report: 'Found next to the collection date in the report.',
  'report-date': 'This is the report date. The draw is usually a day or two earlier.',
  filename: 'Taken from the file name. Check it.',
  'import-time': 'This was the day of the import, not the draw. Check it against the report.',
}

let nextKey = 0
const blank = (): Row => ({ key: nextKey++, marker: '', raw: '', unit: '', low: '', high: '' })
const fromDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`)
const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ask = (title: string, message: string, buttons: string[]) =>
  new Promise<number>((res) => Alert.alert(title, message, buttons.map((text, i) => ({ text, style: i === buttons.length - 1 ? 'cancel' : 'default', onPress: () => res(i) }))))
const cancelled = () => Object.assign(new Error('Cancelled'), { name: 'Cancelled' })

export default function EditTest() {
  const params = useLocalSearchParams<{ mode?: 'edit' | 'add'; id?: string }>()
  const tests = useTests()
  const existing = params.id ? tests?.find((t) => String(t.id) === params.id) : undefined
  if (params.id && !existing) return null
  return <Editor key={existing?.id ?? 'new'} mode={params.mode} existing={existing} tests={tests ?? []} />
}

function Editor({ mode, existing, tests }: { mode?: 'edit' | 'add'; existing?: NonNullable<ReturnType<typeof useTests>>[number]; tests: NonNullable<ReturnType<typeof useTests>> }) {
  const editing = mode === 'edit' && existing
  const adding = mode === 'add' && existing
  const [start] = useState<Draft>(() => {
    if (existing) {
      const e = existing.exam
      return {
        date: existing.date.slice(0, 10), name: existing.title, company: existing.provider, notes: e.notes, meta: e.meta ?? {}, source: 'manual',
        rows: editing ? existing.markers.map((m) => ({ resultId: m.resultId, marker: m.printedName, value: m.value, rawValue: m.rawValue, unit: m.unit, low: m.low, high: m.high })) : [],
      }
    }
    return takeDraft() ?? { date: toDay(new Date()), name: 'Blood test', meta: { dateSource: 'user' }, rows: [], source: 'manual' }
  })
  const [name, setName] = useState(start.name)
  const [lab, setLab] = useState(start.company ?? '')
  const [date, setDate] = useState(() => fromDate(start.date))
  const [drawTime, setDrawTime] = useState(start.meta.drawTime ?? '')
  const [fasted, setFasted] = useState<Fasted>(start.meta.fasted === true ? 'yes' : start.meta.fasted === false ? 'no' : 'unsure')
  const [conditions, setConditions] = useState<string[]>(start.meta.conditions ?? [])
  const [notes, setNotes] = useState(start.notes ?? '')
  const [focus, setFocus] = useState<number | undefined>()
  const [rows, setRows] = useState<Row[]>(() => {
    const rs = start.rows.map((r) => ({
      key: nextKey++, resultId: r.resultId, marker: r.marker, raw: r.rawValue, unit: r.unit, status: r.status,
      low: r.low !== undefined ? String(r.low) : '', high: r.high !== undefined ? String(r.high) : '',
      unsure: (r as { confidence?: string }).confidence === 'low',
    }))
    // the ones to check first
    rs.sort((a, b) => Number(!!b.unsure) - Number(!!a.unsure))
    return rs.length ? rs : [blank(), blank(), blank()]
  })
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, unsure: false } : r)))
  const filled = rows.filter((r) => r.marker.trim() && parseEntry(r.raw).value !== undefined)
  const imported = start.source !== 'manual' && !existing
  const dateChanged = toDay(date) !== start.date
  const hint = !dateChanged && start.meta.dateSource ? DATE_HINT[start.meta.dateSource] : undefined
  const suggestions = useMemo(() => {
    const r = rows.find((x) => x.key === focus)
    const q = r?.marker.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return MARKER_LABELS.filter((l) => l.toLowerCase().includes(q) && l.toLowerCase() !== q).slice(0, 5)
  }, [rows, focus])

  /** The unit labs in the UK print for this marker, when the unit is still empty. */
  const fillUnit = (key: number) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key || r.unit.trim() || !r.marker.trim()) return r
        const k = canonicalKey(r.marker, '', { value: parseEntry(r.raw).value }).key
        return k && UK_UNIT[k] ? { ...r, unit: UK_UNIT[k] } : r
      }),
    )

  async function save() {
    const draft: Draft = {
      ...start,
      name: name.trim() || (lab.trim() ? `${lab.trim()} blood test` : 'Blood test'),
      company: lab.trim() || undefined,
      date: toDay(date),
      meta: {
        ...start.meta,
        dateSource: dateChanged ? 'user' : start.meta.dateSource,
        drawTime: drawTime.trim() || undefined,
        fasted: fasted === 'yes' ? true : fasted === 'no' ? false : null,
        conditions: conditions.length ? conditions : undefined,
      },
      notes: notes.trim() || undefined,
      rows: filled.map((r) => ({ resultId: r.resultId, marker: r.marker.trim(), rawValue: r.raw.trim(), value: parseEntry(r.raw).value, unit: r.unit.trim(), status: r.status, ...parseRange(r.low, r.high) })),
    }
    let target: SaveTarget = { kind: 'new' }
    if (editing) {
      const kept = new Set(filled.map((r) => r.resultId).filter(Boolean))
      target = { kind: 'edit', examId: existing.id, removed: existing.markers.map((m) => m.resultId).filter((id) => !kept.has(id)) }
    } else if (adding) target = { kind: 'add', examId: existing.id }
    else {
      const same = findSameDraw({ date: draft.date, provider: draft.company, rows: draft.rows.filter((r) => r.value !== undefined).map((r) => ({ marker: r.marker, unit: r.unit, value: r.value! })) }, tests)
      const other = (id?: number) => tests.find((t) => t.id === id)
      if (same.duplicateOf) {
        const t = other(same.duplicateOf)!
        const c = await ask('This looks like a test you have', `${same.matched} of ${same.overlap} values match your ${fmtDay(t.date)} test.`, ['Open that test', 'Save anyway', 'Keep editing'])
        if (c === 0) return void setTimeout(() => router.push({ pathname: '/labs/[id]', params: { id: String(t.id) } }), 350)
        if (c === 2) throw cancelled()
      } else if (same.sameDrawAs) {
        const t = other(same.sameDrawAs)!
        const c = await ask('Part of the same draw?', `You have a ${fmtDay(t.date)} test${t.provider ? ` from ${t.provider}` : ''}. Add these results to it, or keep them as their own test.`, ['Add to that test', 'Keep separate', 'Keep editing'])
        if (c === 0) target = { kind: 'add', examId: t.id }
        if (c === 2) throw cancelled()
      }
    }
    const saved = await saveTest(draft, target)
    showToast({
      message: target.kind === 'edit' ? 'Test updated' : saved.skipped ? `${saved.added} added, ${saved.skipped} already there` : `${saved.added} result${saved.added === 1 ? '' : 's'} saved`,
      action: { label: 'Undo', run: saved.undo },
    })
    if (target.kind !== 'edit') setTimeout(() => router.push({ pathname: '/labs/[id]', params: { id: String(saved.examId) } }), 350)
  }

  const title = editing ? 'Edit test' : adding ? 'Add results' : imported ? 'Check your results' : 'New blood test'
  return (
    <LogForm canSave={filled.length > 0 || !!editing} onSave={save}>
      <Stack.Screen options={{ title }} />
      {imported ? (
        <Text style={e.lead}>
          {rows.length} result{rows.length === 1 ? '' : 's'} read from your report. Check each one against the report before saving
          {rows.some((r) => r.unsure) ? '. The ones marked "Check" were hard to read and are at the top.' : '.'}
        </Text>
      ) : adding ? (
        <Text style={e.lead}>New results join your {fmtDay(existing.date)} test. Results it already has are skipped.</Text>
      ) : null}

      {!adding ? (
        <Section title="Test" hint={hint}>
          <When value={date} onChange={setDate} time={false} />
          <Input placeholder="Lab, e.g. Medichecks" value={lab} onChangeText={setLab} autoCorrect={false} />
          {!lab.trim() || !LABS.includes(lab.trim()) ? <Chips options={LABS.slice(0, 6).map((l) => ({ value: l, label: l }))} value={undefined} onChange={(v) => v && setLab(v)} /> : null}
          <Input placeholder="Name (optional)" value={name === 'Blood test' ? '' : name} onChangeText={setName} />
        </Section>
      ) : null}

      {!adding ? (
        <Section title="At the draw" hint="Optional. Helps when reading the results later.">
          <Input placeholder="Time of the draw, e.g. 08:30" value={drawTime} onChangeText={setDrawTime} keyboardType="numbers-and-punctuation" />
          <Segmented value={fasted} onChange={setFasted} options={[{ value: 'yes', label: 'Fasted' }, { value: 'no', label: 'Not fasted' }, { value: 'unsure', label: 'Not sure' }]} />
          <View style={e.wrap}>
            {CONDITIONS.map((c) => {
              const on = conditions.includes(c)
              return (
                <Pressable key={c} onPress={() => setConditions((cs) => (on ? cs.filter((x) => x !== c) : [...cs, c]))} style={[e.cond, on && e.condOn]}>
                  <Text style={[e.condText, on && { color: C.fg }]}>{c}</Text>
                </Pressable>
              )
            })}
          </View>
        </Section>
      ) : null}

      <Section title="Results">
        {rows.map((r) => (
          <Card key={r.key} style={[e.row, r.unsure && { borderColor: C.warn }]}>
            <View style={e.head}>
              <View style={{ flex: 1 }}>
                <Input
                  style={e.name}
                  placeholder="Marker, e.g. Testosterone"
                  value={r.marker}
                  onChangeText={(v) => set(r.key, { marker: v })}
                  onFocus={() => setFocus(r.key)}
                  onBlur={() => (fillUnit(r.key), setTimeout(() => setFocus((f) => (f === r.key ? undefined : f)), 150))}
                  autoCorrect={false}
                />
              </View>
              {r.unsure ? <Text style={e.check}>Check</Text> : null}
              <Pressable hitSlop={10} accessibilityLabel={`Remove ${r.marker || 'row'}`} onPress={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}>
                <Text style={e.remove}>×</Text>
              </Pressable>
            </View>
            {focus === r.key && suggestions.length ? (
              <Chips options={suggestions.map((sg) => ({ value: sg, label: sg }))} value={undefined} onChange={(v) => v && (set(r.key, { marker: v }), setTimeout(() => fillUnit(r.key), 0))} />
            ) : null}
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
        <Pressable
          onPress={() => {
            const b = blank()
            setRows((rs) => [...rs, b])
            setFocus(b.key)
          }}
          style={e.addRow}
          accessibilityRole="button"
        >
          <Text style={e.addText}>+ Add a result</Text>
        </Pressable>
        <Text style={e.small}>Type values as printed. "&lt;0.5" keeps the "&lt;". A range like "&lt;5" goes in High.</Text>
      </Section>

      {!adding ? (
        <Section title="Notes">
          <Input placeholder="Optional" value={notes} onChangeText={setNotes} multiline />
        </Section>
      ) : null}
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
  rangeLabel: { fontFamily: F.monoMedium, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: C.muted, marginTop: 2, marginLeft: 2 },
  addRow: { alignSelf: 'flex-start', paddingVertical: 8 },
  addText: { fontFamily: F.semi, fontSize: 16, color: C.accentInk },
  small: { fontFamily: F.body, fontSize: 12, color: C.muted, lineHeight: 17 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cond: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.input, backgroundColor: C.card },
  condOn: { borderColor: C.primary, backgroundColor: C.primaryTint },
  condText: { fontFamily: F.medium, fontSize: 14, color: C.muted },
})
