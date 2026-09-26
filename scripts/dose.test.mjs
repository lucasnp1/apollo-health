// Dose conversion self-check. Run: node scripts/dose.test.mjs
// Node strips the types in src/lib/dose.ts, which imports nothing at runtime.
import assert from 'node:assert/strict'
import { convertAmount, derive } from '../src/lib/dose.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }

// --- derive ---------------------------------------------------------------
check('mg dose converts to mL and syringe units', () => {
  const d = derive('dose', 150, 'mg', 300)          // 150 mg at 300 mg/mL
  assert.equal(d.mg, 150)
  assert.equal(d.ml, 0.5)
  assert.equal(d.units, 50)
  assert.equal(d.doseInUnit, 150)
})

check('units read back to mg through the concentration', () => {
  const d = derive('units', 50, 'mg', 300)
  assert.equal(d.ml, 0.5)
  assert.equal(d.mg, 150)
})

check('mcg compounds keep their own unit', () => {
  const d = derive('dose', 250, 'mcg', 5)           // 250 mcg = 0.25 mg at 5 mg/mL
  assert.equal(d.mg, 0.25)
  assert.equal(d.ml, 0.05)
  assert.equal(d.doseInUnit, 250)
})

check('no concentration means no mL and no units', () => {
  const d = derive('dose', 150, 'mg', undefined)
  assert.equal(d.mg, 150)
  assert.equal(d.ml, undefined)
  assert.equal(d.units, undefined)
})

check('units without a concentration cannot produce a dose', () => {
  // This is why the units tab is gated on conc !== undefined.
  assert.equal(derive('units', 20, 'mg', undefined).doseInUnit, undefined)
})

check('junk and non-positive amounts derive nothing', () => {
  for (const bad of [NaN, 0, -5, Infinity]) {
    assert.deepEqual(derive('dose', bad, 'mg', 300), {}, `amount ${bad}`)
  }
})

// --- convertAmount: the reported bug --------------------------------------
check('switching tabs re-expresses the value instead of keeping the digits', () => {
  // The bug: 150 mg stayed "150" and was then read as 150 units.
  assert.equal(convertAmount('150', 'dose', 'units', 'mg', 300), '50')
  assert.equal(convertAmount('50', 'units', 'dose', 'mg', 300), '150')
})

check('same tab is a no-op', () => {
  assert.equal(convertAmount('150', 'dose', 'dose', 'mg', 300), undefined)
})

check('nothing to carry over leaves the amount alone', () => {
  assert.equal(convertAmount('', 'dose', 'units', 'mg', 300), undefined)
  assert.equal(convertAmount('abc', 'dose', 'units', 'mg', 300), undefined)
  assert.equal(convertAmount('150', 'dose', 'units', 'mg', undefined), undefined)
})

check('round trip is stable within syringe-reading precision', () => {
  // 20 mg at 300 mg/mL is 6.67 units; a barrel reads 6.7, which is 20.1 mg back.
  const there = convertAmount('20', 'dose', 'units', 'mg', 300)
  assert.equal(there, '6.7')
  const back = Number(convertAmount(there, 'units', 'dose', 'mg', 300))
  assert.ok(Math.abs(back - 20) <= 0.15, `round trip drifted to ${back}`)
})

check('peptide case: 10 mg vial in 2 mL, 250 mcg dose', () => {
  const conc = 10 / 2                                // 5 mg/mL
  assert.equal(convertAmount('250', 'dose', 'units', 'mcg', conc), '5')
  assert.equal(convertAmount('5', 'units', 'dose', 'mcg', conc), '250')
})

console.log(`\n${n} checks passed`)
