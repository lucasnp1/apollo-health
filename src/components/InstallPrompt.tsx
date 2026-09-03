// Ongoing reminder banner for users who haven't added the PWA to their home
// screen yet. The first-run flow lives in Onboarding.tsx; this is the gentle
// nudge afterwards. Capture + platform detection are shared via useInstallPrompt.

import { useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInstallPrompt } from '../lib/useInstallPrompt'

const DISMISSED_KEY = 'apollo.installPrompt.dismissed'

export function InstallPrompt() {
  const { platform, standalone, canInstall, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState<boolean>(() => localStorage.getItem(DISMISSED_KEY) === '1')

  if (standalone) return null
  if (dismissed) return null
  if (platform === 'desktop' || platform === 'unknown') return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    const accepted = await promptInstall()
    if (accepted) dismiss()
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
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Tap <Share className="inline size-3 align-[-1px]" /> Share, then{' '}
            <strong>Add to Home Screen</strong>.
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-muted-foreground">Tap Install to add it as an app. It works offline too.</span>
        )}
      </div>
      {canInstall && (
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
