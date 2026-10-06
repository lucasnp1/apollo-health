// Home "What needs a look" self-check. Run: node scripts/home-insights.test.mjs
import assert from 'node:assert/strict'
import { bpInsight, countLine, doseChange, labInsight, rankInsights, staleInsight, symptomInsight } from '../src/lib/homeInsights.ts'

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
  assert.equal(i.title, 'Up 10 points to 139/87')
  assert.equal(i.area, 'Blood pressure')
  assert.equal(i.tone, 'warn')
  assert.equal(i.sub, 'Lines up with weight, hematocrit, estradiol and dose')
  assert.deepEqual(i.signals.map((x) => `${x.label} ${x.value}`), ['Your average 139/87', 'Weight +2 kg', 'Hematocrit 56%', 'Estradiol 44 pg/mL', 'Testosterone dose +50%'])
  assert.match(i.signals[0].text, /against 129\/80/)
  assert.match(i.signals[4].text, /450 mg in the last three weeks against 300 mg/)
}
// High with weight down: weight is ruled out, not blamed.
{
  const i = bpInsight({ vitals: [bp(1, 150, 96), bp(3, 148, 95)], weights: [{ at: ago(1), kg: 80 }, { at: ago(30), kg: 83 }] }, NOW)
  assert.equal(i.tone, 'bad')
  assert.equal(i.title, 'Averaging 149/96')
  assert.equal(i.sub, 'Not weight, and nothing else in your logs yet')
  assert.deepEqual([i.signals[1].value, i.signals[1].tone], ['−3 kg', 'good'])
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
  assert.equal(none.sub, 'HCT 56% · Oct 1 test')
  assert.equal(none.summary, 'Hematocrit is 56%.')
  assert.deepEqual(none.signals.map((x) => x.tone), ['bad', 'good'])
  const bled = labInsight(f, test, [{ performedAt: '2026-10-04', kind: 'therapeutic', volumeMl: 500 }], '2026-10-06')
  assert.equal(bled.chip, 'Retest')
  assert.equal(bled.logBleed, undefined)
  assert.equal(bled.sub, 'Venesection Oct 4 · retest around Nov 1')
  assert.equal(bled.signals[2].text, 'Logged after this test. A retest around Nov 1 shows what it did.')
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
  assert.equal(s.sub, 'All mild · 5 check-ins in 30 days')
  assert.deepEqual(s.signals[0], { label: 'Headache', value: 'twice', tone: undefined, text: 'Check BP.' })
  assert.equal(s.signals[1].value, 'once this week')
  const order = rankInsights([s, { kind: 'stale', tone: 'warn' }, { kind: 'bp', tone: 'bad' }, { kind: 'bloods', tone: 'warn' }]).map((i) => i.kind)
  assert.deepEqual(order, ['bp', 'bloods', 'stale', 'symptoms'])
  // A strong check-in sits after same-level findings but before milder ones.
  const strong = rankInsights([{ kind: 'bloods', tone: 'warn' }, { kind: 'symptoms', tone: 'bad' }, { kind: 'bp', tone: 'bad' }, { kind: 'bleed', tone: 'neutral' }]).map((i) => i.kind)
  assert.deepEqual(strong, ['bp', 'bloods', 'symptoms', 'bleed'])
  assert.deepEqual(rankInsights([{ kind: 'bloods', tone: 'warn' }, { kind: 'bp', tone: 'warn' }, { kind: 'bloods', tone: 'bad' }]).map((i) => `${i.kind}:${i.tone}`), ['bloods:bad', 'bp:warn', 'bloods:warn'])
}
assert.equal(countLine([{ kind: 'bp', tone: 'bad' }, { kind: 'bloods', tone: 'warn' }, { kind: 'symptoms', tone: 'bad' }, { kind: 'bleed', tone: 'neutral' }]), '1 to act on, 1 to watch')
assert.equal(countLine([{ kind: 'symptoms', tone: 'neutral' }]), 'Nothing to act on')
console.log('home insights ok')
