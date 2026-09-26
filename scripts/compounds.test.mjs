// Compound grouping self-check. Run: node scripts/compounds.test.mjs
import assert from 'node:assert/strict'
import { compoundGroups, groupByCompoundId, findCompoundByName, compoundKey } from '../src/lib/compounds.ts'

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

console.log(`\n${n} checks passed`)
