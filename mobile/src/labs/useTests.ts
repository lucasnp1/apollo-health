// Every blood test, newest first, live, built once for the whole app: the web's useBloodTests (src/lib/useBloodTests.ts)
// with the app's own shot dedupe, since the web hook imports src/lib/injections.ts (vial maths, metro.config.js BANNED).
// One Dexie liveQuery feeds every screen that asks, so Home, Bloods and Timeline don't each rebuild every test.
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '@shared/lib/db'
import { buildTests, type LabTest } from '@shared/lib/labTests'
import { dedupeInjections } from '@/data/useLog'

let tests: LabTest[] | undefined
const subs = new Set<() => void>()
let started = false

function start() {
  if (started) return
  started = true
  liveQuery(async () => {
    const [exams, results, files, targets, compounds, injections] = await Promise.all([
      db.exams.toArray(),
      db.results.toArray(),
      db.files.toArray(),
      db.markerTargets.toArray(),
      db.compounds.toArray().then((rows) => rows.filter((c) => !c.deletedAtSync)),
      db.injections.toArray().then((rows) => rows.filter((i) => !i.deletedAtSync && !i.archivedAt)),
    ])
    return buildTests({ exams, results, files, targets, compounds, injections: dedupeInjections(injections) })
  }).subscribe({
    next: (t) => {
      tests = t
      subs.forEach((f) => f())
    },
    error: console.error,
  })
}

export function useTests(): LabTest[] | undefined {
  start()
  return useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => tests)
}
