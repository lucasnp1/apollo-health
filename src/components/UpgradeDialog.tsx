import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { PRO_FEATURES, PRO_PLANS, type PlanKind } from '../lib/plans'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// The upgrade paywall. Lists what Pro unlocks, then the three plans; picking one
// starts a Stripe Checkout session and hands off to Stripe's hosted page.
export function UpgradeDialog({ open, onClose, feature }: { open: boolean; onClose: () => void; feature?: string }) {
  const [busy, setBusy] = useState<PlanKind | null>(null)
  const [error, setError] = useState('')

  async function upgrade(kind: PlanKind) {
    setBusy(kind)
    setError('')
    try {
      const { url } = await api.post<{ url: string }>('/api/billing/checkout', { plan: kind })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout. Please try again.')
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Apollo Pro
          </DialogTitle>
        </DialogHeader>

        {feature && <p className="-mt-1 text-sm text-muted-foreground">{feature} is part of Apollo Pro.</p>}

        <ul className="flex flex-col gap-2 py-1">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2.5">
          {PRO_PLANS.map((p) => (
            <button
              key={p.kind}
              type="button"
              disabled={busy !== null}
              onClick={() => upgrade(p.kind)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors disabled:opacity-60',
                p.highlight ? 'border-primary/50 bg-primary/[0.06]' : 'border-border hover:bg-muted/50',
              )}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {p.label}
                  {p.note && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">{p.note}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{p.cadence}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-mono text-lg font-semibold tabular-nums">{p.price}</span>
                {busy === p.kind && <span className="block text-[11px] text-muted-foreground">Starting…</span>}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Secure checkout by Stripe. Your logging, timeline, and cloud backup stay free forever.
        </p>
      </DialogContent>
    </Dialog>
  )
}
