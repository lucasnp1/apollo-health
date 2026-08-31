import { useState } from 'react'
import { Check, LogIn, UserPlus } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Reveal } from '../components/motion'
import { cn } from '@/lib/utils'
import type { useAuth } from '../lib/useAuth'

type AuthBundle = ReturnType<typeof useAuth>

// Live password requirement (mirrors the server rule in functions/api/auth/signup.ts)
function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-1.5 transition-colors', ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
      <Check className={cn('size-3 shrink-0', ok ? 'opacity-100' : 'opacity-30')} />
      {children}
    </li>
  )
}

export function SignIn({ auth }: { auth: AuthBundle }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  const lenOk = password.length >= 10
  const caseOk = /[a-z]/.test(password) && /[A-Z]/.test(password)
  const numOk = /\d/.test(password)
  const mismatch = confirm.length > 0 && password !== confirm
  const signupReady = lenOk && caseOk && numOk && password === confirm && email.includes('@')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (mode === 'signup' && !signupReady) return
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
      <Reveal className="w-full max-w-sm">
      <div className="w-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-lift)]">
        <p className="eyebrow mb-4">Local-first · encrypted sync</p>
        <div className="flex items-center gap-3">
          <BrandMark size={44} />
          <div>
            <h1 className="font-display text-2xl font-semibold leading-none">Apollo Health</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === 'login' ? 'Sign in to sync across devices.' : 'Create a free account to back up your data.'}
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
              placeholder="Password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 10 : 8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === 'signup' && (
            <>
              <ul className="-mt-0.5 flex flex-col gap-1 px-0.5 text-[11px]">
                <Req ok={lenOk}>At least 10 characters</Req>
                <Req ok={caseOk}>Upper and lowercase letters</Req>
                <Req ok={numOk}>A number</Req>
              </ul>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm" className="sr-only">Confirm password</Label>
                <Input id="confirm" type="password" placeholder="Confirm password" autoComplete="new-password" aria-invalid={mismatch} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {mismatch && <p className="px-0.5 text-[11px] text-destructive">Passwords don't match.</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="display" className="sr-only">Display name</Label>
                <Input id="display" type="text" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
            </>
          )}

          {auth.error && <p className="text-sm text-destructive">{auth.error}</p>}

          <Button type="submit" disabled={busy || (mode === 'signup' && !signupReady)} className="w-full">
            {mode === 'login' ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {mode === 'signup'
            ? 'Your data is backed up to your private account. Anything already saved on this device is kept and backed up too. No third-party trackers or analytics.'
            : 'Data syncs to your account on Cloudflare over HTTPS. No third-party trackers or analytics.'}
        </p>
      </div>
      </Reveal>
    </div>
  )
}
