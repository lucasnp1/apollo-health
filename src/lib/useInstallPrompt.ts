import { useEffect, useReducer } from 'react'

// Shared install/home-screen helper. Captures Android's `beforeinstallprompt`
// once, at module load, so whichever surface the user reaches (onboarding or the
// reminder banner) can offer one-tap install. iOS never fires this event —
// there we can only show "Add to Home Screen" instructions.

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const subscribers = new Set<() => void>()
function notify() { subscribers.forEach((fn) => fn()) }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
}

export function detectPlatform(): Platform {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS 13+ reports as Mac; treat a touch-capable "Mac" as iOS.
  if (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/(Macintosh|Windows|Linux)/i.test(ua)) return 'desktop'
  return 'unknown'
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function useInstallPrompt() {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    subscribers.add(force)
    return () => { subscribers.delete(force) }
  }, [])

  return {
    platform: detectPlatform(),
    standalone: isStandalone(),
    canInstall: deferred !== null,
    // Returns true if the user accepted the native install prompt.
    promptInstall: async (): Promise<boolean> => {
      if (!deferred) return false
      await deferred.prompt()
      const choice = await deferred.userChoice
      deferred = null
      notify()
      return choice.outcome === 'accepted'
    },
  }
}
