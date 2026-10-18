// Every blood test, newest first, live: the web's useBloodTests (src/lib/useBloodTests.ts) with the app's own shot
// dedupe, since the web hook imports src/lib/injections.ts, which carries the vial maths (metro.config.js BANNED).
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@shared/lib/db'
import { buildTests, type LabTest } from '@shared/lib/labTests'
import { dedupeInjections } from '@/data/useLog'

export function useTests(): LabTest[] | undefined {
  const exams = useLiveQuery(() => db.exams.toArray(), [])
  const results = useLiveQuery(() => db.results.toArray(), [])
  const files = useLiveQuery(() => db.files.toArray(), [])
  const targets = useLiveQuery(() => db.markerTargets.toArray(), [])
  const compounds = useLiveQuery(() => db.compounds.filter((c) => !c.deletedAtSync).toArray(), [])
  const injections = useLiveQuery(async () => dedupeInjections(await db.injections.filter((i) => !i.deletedAtSync && !i.archivedAt).toArray()), [])
  return useMemo(
    () => (exams && results && files && targets && compounds && injections ? buildTests({ exams, results, files, targets, compounds, injections }) : undefined),
    [exams, results, files, targets, compounds, injections],
  )
}
