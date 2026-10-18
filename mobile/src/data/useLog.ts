// Everything the logging screens read, live. The same queries as the web app's App.tsx, so both show the same rows.
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db, type InjectionLog } from '@shared/lib/db'

/**
 * Sync phantoms: the same shot pulled twice under two ids. Same compound, dose and minute is one shot; the oldest row
 * wins. Newest first. A copy of the web's src/lib/injections.ts dedupeInjections: that file also holds the vial maths,
 * which the iOS app must not ship (metro.config.js BANNED).
 */
export function dedupeInjections(list: InjectionLog[]): InjectionLog[] {
  const seen = new Set<string>()
  return [...list]
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .filter((i) => {
      const key = `${i.compoundId}|${i.dose ?? ''}|${Math.floor(Date.parse(i.takenAt) / 60_000)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
}

/**
 * A live query shared by every screen that asks: one Dexie subscription per kind of data, started on first use, so
 * moving between tabs never waits on a fresh query and a change re-renders each screen once.
 */
function shared<T>(query: () => Promise<T>, empty: T) {
  let value = empty
  let started = false
  const subs = new Set<() => void>()
  const start = () => {
    if (started) return
    started = true
    liveQuery(query).subscribe({ next: (v) => ((value = v), subs.forEach((f) => f())), error: console.error })
  }
  const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f))
  return () => {
    start()
    return useSyncExternalStore(subscribe, () => value)
  }
}

const NONE: never[] = []

export const useCompounds = shared(() => db.compounds.filter((c) => !c.archived && !c.deletedAtSync).toArray(), NONE)

export const useInjections = shared(
  async () => dedupeInjections(await db.injections.orderBy('takenAt').reverse().filter((i) => !i.deletedAtSync && !i.archivedAt).toArray()),
  NONE,
)

export const useVitals = shared(() => db.vitals.orderBy('measuredAt').reverse().filter((v) => !v.archivedAt).toArray(), NONE)

export const useBodyMetrics = shared(() => db.bodyMetrics.orderBy('measuredAt').reverse().filter((b) => !b.archivedAt).toArray(), NONE)

export const useSymptoms = shared(() => db.symptoms.orderBy('recordedAt').reverse().filter((s) => !s.archivedAt).toArray(), NONE)
