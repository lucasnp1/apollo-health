// Compound grouping self-check. Run: node scripts/compounds.test.mjs
import assert from 'node:assert/strict'
import { compoundGroups, groupByCompoundId, findCompoundByName, compoundKey, colorFixes, colorsClash, randomDistinctColor } from '../src/lib/compounds.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }

const C = (id, name, extra = {}) => ({ id, name, category: 'Other', defaultDose: 0, unit: 'mg', schedule: '', color: '#fff', ...extra })
const I = (compoundId) => ({ compoundId, takenAt: '2026-01-01T00:00:00Z', unit: 'mg', route: 'SubQ' })

check('five rows of one name collapse to one group holding every id', () => {
  const rows = [C(1, 'Retatrutide'), C(2, 'Retatrutide'), C(3, 'retatrutide '), C(4, 'RETATRUTIDE'), C(5, 'Retatrutide')]
  const g = compoundGroups(rows, [])
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].ids, [1, 2, 3, 4, 5])
  assert.equal(g[0].key, 'retatrutide')
})

check('canonical is the row actually in use, not the lowest id', () => {
  const rows = [C(1, 'Test E', { lastDose: 999 }), C(2, 'Test E', { lastDose: 150 })]
  // Row 2 holds nearly all the history, so its remembered numbers are the real ones.
  const injections = [...Array(30)].map(() => I(2)).concat([I(1)])
  const g = compoundGroups(rows, injections)
  assert.equal(g[0].canonical.id, 2)
  assert.equal(g[0].canonical.lastDose, 150)
})

check('with no injections at all, the newest row wins the tie', () => {
  const g = compoundGroups([C(1, 'BPC157'), C(7, 'BPC157')], [])
  assert.equal(g[0].canonical.id, 7)
})

check('different compounds stay separate', () => {
  const g = compoundGroups([C(1, 'Retatrutide'), C(2, 'BPC157'), C(3, 'Retatrutide')], [])
  assert.equal(g.length, 2)
  assert.deepEqual(g.map((x) => x.name).sort(), ['BPC157', 'Retatrutide'])
})

check('every duplicate id resolves to the same group', () => {
  const rows = [C(1, 'GHKCU'), C(2, 'GHKCU'), C(3, 'MOTSC')]
  const map = groupByCompoundId(compoundGroups(rows, []))
  assert.equal(map.get(1).key, map.get(2).key)
  assert.notEqual(map.get(1).key, map.get(3).key)
  // This is the property the Timeline filter relies on: filtering by the group
  // shows shots logged against ANY of its rows.
  assert.ok(map.get(1).ids.includes(2))
})

check('name lookup is case and whitespace insensitive', () => {
  const rows = [C(1, 'Retatrutide')]
  assert.equal(findCompoundByName(rows, '  retatrutide ')?.id, 1)
  assert.equal(findCompoundByName(rows, 'RETATRUTIDE')?.id, 1)
  assert.equal(findCompoundByName(rows, 'Primobolan'), undefined)
  assert.equal(compoundKey('  Test E  '), 'test e')
})

check('empty input is empty output, not a crash', () => {
  assert.deepEqual(compoundGroups([], []), [])
  assert.equal(groupByCompoundId([]).size, 0)
})

check('rows with no id are grouped but contribute no filterable id', () => {
  const g = compoundGroups([C(undefined, 'Unsaved'), C(4, 'Unsaved')], [])
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].ids, [4])
})

// --- colours ----------------------------------------------------------------
// Production on 28 Sept 2026: name, colour, shots.
const PROD = [
  ['Testosterone E', '#0f8f84', 41], ['Retatrutide', '#2563eb', 69], ['BPC157', '#f59e0b', 34],
  ['GHKCU', '#8b5cf6', 41], ['TB500', '#dc2626', 14], ['MOTSC', '#14b8a6', 13], ['SS31', '#64748b', 12],
  ['Methylene Blue', '#7c3aed', 32], ['Primobolan', '#2f8b54', 18], ['Trenbolone Acetate', '#2f8b54', 1],
]
const prodRows = PROD.map(([name, color], i) => C(i + 1, name, { color }))
const prodShots = PROD.flatMap(([, , shots], i) => Array.from({ length: shots }, () => I(i + 1)))

check('clashing colours are fixed, the most-used compound keeps its own', () => {
  const fixes = colorFixes(prodRows, prodShots)
  const byId = new Map(fixes.flatMap((f) => f.ids.map((id) => [id, f.color])))
  // Test E (41 shots) keeps teal; Primobolan and Tren were green next to it.
  assert.equal(byId.has(1), false)
  assert.ok(byId.has(9) && byId.has(10), 'Primobolan and Tren recoloured')
  // GHK-Cu (41) keeps violet; Methylene Blue (32) was a second violet.
  assert.equal(byId.has(4), false)
  assert.ok(byId.has(8))
  // Only the clashes move (Methylene Blue, MOTS-c teal next to Test E, Primo,
  // Tren); everything else keeps its colour.
  assert.deepEqual([...byId.keys()].sort((x, y) => x - y), [6, 8, 9, 10])
  // After the fixes every pair is distinct.
  const final = prodRows.map((r) => byId.get(r.id) ?? r.color)
  for (let a = 0; a < final.length; a++) for (let b = a + 1; b < final.length; b++) {
    assert.ok(!colorsClash(final[a], final[b]), `${PROD[a][0]} ${final[a]} vs ${PROD[b][0]} ${final[b]}`)
  }
  // Running it again finds nothing: no write loop.
  assert.deepEqual(colorFixes(prodRows.map((r) => ({ ...r, color: byId.get(r.id) ?? r.color })), prodShots), [])
})

check('fixes are the same on every device (no randomness)', () => {
  assert.deepEqual(colorFixes(prodRows, prodShots), colorFixes([...prodRows].reverse(), prodShots))
})

check('a new compound gets a colour nobody else has', () => {
  const used = PROD.map(([, c]) => c)
  for (let k = 0; k < 20; k++) {
    const c = randomDistinctColor(used)
    assert.ok(used.every((u) => !colorsClash(c, u)), c)
  }
})

check('dark teal and bright green are one family; greys only clash with greys', () => {
  assert.equal(colorsClash('#0f8f84', '#14b8a6'), true)   // Test E vs MOTS-c
  assert.equal(colorsClash('#0f8f84', '#2f8b54'), true)   // teal vs green: "all green"
  assert.equal(colorsClash('#64748b', '#2563eb'), false)  // slate grey vs blue
  assert.equal(colorsClash('#dc2626', '#2563eb'), false)
})

check('missing or odd colours get one', () => {
  const rows = [C(1, 'A', { color: undefined }), C(2, 'B', { color: 'var(--primary)' })]
  assert.equal(colorFixes(rows, []).length, 2)
})

console.log(`\n${n} checks passed`)
