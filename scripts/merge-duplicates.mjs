// One-off repair for the duplicate rows the old seed importer left behind
// (see memory: project_apollo_data_integrity).
//
// Reads a backup directory produced by the pre-merge dump, works out the plan
// locally, and writes SQL. Nothing is deleted: rows are TOMBSTONED with
// deleted_at + a bumped updated_at, which is what makes the removal propagate
// to every device on the next pull (src/lib/sync.ts applyServerRowsBatch).
//
//   node scripts/merge-duplicates.mjs <backup-dir> [--sql out.sql]
//
// Prints a dry-run summary by default.

import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('usage: merge-duplicates.mjs <backup-dir> [--sql out.sql]'); process.exit(1) }
const sqlOut = process.argv.includes('--sql') ? process.argv[process.argv.indexOf('--sql') + 1] : null

const load = (t) => JSON.parse(fs.readFileSync(path.join(dir, `${t}.json`), 'utf8'))
const live = (rows) => rows.filter((r) => r.deleted_at === null || r.deleted_at === undefined)

const compounds = live(load('compounds'))
const injections = live(load('injections'))
const exams = live(load('exams'))
const results = live(load('results'))
const files = live(load('files'))
const protocols = live(load('protocols'))
const vials = live(load('vials'))

const NOW = Number(process.env.MERGE_NOW || Date.now())
const key = (s) => String(s ?? '').trim().toLowerCase()
const sql = []
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

const tomb = (table, id) => sql.push(
  `UPDATE ${table} SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = ${q(id)};`)
const repoint = (table, col, id, to) => sql.push(
  `UPDATE ${table} SET ${col} = ${q(to)}, updated_at = ${NOW} WHERE id = ${q(id)};`)

// ── compounds: one row per name ────────────────────────────────────────────
// Canonical = most injections, tie broken by the newest row. Same rule as
// src/lib/compounds.ts, so the UI and the data agree on which row wins.
const shots = new Map()
for (const i of injections) shots.set(i.compound_id, (shots.get(i.compound_id) ?? 0) + 1)

const byName = new Map()
for (const c of compounds) {
  const k = key(c.name)
  if (!byName.has(k)) byName.set(k, [])
  byName.get(k).push(c)
}
const canonicalOf = new Map()   // compound_id -> canonical compound_id
const compoundsDropped = []
for (const [, rows] of byName) {
  const canon = rows.reduce((best, c) => {
    const a = shots.get(c.id) ?? 0, b = shots.get(best.id) ?? 0
    if (a !== b) return a > b ? c : best
    return (c.created_at ?? 0) > (best.created_at ?? 0) ? c : best
  }, rows[0])
  for (const c of rows) {
    canonicalOf.set(c.id, canon.id)
    if (c.id !== canon.id) compoundsDropped.push(c)
  }
}

// ── injections: one row per real shot ──────────────────────────────────────
// Identity = the compound NAME (not the duplicate row), the instant, the dose
// and the site. The same physical shot was logged against up to 4 rows.
const nameOfCompound = new Map(compounds.map((c) => [c.id, key(c.name)]))
const shotKey = (i) => [
  nameOfCompound.get(i.compound_id) ?? `?${i.compound_id}`,
  i.taken_at, i.dose ?? '', i.unit ?? '', key(i.site), i.route ?? '',
].join('|')

const shotGroups = new Map()
for (const i of injections) {
  const k = shotKey(i)
  if (!shotGroups.has(k)) shotGroups.set(k, [])
  shotGroups.get(k).push(i)
}

