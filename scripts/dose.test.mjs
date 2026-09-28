// Dose conversion self-check. Run: node scripts/dose.test.mjs
// Node strips the types in src/lib/dose.ts and vials.ts, which import nothing
// at runtime.
import assert from 'node:assert/strict'
import {
  SYRINGES, convertAmount, convertDraw, derive, drawMarks, formatDraw, num,
  rememberedSyringe, roundForMode, syringeAdvice, syringeOf, unitLabel,
} from '../src/lib/dose.ts'
import { vialOf } from '../src/lib/vials.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`)
const S = Object.fromEntries(SYRINGES.map((s) => [s.key, s]))

// --- derive ---------------------------------------------------------------
check('mg dose converts to mL and syringe units', () => {
  const d = derive('dose', 150, 'mg', 300)          // 150 mg at 300 mg/mL
  assert.equal(d.base, 150)
  assert.equal(d.ml, 0.5)
  assert.equal(d.draw, 50)
  assert.equal(d.doseInUnit, 150)
})

check('units read back to mg through the concentration', () => {
  const d = derive('draw', 50, 'mg', 300)
  assert.equal(d.ml, 0.5)
  assert.equal(d.base, 150)
})

check('mcg compounds keep their own unit', () => {
  const d = derive('dose', 250, 'mcg', 5)           // 250 mcg = 0.25 mg at 5 mg/mL
  assert.equal(d.base, 0.25)
  assert.equal(d.ml, 0.05)
  assert.equal(d.doseInUnit, 250)
})

check('no concentration means no mL and no units', () => {
  const d = derive('dose', 150, 'mg', undefined)
  assert.equal(d.base, 150)
  assert.equal(d.ml, undefined)
  assert.equal(d.draw, undefined)
})

check('units without a concentration cannot produce a dose', () => {
  // This is why the draw tab is gated on a known strength.
  assert.equal(derive('draw', 20, 'mg', undefined).doseInUnit, undefined)
})

check('junk and non-positive amounts derive nothing', () => {
  for (const bad of [NaN, 0, -5, Infinity]) {
    assert.deepEqual(derive('dose', bad, 'mg', 300), {}, `amount ${bad}`)
  }
})

check('tren microdose: 10 mg from a 100 mg/mL oil is 10 units', () => {
  const d = derive('dose', 10, 'mg', 100)
  approx(d.ml, 0.1)
  approx(d.draw, 10)
  approx(derive('draw', 10, 'mg', 100).doseInUnit, 10)
})

check('HCG in IU: 500 IU at 2500 IU/mL is 20 units, never converted to mg', () => {
  const d = derive('dose', 500, 'iu', 2500)
  approx(d.ml, 0.2)
  approx(d.draw, 20)
  approx(derive('draw', 20, 'iu', 2500).doseInUnit, 500)
  assert.equal(convertAmount('500', 'dose', 'draw', 'iu', 2500), '20')
})

check('regular syringe reads in mL', () => {
  const d = derive('dose', 150, 'mg', 300, 1)
  assert.equal(d.ml, 0.5)
  assert.equal(d.draw, 0.5)
  assert.equal(convertAmount('150', 'dose', 'draw', 'mg', 300, 1), '0.5')
  assert.equal(convertAmount('0.5', 'draw', 'dose', 'mg', 300, 1), '150')
})

check('mcg draw reads back in mcg', () => {
  approx(derive('draw', 5, 'mcg', 5).doseInUnit, 250)
  approx(derive('dose', 250, 'mcg', 2.5).draw, 10)     // BPC 5 mg + 2 mL
})

check('non-convertible units log as typed, with no volume', () => {
  const d = derive('dose', 1, 'tablet', 100)
  assert.equal(d.doseInUnit, 1)
  assert.equal(d.ml, undefined)
  assert.equal(d.draw, undefined)
  assert.equal(derive('draw', 10, 'tablet', 100).doseInUnit, undefined)
})

// --- convertAmount: the reported bug --------------------------------------
check('switching tabs re-expresses the value instead of keeping the digits', () => {
  // The bug: 150 mg stayed "150" and was then read as 150 units.
  assert.equal(convertAmount('150', 'dose', 'draw', 'mg', 300), '50')
  assert.equal(convertAmount('50', 'draw', 'dose', 'mg', 300), '150')
})

