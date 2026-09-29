// Site catalog self-check. Run: node scripts/sites.test.mjs
import assert from 'node:assert/strict'
import { canonicalSite, groupOf, isCustomSite, quickSites, siteLabel } from '../src/lib/sites.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }

check('the rotation lists run head to legs, left before right', () => {
  assert.deepEqual(quickSites('IM').map((s) => s.site), [
    'Rear Deltoid L', 'Rear Deltoid R', 'Side Deltoid L', 'Side Deltoid R', 'Front Deltoid L', 'Front Deltoid R',
    'Lats L', 'Lats R', 'Ventrogluteal L', 'Ventrogluteal R', 'Vastus Lateralis L', 'Vastus Lateralis R',
  ])
  assert.deepEqual(quickSites('SubQ').map((s) => s.site), [
    'Abdomen L', 'Abdomen R', 'Love Handle L', 'Love Handle R', 'Glute SubQ L', 'Glute SubQ R',
    'Inner Thigh L', 'Inner Thigh R', 'Outer Thigh L', 'Outer Thigh R',
  ])
})

check('every spelling found in real history lands on one catalog site', () => {
  assert.equal(canonicalSite('Rear deltoid R'), 'Rear Deltoid R')
  assert.equal(canonicalSite(' front deltoid l '), 'Front Deltoid L')
  assert.equal(canonicalSite('Lat L'), 'Lats L')
  assert.equal(canonicalSite('Upper Thigh R'), 'Inner Thigh R')
  assert.equal(canonicalSite('Love Handles L'), 'Love Handle L')
})

check('known names are never custom; typed ones are', () => {
  for (const s of ['Deltoid L', 'Dorsogluteal R', 'Lat R', 'Navel (SubQ)', 'Upper Thigh L']) assert.equal(isCustomSite(s), false, s)
  assert.equal(isCustomSite('Calf L'), true)
})

check('neighbours share a group, and labels read like speech', () => {
  assert.equal(groupOf('Rear deltoid L'), groupOf('Front Deltoid L'))
  assert.notEqual(groupOf('Inner Thigh L'), groupOf('Outer Thigh L'))
  assert.equal(siteLabel('Lat R'), 'Lats, right')
  assert.equal(siteLabel('Calf L'), 'Calf L')
})

check('typed names find the right neighbours', () => {
  // Old SubQ glute shots were logged with the IM names; they still warn Glute SubQ.
  assert.equal(groupOf('Dorsogluteal L'), groupOf('Glute SubQ L'))
  assert.equal(groupOf('outer thigh R'), groupOf('Outer Thigh R'))
  assert.equal(groupOf('inner thigh L'), groupOf('Inner Thigh L'))
  assert.equal(groupOf('Lateral thigh L'), groupOf('Vastus Lateralis L'))
})

console.log(`\n${n} checks passed`)