let injKept = 0, injDropped = 0, injRepointed = 0
const badDates = []
for (const [, group] of shotGroups) {
  // Prefer the copy already attached to the canonical compound, then the oldest
  // row, so the surviving id is the most stable one.
  const keep = group.find((i) => canonicalOf.get(i.compound_id) === i.compound_id)
    ?? group.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))[0]
  injKept++
  const canon = canonicalOf.get(keep.compound_id)
  if (canon && canon !== keep.compound_id) { repoint('injections', 'compound_id', keep.id, canon); injRepointed++ }
  // Malformed dates are NOT repaired here. There was exactly one (a year typed
  // as 0205), and the real year is only recoverable from context - the rest of
  // that compound's shots. A generic un-transposing rule guesses wrong more
  // often than it helps, so bad dates are reported and fixed by hand.
  if (keep.taken_at && !/^\d{4}-/.test(keep.taken_at)) badDates.push(`${keep.id}  ${keep.taken_at}`)
  for (const i of group) if (i.id !== keep.id) { tomb('injections', i.id); injDropped++ }
}

// ── exams + their results ──────────────────────────────────────────────────
// Only collapse exams that are genuinely identical: same name, same collection
// time AND the same marker fingerprint. Two same-named panels taken on
// different dates are real repeat tests and both survive.
const resultsByExam = new Map()
for (const r of results) {
  if (!resultsByExam.has(r.exam_id)) resultsByExam.set(r.exam_id, [])
  resultsByExam.get(r.exam_id).push(r)
}
const fingerprint = (examId) => {
  const rs = resultsByExam.get(examId) ?? []
  return rs.map((r) => `${key(r.marker)}=${r.value ?? ''}${r.unit ?? ''}`).sort().join(';')
}

const examGroups = new Map()
for (const e of exams) {
  const k = [key(e.name), e.collected_at, fingerprint(e.id)].join('|')
  if (!examGroups.has(k)) examGroups.set(k, [])
  examGroups.get(k).push(e)
}
let examsKept = 0, examsDropped = 0, resultsDropped = 0
for (const [, group] of examGroups) {
  const keep = group.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))[0]
  examsKept++
  for (const e of group) {
    if (e.id === keep.id) continue
    tomb('exams', e.id); examsDropped++
    for (const r of resultsByExam.get(e.id) ?? []) { tomb('results', r.id); resultsDropped++ }
  }
}

// ── files ──────────────────────────────────────────────────────────────────
const fileGroups = new Map()
for (const f of files) {
  const k = [key(f.name), f.size ?? ''].join('|')
  if (!fileGroups.has(k)) fileGroups.set(k, [])
  fileGroups.get(k).push(f)
}
let filesKept = 0, filesDropped = 0
for (const [, group] of fileGroups) {
  const keep = group.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))[0]
  filesKept++
  for (const f of group) if (f.id !== keep.id) { tomb('files', f.id); filesDropped++ }
}

// ── anything else pointing at a dropped compound ───────────────────────────
let fkFixed = 0
for (const [table, rows] of [['protocols', protocols], ['vials', vials]]) {
  for (const r of rows) {
    const canon = canonicalOf.get(r.compound_id)
    if (canon && canon !== r.compound_id) { repoint(table, 'compound_id', r.id, canon); fkFixed++ }
  }
}
for (const c of compoundsDropped) tomb('compounds', c.id)

// ── report ─────────────────────────────────────────────────────────────────
const row = (label, before, after) =>
  console.log(`  ${label.padEnd(14)} ${String(before).padStart(5)} -> ${String(after).padStart(5)}   (${before - after} tombstoned)`)

console.log(`\nMerge plan from ${dir}\n`)
row('compounds', compounds.length, compounds.length - compoundsDropped.length)
row('injections', injections.length, injKept)
row('exams', exams.length, examsKept)
row('results', results.length, results.length - resultsDropped)
row('files', files.length, filesKept)
console.log(`\n  injections repointed to canonical compound: ${injRepointed}`)
if (badDates.length) console.log(`  MALFORMED DATES (fix by hand):              ${badDates.join(', ')}`)
console.log(`  protocol/vial FKs repointed:                ${fkFixed}`)
console.log(`  SQL statements:                             ${sql.length}`)

if (sqlOut) {
  fs.writeFileSync(sqlOut, `-- generated ${new Date(NOW).toISOString()} from ${dir}\n` + sql.join('\n') + '\n')
  console.log(`\nwrote ${sqlOut}`)
} else {
  console.log('\n(dry run — pass --sql <file> to emit)')
}
