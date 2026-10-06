// Home "What needs a look" self-check. Run: node scripts/home-insights.test.mjs
import assert from 'node:assert/strict'
import { bpInsight, doseChange, labInsight, rankInsights, staleInsight, symptomInsight } from '../src/lib/homeInsights.ts'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const ago = (d) => new Date(NOW - d * 86_400_000).toISOString()
const bp = (d, s, di) => ({ measuredAt: ago(d), systolic: s, diastolic: di })

// BP up 10 points while weight rose 2 kg, hematocrit high, dose up: all named.
{
  const i = bpInsight({
    vitals: [bp(1, 140, 88), bp(5, 138, 86), bp(30, 128, 80), bp(45, 130, 80)],
    weights: [{ at: ago(2), kg: 84 }, { at: ago(40), kg: 82 }],
    hct: { pct: 56, date: '2026-10-01' },
    e2: { pgml: 44, date: '2026-10-01' },
    dose: { recent: 450, before: 300 },
  }, NOW)
  assert.equal(i.title, 'Blood pressure up 10 points to 139/87')
  assert.equal(i.tone, 'warn')
  assert.match(i.why[0], /Weight is up 2 kg/)
  assert.ok(i.why.some((w) => /Hematocrit was 56%/.test(w)))
  assert.ok(i.why.some((w) => /Estradiol was 44/.test(w)))
  assert.ok(i.why.some((w) => /50% more testosterone/.test(w)))
  assert.deepEqual(i.facts.map((f) => f.text), ['139/87 average', 'was 129/80', 'Weight +2 kg', 'HCT 56%', 'E2 44 pg/mL', 'Dose +50%'])
}
// High with weight down: weight is ruled out, not blamed.
{
  const i = bpInsight({ vitals: [bp(1, 150, 96), bp(3, 148, 95)], weights: [{ at: ago(1), kg: 80 }, { at: ago(30), kg: 83 }] }, NOW)
  assert.equal(i.tone, 'bad')
  assert.equal(i.title, 'Blood pressure averaging 149/96')
  assert.match(i.why[0], /down 3 kg.*not what pushed it up/)
}
// Normal and steady: nothing to say. One reading: nothing either.
assert.equal(bpInsight({ vitals: [bp(1, 122, 78), bp(3, 124, 79), bp(30, 121, 78), bp(40, 123, 77)], weights: [] }, NOW), undefined)
assert.equal(bpInsight({ vitals: [bp(1, 160, 100)], weights: [] }, NOW), undefined)

// Dose: testosterone mg only, 21-day windows.
{
  const compounds = [{ id: 1, name: 'Testosterone Cypionate', category: 'TRT' }, { id: 2, name: 'BPC-157', category: 'Peptide' }]
  const inj = (d, id, dose, unit = 'mg') => ({ compoundId: id, takenAt: ago(d), dose, unit })
  assert.deepEqual(doseChange(compounds, [inj(2, 1, 150), inj(9, 1, 150), inj(16, 1, 150), inj(25, 1, 100), inj(32, 1, 100), inj(3, 2, 500, 'mcg')], NOW), { recent: 450, before: 200 })
  assert.equal(doseChange(compounds, [inj(2, 1, 150)], NOW), undefined)
}

// Blood health: a bleed after the test turns it into a retest; none and bad offers to log one.
{
  const f = { id: 'blood', label: 'Blood health', status: 'bad', headline: 'Blood is getting thick', markers: [{ label: 'HCT', display: '56%', status: 'bad' }, { label: 'Ferritin', display: '95', status: 'good' }], story: 'Hematocrit is 56%.', causes: [], practices: [] }
  const test = { id: 7, date: '2026-10-01' }
  const none = labInsight(f, test, [], '2026-10-06')
  assert.equal(none.logBleed, true)
  assert.deepEqual(none.facts, [{ text: 'HCT 56%', tone: 'bad' }])
  const bled = labInsight(f, test, [{ performedAt: '2026-10-04', kind: 'therapeutic', volumeMl: 500 }], '2026-10-06')
  assert.equal(bled.chip, 'Retest')
  assert.equal(bled.logBleed, undefined)
  assert.match(bled.why[1], /retest around Nov 1, 2026/)
}

assert.equal(staleInsight({ id: 1, date: '2026-01-01' }, '2026-10-06').title, 'Your last blood test was 9 months ago')
assert.equal(staleInsight({ id: 1, date: '2026-08-01' }, '2026-10-06'), undefined)

// Check-ins fold into one row; all mild reads as neutral and sorts last.
{
  const s = symptomInsight({ checkIns: 5, insights: [
    { keys: ['headache'], title: 'Headache', week: 0, month: 2, tone: 'warn', mild: true, causes: [{ line: 'Check BP.' }] },
    { keys: ['acne', 'bloat'], title: 'Acne and bloating', week: 1, month: 1, tone: 'warn', mild: true, causes: [] },
  ] })
  assert.equal(s.title, 'Headache, acne and bloating')
  assert.equal(s.tone, 'neutral')
  assert.equal(s.sub, 'All mild · last 30 days · 5 check-ins')
  assert.equal(s.why[0], 'Headache: twice this month, mild. Check BP.')
  const order = rankInsights([s, { kind: 'stale', tone: 'warn' }, { kind: 'bp', tone: 'bad' }, { kind: 'bloods', tone: 'warn' }]).map((i) => i.kind)
  assert.deepEqual(order, ['bp', 'bloods', 'stale', 'symptoms'])
  // A strong check-in sits after same-level findings but before milder ones.
  const strong = rankInsights([{ kind: 'bloods', tone: 'warn' }, { kind: 'symptoms', tone: 'bad' }, { kind: 'bp', tone: 'bad' }, { kind: 'bleed', tone: 'neutral' }]).map((i) => i.kind)
  assert.deepEqual(strong, ['bp', 'bloods', 'symptoms', 'bleed'])
  assert.deepEqual(rankInsights([{ kind: 'bloods', tone: 'warn' }, { kind: 'bp', tone: 'warn' }, { kind: 'bloods', tone: 'bad' }]).map((i) => `${i.kind}:${i.tone}`), ['bloods:bad', 'bp:warn', 'bloods:warn'])
}
console.log('home insights ok')
