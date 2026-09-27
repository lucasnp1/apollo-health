// Proves the pull cannot skip rows when many share one updated_at.
// Run: node scripts/sync-paging.test.mjs
//
// The bug this guards: the cursor is a timestamp and the next page asks for
// `updated_at > cursor`. If a group sharing one timestamp is split across a
// page boundary, every row after the cut is skipped forever. A data repair on
// 26 Sept 2026 stamped 567 injections with the same millisecond and the client
// silently never received the ones past row 500.
import assert from 'node:assert/strict'

const LIMIT = 500

// The paging rule from functions/api/sync/[table].ts, in isolation.
function page(all, since, limit = LIMIT) {
  const sorted = all.filter((r) => r.updated_at > since).sort((a, b) => a.updated_at - b.updated_at)
  let results = sorted.slice(0, limit)
  if (results.length === limit) {
    const lastStamp = results[results.length - 1].updated_at
    if (results[0].updated_at !== lastStamp) {
      results = results.filter((r) => r.updated_at !== lastStamp)
    } else {
      results = all.filter((r) => r.updated_at === lastStamp)
    }
    return { rows: results, cursor: results[results.length - 1].updated_at, hasMore: true }
  }
  return { rows: results, cursor: results.length ? results[results.length - 1].updated_at : since, hasMore: false }
}

// Drain the way src/lib/sync.ts pullTable does.
function drain(all) {
  const seen = new Set()
  let since = 0
  for (let i = 0; i < 50; i++) {
    const res = page(all, since)
    if (!res.rows.length) break
    for (const r of res.rows) seen.add(r.id)
    since = Math.max(since, res.cursor)
    if (!res.hasMore) break
  }
  return seen
}

let n = 0
const check = (name, fn) => { fn(); n++; console.log('  ok', name) }
const rows = (specs) => specs.flatMap(([stamp, count], g) =>
  Array.from({ length: count }, (_, i) => ({ id: `g${g}-${i}`, updated_at: stamp })))

check('the exact production shape: 567 rows on one millisecond', () => {
  const all = rows([[1000, 100], [1790427203991, 567], [1790427637219, 3]])
  const got = drain(all)
  assert.equal(got.size, all.length, `delivered ${got.size} of ${all.length}`)
})

check('a tie larger than the page still delivers in full', () => {
  const all = rows([[500, 1200]])
  assert.equal(drain(all).size, 1200)
})

check('a tie straddling the boundary is not cut', () => {
  // 499 singles then a group of 50: the page ends mid-group.
  const all = [...Array.from({ length: 499 }, (_, i) => ({ id: `s${i}`, updated_at: i + 1 })),
               ...Array.from({ length: 50 }, (_, i) => ({ id: `t${i}`, updated_at: 9999 }))]
  assert.equal(drain(all).size, 549)
})

check('ordinary unique timestamps still page correctly', () => {
  const all = Array.from({ length: 1234 }, (_, i) => ({ id: `u${i}`, updated_at: i + 1 }))
  assert.equal(drain(all).size, 1234)
})

check('a single page under the limit terminates', () => {
  const all = rows([[10, 5]])
  const res = page(all, 0)
  assert.equal(res.hasMore, false)
  assert.equal(res.rows.length, 5)
})

check('empty table is not an infinite loop', () => {
  assert.equal(drain([]).size, 0)
})

check('the OLD logic loses rows, so this test can actually fail', () => {
  const all = rows([[1000, 100], [1790427203991, 567]])
  const seen = new Set()
  let since = 0
  for (let i = 0; i < 50; i++) {
    const sorted = all.filter((r) => r.updated_at > since).sort((a, b) => a.updated_at - b.updated_at)
    const res = sorted.slice(0, LIMIT)
    if (!res.length) break
    for (const r of res) seen.add(r.id)
    since = res[res.length - 1].updated_at
    if (res.length !== LIMIT) break
  }
  assert.ok(seen.size < all.length, 'old logic should have dropped rows')
  console.log(`     (old logic delivered ${seen.size} of ${all.length}, losing ${all.length - seen.size})`)
})

console.log(`\n${n} checks passed`)
