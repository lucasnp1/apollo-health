// One-time install hint shown to first-time mobile/web visitors who haven't
// added the PWA to their home screen yet.
//
// iOS Safari can't programmatically install — only show instructions.
// Android Chrome fires beforeinstallprompt, which we capture and use for a
// one-tap install button.

import { useEffect, useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const DISMISSED_KEY = 'apollo.installPrompt.dismissed'

type Platform = 'ios' | 'android' | 'desktop' | 'unknown'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/(Macintosh|Windows|Linux)/i.test(ua)) return 'desktop'
  return 'unknown'
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari proprietary flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [platform] = useState<Platform>(() => detectPlatform())
  const [installed] = useState<boolean>(() => isStandalone())
  const [dismissed, setDismissed] = useState<boolean>(() => localStorage.getItem(DISMISSED_KEY) === '1')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (installed) return null
  if (dismissed) return null
  if (platform === 'desktop' || platform === 'unknown') return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') dismiss()
  }

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(70px+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-lg md:left-auto md:right-6 md:max-w-sm"
      role="region"
      aria-label="Install Apollo Health"
    >
      <Smartphone className="size-4.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <strong className="block text-[13px]">Install Apollo on your phone</strong>
        {platform === 'ios' ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Tap <Share className="inline size-3 align-[-1px]" /> Share, then{' '}
            <strong>Add to Home Screen</strong>.
          </span>
        ) : (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">Tap install to add it as an app — works offline.</span>
        )}
      </div>
      {deferredPrompt && (
        <Button size="sm" className="h-8 shrink-0" onClick={install}>
          Install
        </Button>
      )}
      <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Dismiss" onClick={dismiss}>
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
