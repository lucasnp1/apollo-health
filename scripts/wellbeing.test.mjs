// Wellbeing summary self-check. Run: node scripts/wellbeing.test.mjs
import assert from 'node:assert/strict'
import { ALL_SYMPTOMS } from '../src/lib/symptoms.ts'
import { felt, notable, times, wellbeingSummary, ZERO_BASED_SINCE } from '../src/lib/wellbeingSummary.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }

const DAY = 86_400_000
const NOW = Date.parse('2026-10-20T12:00:00Z')
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString()
const def = (key) => ALL_SYMPTOMS.find((d) => d.key === key)
const RULES = {
  'nippleSensitivity:high': { line: 'Often a sign of estradiol running high.', markers: ['estradiol'], markerDirection: ['high'], guide: 'estradiol' },
  'headache:high': { line: 'Worth checking blood pressure and hematocrit.', markers: ['hematocrit'], markerDirection: ['high'], useBp: true, guide: 'hematocrit' },
  'sleep:low': { line: 'Can follow late doses.', markers: [], markerDirection: [], compounds: [{ match: /tren/i, line: 'Trenbolone is known for this.' }] },
}
const ctx = { labs: {}, recentCompounds: [] }

check('the owner example: two symptoms, same counts, one sentence', () => {
  const rows = [1, 3, 10, 15, 20].map((d) => ({ recordedAt: at(d), nippleSensitivity: 2, headache: 2 }))
  const s = wellbeingSummary(rows, ALL_SYMPTOMS, RULES, ctx, NOW)
  assert.equal(s.checkIns, 5)
  assert.equal(s.insights.length, 1)
  const [i] = s.insights
  assert.equal(i.title, 'Nipple sensitivity and headache')
  assert.deepEqual([i.week, i.month], [2, 5])
  assert.equal(i.mild, true)
  assert.equal(i.tone, 'warn')
  assert.equal(i.causes.length, 2)
})

check('evidence cites the user\'s own numbers, and nudges when there are none', () => {
  const rows = [{ recordedAt: at(1), nippleSensitivity: 4 }]
  const withLab = wellbeingSummary(rows, ALL_SYMPTOMS, RULES, {
    labs: { estradiol: { label: 'Estradiol', value: 52, unit: 'pg/mL', low: 10, high: 40, at: '2026-09-08T12:00:00Z' } },
    recentCompounds: [],
  }, NOW)
  assert.equal(withLab.insights[0].causes[0].evidence[0], 'Your last estradiol was 52 pg/mL, above range (8 Sep).')
  assert.equal(withLab.insights[0].tone, 'bad')
  const noLab = wellbeingSummary(rows, ALL_SYMPTOMS, RULES, ctx, NOW)
  assert.equal(noLab.insights[0].causes[0].evidence[0], 'No estradiol result yet. Worth adding to your next bloods.')
})

check('blood pressure and a recent compound show up as evidence', () => {
  const rows = [{ recordedAt: at(1), headache: 3, sleep: 1 }]
  const s = wellbeingSummary(rows, ALL_SYMPTOMS, RULES, { labs: {}, bp: { sys: 140, dia: 88, n: 6 }, recentCompounds: ['Trenbolone Acetate'] }, NOW)
  const all = s.insights.flatMap((i) => i.causes.flatMap((c) => c.evidence))
  assert.ok(all.includes('Your blood pressure lately: 140/88 average of 6 readings, above the 135/85 home limit.'))
  assert.ok(all.includes('Trenbolone is known for this.'))
})

check('old 1-5 check-ins: a default 3 is not a side effect, a 4 is', () => {
  const old = new Date(ZERO_BASED_SINCE - DAY).toISOString()
  assert.equal(felt({ recordedAt: old, waterRetention: 3 }, def('waterRetention')), false)
  assert.equal(felt({ recordedAt: old, waterRetention: 4 }, def('waterRetention')), true)
  assert.equal(felt({ recordedAt: old, nippleSensitivity: 1 }, def('nippleSensitivity')), false)
  // New scale: 0 is none, 1 is felt (mild), 3 is worth naming.
  const fresh = new Date(ZERO_BASED_SINCE + DAY).toISOString()
  assert.equal(felt({ recordedAt: fresh, headache: 0 }, def('headache')), false)
  assert.equal(felt({ recordedAt: fresh, headache: 1 }, def('headache')), true)
  assert.equal(notable({ recordedAt: fresh, headache: 1 }, def('headache')), false)
  assert.equal(notable({ recordedAt: fresh, headache: 3 }, def('headache')), true)
  // A good thing only counts when it was poor.
  assert.equal(felt({ recordedAt: fresh, libido: 2 }, def('libido')), true)
  assert.equal(felt({ recordedAt: fresh, libido: 3 }, def('libido')), false)
})

check('nothing felt, nothing to say; outside 30 days does not count', () => {
  assert.equal(wellbeingSummary([{ recordedAt: at(2), headache: 0, mood: 4 }], ALL_SYMPTOMS, RULES, ctx, NOW).insights.length, 0)
  const s = wellbeingSummary([{ recordedAt: at(40), headache: 5 }], ALL_SYMPTOMS, RULES, ctx, NOW)
  assert.deepEqual([s.checkIns, s.insights.length], [0, 0])
})

