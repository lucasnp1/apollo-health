import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { dedupeInjections } from './injections'
import { buildTests, type LabTest } from './labTests'

/**
 * Every blood test, newest first, read live from Dexie. Compounds include
 * archived ones and injections are uncapped, so a test from two years ago
 * still shows what was being taken at the draw.
 */
export function useBloodTests(): LabTest[] | undefined {
  const exams = useLiveQuery(() => db.exams.toArray(), [])
  const results = useLiveQuery(() => db.results.toArray(), [])
  const files = useLiveQuery(() => db.files.toArray(), [])
  const targets = useLiveQuery(() => db.markerTargets.toArray(), [])
  const compounds = useLiveQuery(() => db.compounds.filter((c) => !c.deletedAtSync).toArray(), [])
  const injections = useLiveQuery(
    async () => dedupeInjections(await db.injections.filter((i) => !i.deletedAtSync && !i.archivedAt).toArray()),
    [],
  )
  return useMemo(
    // undefined until every query has loaded, so a half-loaded read never shows a false all-clear.
    () => (exams && results && files && targets && compounds && injections
      ? buildTests({ exams, results, files, targets, compounds, injections })
      : undefined),
    [exams, results, files, targets, compounds, injections],
  )
}
