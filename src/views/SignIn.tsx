import { useState } from 'react'
import { LogIn, Mail, UserPlus } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { PasswordRules, passwordOk } from '../components/PasswordRules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Reveal } from '../components/motion'
import { LegalLink, SUPPORT_EMAIL } from '../components/LegalLink'
import type { useAuth } from '../lib/useAuth'

type AuthBundle = ReturnType<typeof useAuth>
type Mode = 'login' | 'signup' | 'forgot'

export function SignIn({ auth }: { auth: AuthBundle }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  // Result of a reset request: which delivery path the server used.
  const [forgotSent, setForgotSent] = useState<'email' | 'unavailable' | null>(null)

  const mismatch = confirm.length > 0 && password !== confirm
  const signupReady = passwordOk(password) && password === confirm && email.includes('@')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (mode === 'signup' && !signupReady) return
    setBusy(true)
    try {
      if (mode === 'login') {
        await auth.login({ email, password })
      } else if (mode === 'signup') {
        await auth.signup({ email, password, displayName: displayName || undefined })
      } else {
        const res = await auth.forgot(email)
        if (res) setForgotSent(res.delivery)
      }
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setForgotSent(null)
  }

  const subtitle =
    mode === 'login' ? 'Sign in to sync across devices.'
    : mode === 'signup' ? 'Create a free account to back up your data.'
    : "Enter your email and we'll send you a link to choose a new password."

  return (
    <div className="min-h-dvh grid place-items-center bg-background px-4">
      <Reveal className="w-full max-w-sm">
      <div className="w-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-lift)]">
        <p className="eyebrow mb-4">Local-first · encrypted sync</p>
        <div className="flex items-center gap-3">
          <BrandMark size={44} />
          <div>
            <h1 className="font-display text-2xl font-semibold leading-none">{mode === 'forgot' ? 'Reset password' : 'Apollo Health'}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {mode !== 'forgot' && (
          <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)} className="mt-5">
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Sign up</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {mode === 'forgot' && forgotSent ? (
          <div className="mt-5 flex flex-col gap-3">
            {forgotSent === 'email' ? (
              <p className="text-sm text-muted-foreground">
                If there's an account for <span className="text-foreground">{email}</span>, a reset link is on its way. Check your inbox and spam folder. The link works for 60 minutes.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Reset by email isn't ready yet. Write to <a className="text-foreground underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the email you signed up with and we'll sort it out.
              </p>
            )}
            <Button variant="outline" className="w-full" onClick={() => switchMode('login')}>Back to sign in</Button>
          </div>
        ) : (
        <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="sr-only">Email</Label>
            <Input id="email" type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {mode !== 'forgot' && (
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
          )}

          {mode === 'signup' && (
            <>
              <PasswordRules password={password} className="-mt-0.5" />
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
            {mode === 'login' ? <LogIn className="size-4" /> : mode === 'signup' ? <UserPlus className="size-4" /> : <Mail className="size-4" />}
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </Button>

          {mode === 'login' && (
            <button type="button" onClick={() => switchMode('forgot')} className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline">
              Forgot your password?
            </button>
          )}
          {mode === 'forgot' && (
            <button type="button" onClick={() => switchMode('login')} className="self-center text-xs text-muted-foreground underline-offset-2 hover:underline">
              Back to sign in
            </button>
          )}
        </form>
        )}

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {mode === 'signup' ? (
            <>
              Your data is backed up to your private account. Anything already saved on this device is kept and backed up too. No third-party trackers or analytics.
              {' '}By creating an account you agree to the <LegalLink href="/terms">Terms</LegalLink> and <LegalLink href="/privacy">Privacy Policy</LegalLink>.
            </>
          ) : mode === 'login' ? (
            <>Data syncs to your account on Cloudflare over HTTPS. No third-party trackers or analytics. <LegalLink href="/privacy">Privacy</LegalLink> · <LegalLink href="/terms">Terms</LegalLink></>
          ) : (
            <>For your safety, the link signs out every other device once you set a new password.</>
          )}
        </p>
      </div>
      </Reveal>
    </div>
  )
}