check('same tab is a no-op', () => {
  assert.equal(convertAmount('150', 'dose', 'dose', 'mg', 300), undefined)
})

check('nothing to carry over leaves the amount alone', () => {
  assert.equal(convertAmount('', 'dose', 'draw', 'mg', 300), undefined)
  assert.equal(convertAmount('abc', 'dose', 'draw', 'mg', 300), undefined)
  assert.equal(convertAmount('150', 'dose', 'draw', 'mg', undefined), undefined)
})

check('round trip is stable within syringe-reading precision', () => {
  // 20 mg at 300 mg/mL is 6.67 units; a barrel reads 6.7, which is 20.1 mg back.
  const there = convertAmount('20', 'dose', 'draw', 'mg', 300)
  assert.equal(there, '6.7')
  const back = Number(convertAmount(there, 'draw', 'dose', 'mg', 300))
  assert.ok(Math.abs(back - 20) <= 0.15, `round trip drifted to ${back}`)
})

check('peptide case: 10 mg vial in 2 mL, 250 mcg dose', () => {
  const conc = 10 / 2                                // 5 mg/mL
  assert.equal(convertAmount('250', 'dose', 'draw', 'mcg', conc), '5')
  assert.equal(convertAmount('5', 'draw', 'dose', 'mcg', conc), '250')
})

check('decimal comma is read as a decimal point', () => {
  assert.equal(convertAmount('1,5', 'dose', 'draw', 'mg', 5), '30')
})

// --- syringe helpers --------------------------------------------------------
check('convertDraw keeps the volume across syringe families', () => {
  assert.equal(convertDraw('20', 100, 1), '0.2')
  assert.equal(convertDraw('0.25', 1, 100), '25')
  assert.equal(convertDraw('0.067', 1, 100), '6.7')
  assert.equal(convertDraw('20', 100, 100), undefined)
  assert.equal(convertDraw('', 100, 1), undefined)
})

check('num parses commas, trims, rejects junk', () => {
  assert.equal(num('1,5'), 1.5)
  assert.equal(num(' 0.3 '), 0.3)
  assert.ok(Number.isNaN(num('abc')))
  assert.ok(Number.isNaN(num('')))
  // A thousands comma is refused, not read as 5.0: a 1000x weak HCG vial.
  assert.ok(Number.isNaN(num('5,000')))
  assert.ok(Number.isNaN(num('10,000')))
  assert.equal(num('0,25'), 0.25)
})

check('roundForMode matches what each mode can express', () => {
  assert.equal(roundForMode(6.666, 'draw', 'mg', 100), '6.7')
  assert.equal(roundForMode(0.06667, 'draw', 'mg', 1), '0.067')
  assert.equal(roundForMode(3.333, 'dose', 'iu'), '3.33')
  assert.equal(roundForMode(1.23456, 'dose', 'mcg'), '1.2')
  assert.equal(roundForMode(1.23456, 'dose', 'mg'), '1.235')
})

check('formatDraw reads the barrel', () => {
  assert.equal(formatDraw(20 / 300, S.u30), '6.7')
  assert.equal(formatDraw(20 / 300, S.ml1), '0.07')
  assert.equal(formatDraw(0.2, S.u100), '20')
  assert.equal(formatDraw(0.3, S.ml3), '0.30')
  assert.equal(formatDraw(0.1 + 0.2, S.u30), '30')
})

check('drawMarks are running totals rounded once', () => {
  assert.deepEqual(drawMarks([1 / 30, 1 / 30, 1 / 30], S.u100), ['3.3', '6.7', '10'])
  assert.deepEqual(drawMarks([0.6, 0.5], S.ml3), ['0.60', '1.10'])
})

check('syringeAdvice: over capacity offers the first barrel that fits', () => {
  assert.equal(syringeAdvice(0.35, 0.35, S.u30).use.key, 'u50')
  assert.equal(syringeAdvice(1.4, 1.4, S.u100).use.key, 'ml2')   // no insulin fits, go regular
  assert.equal(syringeAdvice(1.5, 1.5, S.ml1).use.key, 'ml2')
  assert.deepEqual(syringeAdvice(3.5, 3.5, S.ml3), { kind: 'over', use: undefined })
  assert.equal(syringeAdvice(0.1 + 0.2, 0.1, S.u30), undefined)  // float sum still fits
})

