// Keeps the phone and the account in step while signed in, with the web's own engine (src/lib/sync.ts: every table,
// last write wins). It runs at launch, when the app comes back to the front, every minute while it's open, and soon
// after any change. Signed out, nothing leaves the phone.
import { liveQuery } from 'dexie'
import { AppState } from 'react-native'
import { useSyncExternalStore } from 'react'
import { db } from '@shared/lib/db'
import { syncAll } from '@shared/lib/sync'
import { account } from './auth'

export type SyncState = { running: boolean; lastAt?: number; error?: string }

let state: SyncState = { running: false }
const subs = new Set<() => void>()
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}
export const useSyncState = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)

let running: Promise<void> | undefined
/** One sync now (or the one already running). Never throws: the error shows in Settings. */
export function syncNow(): Promise<void> {
  if (account().status !== 'authed') return Promise.resolve()
  running ??= (async () => {
    set({ running: true })
    try {
      const out = await syncAll('both')
      const failed = out.find((r) => r.error)
      set({ lastAt: Date.now(), error: failed?.error })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ running: false })
      running = undefined
    }
  })()
  return running
}

let started = false
export function startSync() {
  if (started) return
  started = true
  void syncNow()
  AppState.addEventListener('change', (s) => void (s === 'active' && syncNow()))
  setInterval(() => void (AppState.currentState === 'active' && syncNow()), 60_000)
  // a change waiting to go up: a sync shortly after, once a burst of edits settles
  let timer: ReturnType<typeof setTimeout> | undefined
  liveQuery(() => Promise.all(['injections', 'vitals', 'compounds', 'exams', 'results', 'bodyMetrics', 'symptoms'].map((t) => db.table(t).where('dirty').equals(1).count()))).subscribe(
    (counts) => {
      if (!counts.some(Boolean)) return
      clearTimeout(timer)
      timer = setTimeout(() => void syncNow(), 1500)
    },
  )
}
