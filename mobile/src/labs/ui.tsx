// The pieces every Bloods screen shares, so a marker reads the same wherever it shows: its tag (Magno's read or the
// lab's flag), a range bar (where the value sits in the lab's range, with the previous value), and the marker row.
import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CORE_KEYS } from '@shared/lib/labRules'
import { fmtRange, retestLine } from '@shared/lib/labRules'
import { type LabTest, printedValue, prevText, type TestMarker } from '@shared/lib/labTests'
import { fmtDay } from '@shared/lib/dates'
import { markerChip } from '@/labs/reads'
import { C, F, TONE, type Tone, toneHex, usePalette } from '@/theme'

export function Tag({ label, tone }: { label: string; tone: Tone }) {
  const t = TONE[tone]
  const pal = usePalette()
  return (
    <View style={[u.tag, { backgroundColor: toneHex(pal, tone) + '22' }]}>
      <Text style={[u.tagText, { color: t }]}>{label}</Text>
    </View>
  )
}

/** The lab's range as a track, the value as a dot (the previous value as a hollow ring). */
export function RangeBar({ value, low, high, prev }: { value: number; low?: number; high?: number; prev?: number }) {
  if (low === undefined && high === undefined) return null
  const lo = low ?? 0
  const hi = high ?? lo * 2 + 1
  const span = hi - lo || 1
  // the range sits in the middle 60%; values outside run into the margins
  const pos = (v: number) => Math.max(0, Math.min(1, 0.2 + ((v - lo) / span) * 0.6))
  const out = value < lo || value > hi
  return (
    <View style={u.bar} accessibilityLabel={`Lab range ${fmtRange(low, high)}`}>
      <View style={u.track} />
      <View style={[u.inRange, { left: '20%', width: '60%' }]} />
      {prev !== undefined ? <View style={[u.prev, { left: `${pos(prev) * 100}%` }]} /> : null}
      <View style={[u.dotValue, { left: `${pos(value) * 100}%`, backgroundColor: out ? C.warn : C.good }]} />
    </View>
  )
}

const outBy = (m: TestMarker) => {
  if (m.value === undefined) return 0
  if (m.high !== undefined && m.value > m.high) return (m.value - m.high) / Math.abs(m.high || 1)
  if (m.low !== undefined && m.value < m.low) return (m.low - m.value) / Math.abs(m.low || 1)
  return 0
}

/** Act first, then watch; core markers first in each tier, then by how far outside the range (the web's Bloods home). */
export function attentionOf(t: LabTest, pro: boolean): TestMarker[] {
  if (!pro) return t.markers.filter((m) => m.labFlag === 'high' || m.labFlag === 'low').sort((a, b) => outBy(b) - outBy(a))
  const tier = (m: TestMarker) => (m.read === 'act' ? 0 : 1)
  const core = (m: TestMarker) => (CORE_KEYS.includes(m.key) ? 0 : 1)
  return t.markers.filter((m) => m.read === 'act' || m.read === 'watch').sort((a, b) => tier(a) - tier(b) || core(a) - core(b) || outBy(b) - outBy(a))
}

/**
 * One marker of one test. With `attention` (Pro) it shows Magno's reason and what people usually do instead of the
 * range bar, plus when to retest; otherwise the value against the lab's range and the change since last time.
 */
export const MarkerRow = memo(function MarkerRow({ m, pro, attention, printed, onPress, first }: {
  m: TestMarker
  pro: boolean
  attention?: boolean
  printed?: boolean
  onPress?: () => void
  first?: boolean
}) {
  const chip = markerChip(m, pro)
  const flag = m.labFlag === 'high' ? 'H' : m.labFlag === 'low' ? 'L' : undefined
  const retest = attention && pro && m.retestBy ? retestLine(m.retestBy, false) : undefined
  const change = pro && m.change ? m.change : undefined
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [u.row, !first && u.sep, pressed && { opacity: 0.7 }]}>
      <View style={u.line}>
        <Text style={u.label} numberOfLines={2}>{printed ? m.printedName : m.label}</Text>
        <Tag label={chip.label} tone={chip.tone} />
      </View>
      <View style={u.line}>
        <Text style={u.value}>
          {printedValue(m)}
          <Text style={u.unit}> {m.unit}</Text>
          {flag ? <Text style={[u.flag, { color: m.expected ? C.muted : C.danger }]}>  {flag}</Text> : null}
        </Text>
        <Text style={u.meta}>{fmtRange(m.low, m.high).replace('No range printed', 'No lab range')}</Text>
      </View>
      {attention && pro ? (
        <>
          {m.reason ? <Text style={u.reason}>{m.reason}</Text> : null}
          {m.next ? <Text style={u.next}>{m.next}</Text> : null}
          {retest ? <Text style={[u.meta, retest.overdue && { color: C.warn }]}>{retest.text}</Text> : null}
        </>
      ) : m.value !== undefined ? (
        <RangeBar value={m.value} low={m.low} high={m.high} prev={pro ? m.prev?.value : undefined} />
      ) : null}
      {m.prev && pro ? (
        <Text style={[u.meta, change?.meaningful && { color: change.better === false ? C.danger : change.better === true ? C.good : C.fg }]}>
          {change?.meaningful ? `${change.text}  ·  ` : ''}Before: {prevText(m.prev)} {m.prev.unit}, {fmtDay(m.prev.date)}
        </Text>
      ) : null}
    </Pressable>
  )
})

export const u = StyleSheet.create({
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  tagText: { fontFamily: F.semi, fontSize: 12 },
  bar: { height: 14, justifyContent: 'center', marginTop: 2 },
  track: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: C.secondary },
  inRange: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: C.goodBand },
  dotValue: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, borderWidth: 2, borderColor: C.card },
  prev: { position: 'absolute', width: 10, height: 10, borderRadius: 5, marginLeft: -5, borderWidth: 2, borderColor: C.muted },
  row: { paddingVertical: 13, gap: 6 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { flex: 1, fontFamily: F.semi, fontSize: 16, color: C.fg },
  value: { fontFamily: F.monoSemi, fontSize: 17, color: C.fg },
  unit: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  flag: { fontFamily: F.monoSemi, fontSize: 12 },
  meta: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  reason: { fontFamily: F.body, fontSize: 14, color: C.fg, lineHeight: 20, opacity: 0.9 },
  next: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 20 },
})