check('syringeAdvice: tiny draws suggest a smaller barrel of the same family', () => {
  assert.equal(syringeAdvice(0.08, 0.08, S.u100).use.key, 'u30')
  assert.equal(syringeAdvice(0.4, 0.05, S.u100).use.key, 'u50')  // must still hold the stack
  assert.equal(syringeAdvice(0.1, 0.1, S.u100), undefined)
  assert.equal(syringeAdvice(0.25, 0.25, S.ml3).use.key, 'ml1')
  assert.equal(syringeAdvice(0.05, 0.05, S.ml1), undefined)      // never crosses to insulin
  assert.equal(syringeAdvice(0.02, 0.02, S.u30), undefined)
})

check('syringeOf falls back to the route default', () => {
  assert.equal(syringeOf('bogus', 'SubQ').key, 'u100')
  assert.equal(syringeOf(undefined, 'IM').key, 'ml1')
  assert.equal(syringeOf('u30', 'IM').key, 'u30')
})

check('rememberedSyringe only applies on the route it was used on', () => {
  assert.equal(rememberedSyringe({ syringe: 'u30', defaultRoute: 'SubQ' }, 'SubQ').key, 'u30')
  assert.equal(rememberedSyringe({ syringe: 'u30', defaultRoute: 'SubQ' }, 'IM').key, 'ml1')
  assert.equal(rememberedSyringe({ syringe: 'u30' }, 'IM').key, 'u30')
  assert.equal(rememberedSyringe({ syringe: 'x' }, 'SubQ').key, 'u100')
  assert.equal(rememberedSyringe(undefined, 'IM').key, 'ml1')
})

check('unitLabel shows IU in capitals', () => {
  assert.equal(unitLabel('iu'), 'IU')
  assert.equal(unitLabel('mg'), 'mg')
})

// --- vialOf: legacy inference on the real production rows -----------------
check('vialOf reads each production compound the right way', () => {
  const bpc = vialOf({ category: 'Peptide', defaultRoute: 'SubQ', concentration: '10mg', concentrationMgPerMl: 5, vialMg: 5, reconstituteMl: 1 })
  assert.deepEqual([bpc.kind, bpc.vialMg, bpc.water, bpc.legacy], ['powder', 5, 1, true])

  const reta = vialOf({ category: 'Peptide', concentration: '10mg' })
  assert.deepEqual([reta.kind, reta.vialMg, reta.conc], ['powder', 10, undefined])

  const teste = vialOf({ category: 'TRT', concentration: '300/ml' })
  assert.deepEqual([teste.kind, teste.conc], ['liquid', 300])

  const mb = vialOf({ category: 'Supplement', concentration: '60.0' })
  assert.deepEqual([mb.kind, mb.conc], ['liquid', 60])

  const primo = vialOf({ category: 'TRT' })
  assert.deepEqual([primo.kind, primo.conc, primo.vialMg], ['liquid', undefined, undefined])

  const ghk = vialOf({ category: 'Peptide', concentration: '100.0' })
  assert.deepEqual([ghk.kind, ghk.vialMg], ['powder', 100])
})

check('vialOf: an explicit kind wins, text is not trusted once saved', () => {
  assert.deepEqual(vialOf({ category: 'Other', concentration: '10mg' }).conc, undefined)
  const liq = vialOf({ vialKind: 'liquid', category: 'Peptide', vialMg: 5, reconstituteMl: 1, concentrationMgPerMl: 100 })
  assert.deepEqual([liq.kind, liq.conc, liq.legacy], ['liquid', 100, false])
  assert.equal(vialOf({ vialKind: 'powder', concentration: '100 mg/ml' }).vialMg, undefined)
  const odd = vialOf({ vialKind: 'gel', category: 'Peptide' })
  assert.deepEqual([odd.kind, odd.legacy], ['powder', true])
  assert.equal(vialOf({ unit: 'iu' }).kind, 'powder')
  // Route never decides: a testosterone once logged SubQ is still an oil.
  assert.equal(vialOf({ category: 'TRT', defaultRoute: 'SubQ', concentration: '250 mg/ml' }).kind, 'liquid')
  assert.equal(vialOf({ concentration: '2,5 mg/ml' }).conc, 2.5)
})

console.log(`\n${n} checks passed`)
