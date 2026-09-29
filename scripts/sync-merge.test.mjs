// The pull's per-row merge. Run: node scripts/sync-merge.test.mjs
//
// A server NULL must reach every device (un-archive, undo, a cleared field),
// except on columns that were device-local before their migration.
import assert from 'node:assert/strict'
import { TABLES } from '../src/lib/syncCatalog.ts'
import { mergeServerRow } from '../src/lib/syncMerge.ts'

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }
const spec = (slug) => TABLES.find((t) => t.slug === slug)

// Pull `rows` in order onto one local row, the way applyServerRowsBatch does.
function pull(slug, rows) {
  let local
  for (const row of rows) local = mergeServerRow(spec(slug), row, local) ?? local
  if (local && local.id === undefined) local.id = 1
  return local
}
const nulls = (row) => ({ ...row, updatedAt: row.updatedAt + 1 })

check('un-archiving reaches a device that pulled the archive', () => {
  const r = { id: 's1', marker: 'ALT', value: 30, archivedAt: 1000, updatedAt: 1 }
  const out = pull('results', [r, nulls({ ...r, archivedAt: null })])
  assert.equal(out.archivedAt, undefined)
  assert.equal(out.value, 30)
})

check('a cleared high and status reach every device', () => {
  const r = { id: 's2', marker: 'ALT', value: 60, high: 50, status: 'H', updatedAt: 1 }
  const out = pull('results', [r, nulls({ ...r, high: null, status: null })])
  assert.equal(out.high, undefined)
  assert.equal(out.status, undefined)
})

check('a cleared exam meta reaches every device', () => {
  const e = { id: 's3', name: 'x', collectedAt: '2026-06-01T12:00:00Z', meta: '{"fasted":true}', updatedAt: 1 }
  const first = pull('exams', [e])
  assert.deepEqual(first.meta, { fasted: true })
  const out = pull('exams', [e, nulls({ ...e, meta: null, archivedAt: null })])
  assert.equal(out.meta, undefined)
})

check('a compound keeps a value that was local before its migration', () => {
  const local = { id: 7, serverId: 's4', name: 'Test C', lastDose: 125, vialMg: 2000, dirty: 0, updatedAt: 1 }
  const out = mergeServerRow(spec('compounds'), { id: 's4', name: 'Test C', lastDose: null, vialMg: null, color: null, updatedAt: 2 }, local)
  assert.equal(out.lastDose, 125)
  assert.equal(out.vialMg, 2000)
  assert.equal(out.id, 7)
})

check('an unresolved link keeps the local one, a NULL link clears it', () => {
  const local = { id: 3, serverId: 's6', marker: 'ALT', examId: 9, dirty: 0, updatedAt: 1 }
  assert.equal(mergeServerRow(spec('results'), { id: 's6', marker: 'ALT', examId: 'unknown-exam', updatedAt: 2 }, local).examId, 9)
  assert.equal(mergeServerRow(spec('results'), { id: 's6', marker: 'ALT', examId: null, updatedAt: 2 }, local).examId, undefined)
})

check('an unpushed local edit at least as new stays put', () => {
  const local = { id: 7, serverId: 's5', marker: 'ALT', value: 31, dirty: 1, updatedAt: 5 }
  assert.equal(mergeServerRow(spec('results'), { id: 's5', marker: 'ALT', value: 30, updatedAt: 4 }, local), null)
})

console.log(`\n${n} checks passed`)
