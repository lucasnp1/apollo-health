import { useEffect, useRef, useState } from 'react'
import { syncAll, type SyncSummary } from './sync'

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'error'
  lastRunAt?: number
  lastError?: string
  summaries: SyncSummary[]
}

const INTERVAL_MS = 30_000

// Runs the sync engine whenever a server session is active. Triggers:
//   1) initial mount (one tick after authentication resolves)
//   2) every INTERVAL_MS while the tab is foregrounded
//   3) on visibilitychange when the tab becomes visible again
//   4) on `online` event so resumed connectivity flushes pending writes
export function useSync(enabled: boolean): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle', summaries: [] })
  const running = useRef(false)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const timerRef: { current: number | undefined } = { current: undefined }

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

    function onVisibility() {
      if (document.visibilityState === 'visible') void tick()
    }
    function onOnline() { void tick() }

    void tick()
    timerRef.current = window.setInterval(() => { void tick() }, INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      if (timerRef.current) window.clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled])

  return status
}
