import { useCallback, useEffect, useRef, useState } from 'react'
import { getLockConfig, setLockPassphrase, updateIdleMinutes, verifyPassphrase } from './lock'

type LockMode = 'loading' | 'setup' | 'locked' | 'unlocked'

const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const

export function useLockState() {
  const [mode, setMode] = useState<LockMode>('loading')
  const [idleMinutes, setIdleMinutesState] = useState(5)
  const [error, setError] = useState('')
  const [lockedUntil, setLockedUntil] = useState(0)
  const failedAttempts = useRef(0)
  const idleTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const config = await getLockConfig()
      if (cancelled) return
      setIdleMinutesState(config?.idleMinutes ?? 5)
      setMode(config ? 'locked' : 'setup')
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const lock = useCallback(() => {
    setError('')
    setMode((current) => (current === 'unlocked' ? 'locked' : current))
  }, [])

  const resetIdleTimer = useCallback(() => {
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(lock, idleMinutes * 60 * 1000)
  }, [idleMinutes, lock])

  useEffect(() => {
    if (mode !== 'unlocked') return undefined

    resetIdleTimer()
    activityEvents.forEach((event) => window.addEventListener(event, resetIdleTimer, { passive: true }))
    window.addEventListener('visibilitychange', resetIdleTimer)

    return () => {
      window.clearTimeout(idleTimer.current)
      activityEvents.forEach((event) => window.removeEventListener(event, resetIdleTimer))
      window.removeEventListener('visibilitychange', resetIdleTimer)
    }
  }, [mode, resetIdleTimer])

  async function setup(passphrase: string) {
    if (passphrase.length < 8) {
      setError('Use at least 8 characters.')
      return false
    }

    await setLockPassphrase(passphrase, idleMinutes)
    failedAttempts.current = 0
    setError('')
    setMode('unlocked')
    return true
  }

  async function unlock(passphrase: string) {
    if (Date.now() < lockedUntil) {
      setError('Too many attempts. Wait a moment and try again.')
      return false
    }

    const verified = await verifyPassphrase(passphrase)
    if (!verified) {
      failedAttempts.current += 1
      if (failedAttempts.current >= 5) {
        setLockedUntil(Date.now() + 30_000)
        failedAttempts.current = 0
      }
      setError('Passphrase does not match.')
      return false
    }

    failedAttempts.current = 0
    setError('')
    setMode('unlocked')
    return true
  }

  async function setIdleMinutes(next: number) {
    setIdleMinutesState(next)
    await updateIdleMinutes(next)
  }

  return {
    error,
    idleMinutes,
    isLocked: mode === 'loading' || mode === 'setup' || mode === 'locked',
    lock,
    mode,
    setIdleMinutes,
    setup,
    unlock,
  }
}
