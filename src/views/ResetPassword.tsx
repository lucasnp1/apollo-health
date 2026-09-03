import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { PasswordRules } from '../components/PasswordRules'
import { passwordOk } from '../lib/password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Reveal } from '../components/motion'
import type { useAuth } from '../lib/useAuth'

type AuthBundle = ReturnType<typeof useAuth>

// Landing screen for the emailed reset link: /reset?token=...
// On success the server has already signed this device in; onDone returns
// to the app root.
export function ResetPassword({ auth, token, onDone }: { auth: AuthBundle; token: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm
  const ready = passwordOk(password) && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    try {
      const ok = await auth.resetPassword(token, password)
      if (ok) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-background px-4">
      <Reveal className="w-full max-w-sm">
        <div className="w-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-lift)]">
          <p className="eyebrow mb-4">Account recovery</p>
          <div className="flex items-center gap-3">
            <BrandMark size={44} />
            <div>
              <h1 className="font-display text-2xl font-semibold leading-none">Choose a new password</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">You'll be signed in right after, and signed out everywhere else.</p>
            </div>
          </div>

          <form className="mt-5 flex flex-col gap-3" onSubmit={submit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password" className="sr-only">New password</Label>
              <Input id="new-password" type="password" placeholder="New password" autoComplete="new-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <PasswordRules password={password} className="-mt-0.5" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password" className="sr-only">Confirm new password</Label>
              <Input id="confirm-password" type="password" placeholder="Confirm new password" autoComplete="new-password" aria-invalid={mismatch} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {mismatch && <p className="px-0.5 text-xs text-destructive">Passwords don't match.</p>}
            </div>

            {auth.error && <p className="text-sm text-destructive">{auth.error}</p>}

            <Button type="submit" disabled={busy || !ready} className="w-full">
              <KeyRound className="size-4" /> {busy ? 'Saving…' : 'Save new password'}
            </Button>
          </form>

          <button type="button" onClick={onDone} className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:underline">
            Back to sign in
          </button>
        </div>
      </Reveal>
    </div>
  )
}
