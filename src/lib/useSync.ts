import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from './db'
import { syncAll, type SyncSummary } from './sync'

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'error'
  lastRunAt?: number
  lastError?: string
  summaries: SyncSummary[]
}

// Poll interval — keeps data in sync across devices even when idle.
const INTERVAL_MS = 15_000

// Debounce dirty-write trigger so rapid local mutations collapse into one sync.
const DEBOUNCE_MS = 800

// Runs the sync engine whenever a server session is active. Triggers:
//   1) initial mount (one tick after authentication resolves)
//   2) every INTERVAL_MS
//   3) on visibilitychange / online
//   4) ~DEBOUNCE_MS after any dirty row appears (reactive — fastest path)
export function useSync(enabled: boolean): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle', summaries: [] })
  const running = useRef(false)
  const tickRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const timerRef: { current: number | undefined } = { current: undefined }
    let debounceTimer: number | undefined

    async function tick() {
      if (cancelled || running.current) return
      running.current = true
      setStatus((s) => ({ ...s, state: 'syncing' }))
      try {
        const summaries = await syncAll('both')
        if (cancelled) return
        setStatus({ state: 'idle', lastRunAt: Date.now(), summaries })
      } catch (err) {
        if (cancelled) return
        setStatus((s) => ({
          ...s,
          state: 'error',
          lastError: err instanceof Error ? err.message : String(err),
        }))
      } finally {
        running.current = false
      }
    }

    tickRef.current = tick

    function debouncedTick() {
      window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => { void tick() }, DEBOUNCE_MS)
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') void tick()
    }
    function onOnline() { void tick() }

    // Reactive trigger: watch for any dirty=1 row across all sync tables
    const dirtyObservable = liveQuery(async () => {
      const counts = await Promise.all([
        db.injections.where('dirty').equals(1).count(),
        db.vitals.where('dirty').equals(1).count(),
        db.compounds.where('dirty').equals(1).count(),
        db.exams.where('dirty').equals(1).count(),
        db.results.where('dirty').equals(1).count(),
        db.bodyMetrics.where('dirty').equals(1).count(),
        db.symptoms.where('dirty').equals(1).count(),
      ])
      return counts.reduce((a, b) => a + b, 0)
    })

    const sub = dirtyObservable.subscribe({
      next: (total) => { if (total > 0) debouncedTick() },
      error: () => { /* ignore */ },
    })

    void tick()
    timerRef.current = window.setInterval(() => { void tick() }, INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      sub.unsubscribe()
      window.clearTimeout(debounceTimer)
      if (timerRef.current) window.clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled])

  return status
}
