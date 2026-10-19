// Every blood test, newest first, live, built once for the whole app: the web's useBloodTests (src/lib/useBloodTests.ts)
// with the app's own shot dedupe, since the web hook imports src/lib/injections.ts (vial maths, metro.config.js BANNED).
// One Dexie liveQuery feeds every screen that asks, so Home, Bloods and Timeline don't each rebuild every test.
import { db, type InjectionLog } from '@shared/lib/db'
import { buildTests, type LabTest } from '@shared/lib/labTests'
import { isAndrogen } from '@shared/lib/protocolAtDraw'
import { dedupeInjections, shared } from '@/data/useLog'
import { DAY } from '@/log'

export const useTests = shared<LabTest[] | undefined>(async () => {
  const [exams, results, files, targets, compounds] = await Promise.all([
    db.exams.toArray(),
    db.results.toArray(),
    db.files.toArray(),
    db.markerTargets.toArray(),
    db.compounds.toArray().then((rows) => rows.filter((c) => !c.deletedAtSync)),
  ])
  // A test only reads the shots before its draw, so read up to the newest draw (two days' slack for time zones): the
  // live query then ignores today's shots and logging one doesn't rebuild every test. Until an androgen dose falls in
  // that range (or the newest date doesn't parse), a later first dose still turns earlier draws into baselines: read them all.
  const newest = exams.reduce((a, e) => (e.collectedAt > a ? e.collectedAt : a), '')
  const t = Date.parse(newest.slice(0, 10))
  const until = Number.isFinite(t) ? new Date(t + 2 * DAY).toISOString() : undefined
  const live = (rows: InjectionLog[]) => rows.filter((i) => !i.deletedAtSync && !i.archivedAt)
  const androgens = new Set(compounds.filter(isAndrogen).map((c) => c.id))
  let shots = until ? live(await db.injections.where('takenAt').belowOrEqual(until).toArray()) : []
  if (exams.length && !shots.some((i) => androgens.has(i.compoundId))) shots = live(await db.injections.toArray())
  const injections = dedupeInjections(shots)
  return buildTests({ exams, results, files, targets, compounds, injections })
}, undefined)
