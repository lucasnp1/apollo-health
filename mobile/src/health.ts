// Apple Health, when switched on in You: weight and blood pressure you log in Magno go into Health, and readings other
// apps put in Health (a smart scale, a blood pressure cuff) come into Magno. Off until the person turns it on.
// Kept on this phone (localStorage): another device has its own Health and its own switch.
// Never deletes, either way (Lucas, 19 Oct 2026): archiving or editing in Magno leaves Health's copy alone (an edit
// rewrites the same sample by its sync id), and a reading removed from Health stays in Magno. Keep it that way.
import { AppState } from 'react-native'
import { useSyncExternalStore } from 'react'
import { db } from '@shared/lib/db'
import { Health } from '../modules/health'
import { DAY } from '@/log'

type State = { on: boolean; weightSince: number; bpSince: number; lastAt?: number; imported?: number }
const KEY = 'magno.health'
const fresh = (): State => ({ on: false, weightSince: Date.now() - 730 * DAY, bpSince: Date.now() - 730 * DAY })
let state: State = (() => {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return fresh()
  }
})()
const subs = new Set<() => void>()
function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
  subs.forEach((f) => f())
}
export const useHealth = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)
export const healthAvailable = !!Health

/** Turns it on: Apple's permission sheet, then everything already logged goes into Health and Health's readings come in. */
export async function enableHealth() {
  if (!Health) return
  await Health.requestAccess()
  set({ on: true })
  await Promise.all([pushHistory(), importFromHealth()])
}
export const disableHealth = () => set({ on: false })

// One write a reading, to Health. Magno's id is the sync identifier, so a reading written twice replaces itself.
export async function pushWeight(rowId: number) {
  if (!Health || !state.on) return
  const b = await db.bodyMetrics.get(rowId)
  if (b?.weightKg !== undefined && b.source === 'manual') await Health.writeWeight((b as { serverId?: string }).serverId ?? String(b.id), b.weightKg, Date.parse(b.measuredAt)).catch(console.warn)
}
export async function pushBloodPressure(rowId: number) {
  if (!Health || !state.on) return
  const v = await db.vitals.get(rowId)
  if (v && !(v as { healthId?: string }).healthId) await Health.writeBloodPressure((v as { serverId?: string }).serverId ?? String(v.id), v.systolic, v.diastolic, Date.parse(v.measuredAt)).catch(console.warn)
}

/** What was logged in Magno before the switch went on. */
async function pushHistory() {
  const [weights, vitals] = await Promise.all([
    db.bodyMetrics.toArray().then((rows) => rows.filter((b) => b.source === 'manual' && b.weightKg !== undefined && !b.archivedAt && !(b as { deletedAtSync?: number }).deletedAtSync)),
    db.vitals.toArray().then((rows) => rows.filter((v) => !v.archivedAt && !(v as { healthId?: string }).healthId)),
  ])
  for (const b of weights) await pushWeight(b.id!)
  for (const v of vitals) await pushBloodPressure(v.id!)
}

let importing: Promise<void> | undefined
/** Health's readings from other apps since the last look; each comes in once. */
export function importFromHealth(): Promise<void> {
  if (!Health || !state.on) return Promise.resolve()
  importing ??= (async () => {
    let added = 0
    try {
      const [weights, bps] = await Promise.all([Health.readWeights(state.weightSince - DAY), Health.readBloodPressure(state.bpSince - DAY)])
      for (const w of weights) {
        const externalKey = `hk:${w.id}`
        if (await db.bodyMetrics.where('externalKey').equals(externalKey).count()) continue
        await db.bodyMetrics.add({ measuredAt: new Date(w.at).toISOString(), source: 'apple_health', weightKg: Math.round(w.kg * 10) / 10, externalKey })
        added++
      }
      const vitals = bps.length ? await db.vitals.toArray() : []
      for (const r of bps) {
        const sys = Math.round(r.systolic)
        const dia = Math.round(r.diastolic)
        const minute = Math.floor(r.at / 60_000)
        // the same reading already here: brought in before, or typed in by hand from the same cuff
        const seen = vitals.some((v) => (v as { healthId?: string }).healthId === r.id || (Math.floor(Date.parse(v.measuredAt) / 60_000) === minute && v.systolic === sys && v.diastolic === dia))
        if (seen) continue
        await db.vitals.add({ measuredAt: new Date(r.at).toISOString(), systolic: sys, diastolic: dia, notes: `From Apple Health (${r.source})`, ...({ healthId: r.id } as object) })
        added++
      }
      const last = (xs: { at: number }[], prev: number) => (xs.length ? Math.max(prev, xs[xs.length - 1].at) : prev)
      set({ weightSince: last(weights, state.weightSince), bpSince: last(bps, state.bpSince), lastAt: Date.now(), imported: added })
    } catch (err) {
      console.warn('Apple Health import failed', err)
    } finally {
      importing = undefined
    }
  })()
  return importing
}

let started = false
export function startHealth() {
  if (started || !Health) return
  started = true
  void importFromHealth()
  AppState.addEventListener('change', (s) => void (s === 'active' && importFromHealth()))
}
