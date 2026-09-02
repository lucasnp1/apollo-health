import { useState } from 'react'
import { Check, Copy, Share2, ShieldCheck } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { Reveal } from './motion'
import { Button } from '@/components/ui/button'
import { useToast } from '../lib/toast'

function codesText(codes: string[], email?: string) {
  return [`Apollo Health recovery codes${email ? ` for ${email}` : ''}`, 'Each code works once. Keep them somewhere safe.', '', ...codes].join('\n')
}

// The code grid plus copy/share, reused by the sign-up screen and Settings.
export function RecoveryCodesList({ codes, email }: { codes: string[]; email?: string }) {
  const { showToast } = useToast()
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(codesText(codes, email))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      showToast({ tone: 'error', message: 'Could not copy. Select the codes and copy them by hand.' })
    }
  }
  async function share() {
    try {
      await navigator.share({ title: 'Apollo Health recovery codes', text: codesText(codes, email) })
    } catch { /* user cancelled */ }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 p-3 font-mono text-[13px] tabular-nums tracking-wide select-all">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? 'Copied' : 'Copy'}
        </Button>
        {canShare && (
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 className="size-3.5" /> Share
          </Button>
        )}
      </div>
    </div>
  )
}

// Full-screen "save these" step right after sign-up. Shown once.
export function RecoveryCodesScreen({ codes, email, onDone }: { codes: string[]; email?: string; onDone: () => void }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-background px-4 py-8">
      <Reveal className="w-full max-w-sm">
        <div className="w-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-lift)]">
          <p className="eyebrow mb-4">One-time setup</p>
          <div className="flex items-center gap-3">
            <BrandMark size={44} />
            <div>
              <h1 className="font-display text-2xl font-semibold leading-none">Save your recovery codes</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">They get you back in if you ever forget your password.</p>
            </div>
          </div>

          <div className="mt-5">
            <RecoveryCodesList codes={codes} email={email} />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Each code works once. Put them in your password manager or notes app. There is no email reset, so these codes are your way back in. You can make a new set any time from Settings.
          </p>

          <Button className="mt-5 w-full" onClick={onDone}>
            <ShieldCheck className="size-4" /> I've saved them
          </Button>
        </div>
      </Reveal>
    </div>
  )
}
