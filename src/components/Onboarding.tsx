import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, MoreVertical, Share, ShieldCheck, Syringe } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { Button } from '@/components/ui/button'
import { spring } from './motion'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { api } from '../lib/api'

export const ONBOARDED_KEY = 'apollo.onboarded'

// Shown once, right after the first sign-up. Keeps it to three light steps and
// puts the weight on "add to home screen" — the thing new users most need to do
// (it makes the PWA app-like, offline, and its storage far more durable).
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const { platform, standalone, canInstall, promptInstall } = useInstallPrompt()

  // Mark onboarding done the moment it appears — on the account (so it never
  // shows again on any device) and locally (offline fallback). This way closing
  // it without finishing still counts as "seen once".
  useEffect(() => {
    try { localStorage.setItem(ONBOARDED_KEY, '1') } catch { /* ignore */ }
    void api.post('/api/auth/onboarded').catch(() => {})
  }, [])

  function finish() {
    try { localStorage.setItem(ONBOARDED_KEY, '1') } catch { /* ignore */ }
    void navigator.storage?.persist?.()
    onDone()
  }

  const steps = [
    // 1 — welcome
    <div key="welcome" className="flex flex-col items-center text-center">
      <BrandMark size={56} />
      <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">Welcome to Apollo</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Your private tracker for injections, bloods, weight and blood pressure. Everything you log is backed up to your account.
      </p>
    </div>,

    // 2 — add to home screen (the important one)
    <div key="install" className="flex flex-col items-center text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
        <ShieldCheck className="size-7" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">Add it to your home screen</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        It opens like a real app, works offline, and keeps your data safe on your phone.
      </p>
      <div className="mt-5 w-full">
        {standalone ? (
          <p className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" /> You've already installed Apollo. Nice.
          </p>
        ) : platform === 'ios' ? (
          <ol className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/40 p-4 text-left text-sm">
            <li className="flex items-center gap-3">
              <StepDot n={1} />
              <span>Tap the <Share className="inline size-4 align-[-3px] text-primary" /> <strong>Share</strong> button in the toolbar.</span>
            </li>
            <li className="flex items-center gap-3">
              <StepDot n={2} />
              <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
            </li>
            <li className="flex items-center gap-3">
              <StepDot n={3} />
              <span>Tap <strong>Add</strong> in the top corner.</span>
            </li>
          </ol>
        ) : canInstall ? (
          <div className="flex flex-col gap-2.5">
            <Button size="lg" className="w-full" onClick={() => void promptInstall()}>
              Add to home screen
            </Button>
            <p className="text-xs text-muted-foreground">Or use the <MoreVertical className="inline size-3.5 align-[-2px]" /> menu, then <strong>Install app</strong>.</p>
          </div>
        ) : platform === 'android' ? (
          <ol className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/40 p-4 text-left text-sm">
            <li className="flex items-center gap-3">
              <StepDot n={1} />
              <span>Open the <MoreVertical className="inline size-4 align-[-3px] text-primary" /> menu (top right).</span>
            </li>
            <li className="flex items-center gap-3">
              <StepDot n={2} />
              <span>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</span>
            </li>
          </ol>
        ) : (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Install Apollo from the install icon in your browser's address bar.
          </p>
        )}
      </div>
    </div>,

    // 3 — ready
    <div key="ready" className="flex flex-col items-center text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--glow-accent)]">
        <Syringe className="size-7" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">You're all set</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Tap the amber <strong>Injection</strong> card on the home screen to log your first shot.
      </p>
    </div>,
  ]

  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 py-4" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-primary' : 'w-1.5 bg-border'}`} />
          ))}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="w-full">
            {steps[step]}
          </motion.div>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <Button size="lg" className="w-full" onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
            {isLast ? 'Start logging' : 'Next'}
          </Button>
          {!isLast && (
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={finish}>
              Skip
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDot({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 font-mono text-xs font-semibold text-primary">
      {n}
    </span>
  )
}