check('a check-in saved after the clock was read still counts', () => {
  const s = wellbeingSummary([{ recordedAt: new Date(NOW + 60_000).toISOString(), headache: 2 }], ALL_SYMPTOMS, RULES, ctx, NOW)
  assert.deepEqual([s.insights[0].week, s.insights[0].month], [1, 1])
})

check('most frequent first; low mood reads as low mood', () => {
  const rows = [
    { recordedAt: at(1), mood: 1, headache: 2 },
    { recordedAt: at(2), mood: 2 },
    { recordedAt: at(3), mood: 2 },
  ]
  const s = wellbeingSummary(rows, ALL_SYMPTOMS, RULES, ctx, NOW)
  assert.equal(s.insights[0].title, 'Low mood')
  assert.equal(s.insights[0].tone, 'bad')          // a 1 out of 5 for mood is severe
  assert.equal(s.insights[1].title, 'Headache')
})

check('times reads like speech', () => {
  assert.deepEqual([times(1), times(2), times(5)], ['once', 'twice', '5 times'])
})

check('one high reading asks for more, not a doctor', () => {
  const s = wellbeingSummary([{ recordedAt: at(1), headache: 3 }], ALL_SYMPTOMS, RULES, { labs: {}, bp: { sys: 162, dia: 101, n: 1 }, recentCompounds: [] }, NOW)
  assert.ok(s.insights[0].causes[0].evidence.includes('Your blood pressure lately: 162/101 from 1 reading, high for a one-off, so take a few more to confirm.'))
})

check('an old lab result shows its year; the lab text keeps its < sign', () => {
  const s = wellbeingSummary([{ recordedAt: at(1), nippleSensitivity: 4 }], ALL_SYMPTOMS, RULES, {
    labs: { estradiol: { label: 'Estradiol', value: 0.5, raw: '<0.5 (0.5-40)', unit: 'pg/mL', low: 10, high: 40, at: '2024-09-01T12:00:00Z' } },
    recentCompounds: [],
  }, NOW)
  assert.equal(s.insights[0].causes[0].evidence[0], 'Your last estradiol was <0.5 pg/mL, below range (1 Sep 2024).')
})

check('custom symptom names keep their acronyms mid-sentence', () => {
  const pip = { key: 'pip', label: 'PIP', direction: 'negative', custom: true }
  const hrv = { key: 'hrv', label: 'HRV', direction: 'positive', custom: true }
  const rows = [{ recordedAt: at(1), headache: 2, extras: { pip: { v: 2, label: 'PIP', dir: 'negative' }, hrv: { v: 1, label: 'HRV', dir: 'positive' } } }]
  const s = wellbeingSummary(rows, [...ALL_SYMPTOMS, pip, hrv], RULES, ctx, NOW)
  assert.equal(s.insights[0].title, 'Headache, PIP and low HRV')
})

check('very high blood pressure gets a stronger nudge', () => {
  const s = wellbeingSummary([{ recordedAt: at(1), headache: 3 }], ALL_SYMPTOMS, RULES, { labs: {}, bp: { sys: 162, dia: 101, n: 4 }, recentCompounds: [] }, NOW)
  assert.ok(s.insights[0].causes[0].evidence.some((e) => e.includes('worth raising with a doctor soon')))
})

// --- the real cause map ------------------------------------------------------
const { CAUSES } = await import('../src/lib/wellbeingCauses.ts')

check('every symptom has a cause line, short and without em dashes', () => {
  for (const d of ALL_SYMPTOMS) {
    const rule = CAUSES[`${d.key}:${d.direction === 'positive' ? 'low' : 'high'}`]
    assert.ok(rule, d.key)
    for (const line of [rule.line, ...(rule.compounds ?? []).map((c) => c.line)]) {
      assert.ok(!line.includes('\u2014'), line)
      assert.ok(line.length <= 115, `${line.length}: ${line}`)
    }
    assert.equal(rule.markers.length, rule.markerDirection.length, d.key)
  }
})

check('compound matching: real names hit, near misses do not', () => {
  const hits = (key, name) => (CAUSES[key].compounds ?? []).find((c) => c.match.test(name))?.line
  assert.match(hits('sleep:low', 'Trenbolone Acetate'), /insomnia/)
  assert.match(hits('waterRetention:high', 'HGH'), /GH and GH boosters/)
  assert.match(hits('waterRetention:high', 'MK-677'), /GH and GH boosters/)
  assert.equal(hits('waterRetention:high', 'HGH Frag 176-191'), undefined)   // fat-loss fragment, no IGF-1 rise
  assert.equal(hits('waterRetention:high', 'GHKCU'), undefined)              // a copper peptide, not GH
  assert.match(hits('energy:low', 'Retatrutide'), /GLP-1/)
  assert.match(hits('libido:low', 'Anastrozole'), /crash estradiol/)        // AI first, before tren
  assert.match(hits('libido:low', 'Tren A + Arimidex'), /crash estradiol/)
  assert.equal(hits('headache:high', 'Testosterone E'), undefined)
})

console.log(`\n${n} checks passed`)
