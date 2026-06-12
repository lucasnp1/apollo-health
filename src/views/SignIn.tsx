import { useState } from 'react'
import { KeyRound, LogIn, UserPlus } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { useAuth } from '../lib/useAuth'

type AuthBundle = ReturnType<typeof useAuth>

export function SignIn({ auth }: { auth: AuthBundle }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (mode === 'signup' && password !== confirm) {
      alert('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        await auth.login({ email, password })
      } else {
        await auth.signup({ email, password, displayName: displayName || undefined })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BrandMark size={44} />
          <div>
            <h1 className="font-display text-2xl font-semibold leading-none">Apollo Health</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === 'login' ? 'Sign in to sync across devices.' : 'Create a free account.'}
            </p>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'login' | 'signup')} className="mt-5">
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">Sign in</TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">Sign up</TabsTrigger>
          </TabsList>
        </Tabs>

        <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="sr-only">Email</Label>
            <Input id="email" type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="sr-only">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder={mode === 'login' ? 'Password' : 'Password (10+ chars, mixed case, a number)'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 10 : 8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === 'signup' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm" className="sr-only">Confirm password</Label>
                <Input id="confirm" type="password" placeholder="Confirm password" autoComplete="new-password" minLength={10} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="display" className="sr-only">Display name</Label>
                <Input id="display" type="text" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
            </>
          )}

          {auth.error && <p className="text-sm text-destructive">{auth.error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {mode === 'login' ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 w-full text-muted-foreground"
          onClick={() => auth.continueAsGuest()}
        >
          <KeyRound className="size-3.5" />
          Continue without an account (local-only)
        </Button>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Data syncs to your account on Cloudflare over HTTPS. No third-party trackers or analytics.
        </p>
      </div>
    </div>
  )
}
