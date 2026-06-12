import { useState } from 'react'
import { Lock } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type LockStateLike = {
  mode: 'loading' | 'setup' | 'locked' | 'unlocked'
  error: string
  idleMinutes: number
  setup: (passphrase: string) => Promise<boolean>
  unlock: (passphrase: string) => Promise<boolean>
}

export function LockScreen({ lockState }: { lockState: LockStateLike }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const isSetup = lockState.mode === 'setup'
  const isLoading = lockState.mode === 'loading'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (isSetup) {
        if (pass !== confirm) {
          // mirror lock state error surface — just bail out, the form will keep its own copy
          alert('Passphrases do not match.')
          return
        }
        await lockState.setup(pass)
      } else {
        await lockState.unlock(pass)
      }
      setPass('')
      setConfirm('')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Loading local database…</p>
      </div>
    )
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <div>
            <h1 className="font-display text-2xl font-semibold leading-none">Apollo Health</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSetup ? 'Set a passphrase to protect your data.' : 'Locked. Enter your passphrase to continue.'}
            </p>
          </div>
        </div>

        <form className="mt-5 flex flex-col gap-3" onSubmit={onSubmit}>
          <Label htmlFor="pass" className="sr-only">Passphrase</Label>
          <Input
            id="pass"
            type="password"
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            placeholder={isSetup ? 'New passphrase (≥ 8 chars)' : 'Passphrase'}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoFocus
          />
          {isSetup && (
            <>
              <Label htmlFor="confirm" className="sr-only">Confirm passphrase</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm passphrase"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </>
          )}
          {lockState.error && <p className="text-sm text-destructive">{lockState.error}</p>}
          <Button type="submit" disabled={busy || pass.length === 0}>
            <Lock className="size-4" />
            {isSetup ? 'Set passphrase' : 'Unlock'}
          </Button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {isSetup
            ? 'This is a convenience lock — it keeps someone glancing at your phone from opening the app. It does not encrypt your data, which still lives in this browser. Lose the passphrase and you must clear local data to start over. There is no recovery.'
            : `Auto-locks after ${lockState.idleMinutes} minute${lockState.idleMinutes === 1 ? '' : 's'} of inactivity. After 5 wrong tries, attempts pause for 30 seconds.`}
        </p>
      </div>
    </div>
  )
}
