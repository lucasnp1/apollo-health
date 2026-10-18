// Everything the logging screens read, live. The same queries as the web app's App.tsx, so both show the same rows.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type InjectionLog } from '@shared/lib/db'

/**
 * Sync phantoms: the same shot pulled twice under two ids. Same compound, dose and minute is one shot; the oldest row
 * wins. Newest first. A copy of the web's src/lib/injections.ts dedupeInjections: that file also holds the vial maths,
 * which the iOS app must not ship (metro.config.js BANNED).
 */
function dedupeInjections(list: InjectionLog[]): InjectionLog[] {
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

export const useCompounds = () => useLiveQuery(() => db.compounds.filter((c) => !c.archived && !c.deletedAtSync).toArray(), [], [])

export const useInjections = () =>
  useLiveQuery(
    async () =>
      dedupeInjections(await db.injections.orderBy('takenAt').reverse().filter((i) => !i.deletedAtSync && !i.archivedAt).limit(500).toArray()),
    [],
    [],
  )

export const useVitals = () => useLiveQuery(() => db.vitals.orderBy('measuredAt').reverse().filter((v) => !v.archivedAt).limit(200).toArray(), [], [])

export const useBodyMetrics = () =>
  useLiveQuery(() => db.bodyMetrics.orderBy('measuredAt').reverse().filter((b) => !b.archivedAt).limit(200).toArray(), [], [])

export const useSymptoms = () => useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().filter((s) => !s.archivedAt).limit(200).toArray(), [], [])
