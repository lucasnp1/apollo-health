// Symptom rating self-check. Run: node scripts/symptoms.test.mjs
import assert from 'node:assert/strict'
import { ratingOf, withRating, customDefs, customKey, chipTone } from '../src/lib/symptoms.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }

const mood = { key: 'mood', label: 'Mood', direction: 'positive' }
const anx = { key: 'anxiety', label: 'Anxiety', direction: 'negative', custom: true }

check('built-in ratings read and write as columns', () => {
  const s = withRating({}, mood, 4)
  assert.equal(s.mood, 4)
  assert.equal(ratingOf(s, mood), 4)
  assert.equal(s.extras, undefined)
})

check('0 is a real rating, not absence', () => {
  const s = withRating({}, mood, 0)
  assert.equal(ratingOf(s, mood), 0)
  assert.equal(ratingOf({}, mood), undefined)
})

check('custom ratings live in extras and carry their own meaning', () => {
  const s = withRating({}, anx, 3)
  assert.deepEqual(s.extras, { anxiety: { v: 3, label: 'Anxiety', dir: 'negative' } })
  assert.equal(ratingOf(s, anx), 3)
})

check('clearing a custom rating removes the key', () => {
  let s = withRating({}, anx, 3)
  s = withRating(s, anx, undefined)
  assert.deepEqual(s.extras, {})
  assert.equal(ratingOf(s, anx), undefined)
})

check('custom and built-in coexist without clobbering', () => {
  let s = withRating({}, mood, 5)
  s = withRating(s, anx, 1)
  assert.equal(s.mood, 5)
  assert.equal(ratingOf(s, anx), 1)
})

check('custom defs rebuild themselves from the rows', () => {
  const rows = [withRating({}, anx, 2), withRating({}, { key: 'pumps', label: 'Pumps', direction: 'positive', custom: true }, 4)]
  const defs = customDefs(rows)
  assert.equal(defs.length, 2)
  assert.deepEqual(defs.map((d) => d.label), ['Anxiety', 'Pumps'])
  assert.equal(defs.find((d) => d.key === 'pumps').direction, 'positive')
  assert.ok(defs.every((d) => d.custom))
})

check('rows with no extras contribute nothing', () => {
  assert.deepEqual(customDefs([{ mood: 3 }, {}]), [])
})

check('labels become stable keys', () => {
  assert.equal(customKey('  Joint  Pain! '), 'joint-pain')
  assert.equal(customKey('Anxiety'), 'anxiety')
  assert.equal(customKey('!!!'), '')
})

check('tone respects direction, including 0', () => {
  assert.equal(chipTone(0, 'negative'), 'good')   // no acne is good
  assert.equal(chipTone(0, 'positive'), 'bad')    // no energy is bad
  assert.equal(chipTone(3, 'positive'), 'neutral')
  assert.equal(chipTone(5, 'negative'), 'bad')
})

console.log(`\n${n} checks passed`)
