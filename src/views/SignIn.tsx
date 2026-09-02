import { useState } from 'react'
import { KeyRound, LogIn, Mail, UserPlus } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { PasswordRules } from '../components/PasswordRules'
import { passwordOk } from '../lib/password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Reveal } from '../components/motion'
import { LegalLink, SUPPORT_EMAIL } from '../components/LegalLink'
import type { useAuth } from '../lib/useAuth'

type AuthBundle = ReturnType<typeof useAuth>
type Mode = 'login' | 'signup' | 'forgot'

// Prefilled "I'm locked out" email for people who lost their recovery codes.
function lockedOutMailto(email: string): string {
  const subject = 'Apollo Health: locked out of my account'
  const body = [
    'Hi,',
    '',
    "I can't sign in to Apollo Health and I don't have my recovery codes.",
    '',
    `Account email: ${email || '(type it here)'}`,
    `Device: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
    `Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    'Please send me a link to set a new password.',
  ].join('\n')
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// The landing page's email forms land here as /app/?signup=1&email=...
function landingIntent(): { mode: Mode; email: string } {
  try {
    const p = new URLSearchParams(window.location.search)
    const email = p.get('email') ?? ''
    const mode: Mode = p.get('signup') === '1' ? 'signup' : 'login'
    if (p.has('signup') || p.has('email')) window.history.replaceState({}, '', window.location.pathname)
    return { mode, email }
  } catch {
    return { mode: 'login', email: '' }
  }
}

export function SignIn({ auth }: { auth: AuthBundle }) {
  const [intent] = useState(landingIntent)
  const [mode, setMode] = useState<Mode>(intent.mode)
  const [email, setEmail] = useState(intent.email)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm
  const signupReady = passwordOk(password) && password === confirm && email.includes('@')
  const forgotReady = email.includes('@') && code.replace(/[^A-Za-z0-9]/g, '').length >= 8 && passwordOk(password) && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (mode === 'signup' && !signupReady) return
    if (mode === 'forgot' && !forgotReady) return
    setBusy(true)
    try {
      if (mode === 'login') {
        await auth.login({ email, password })
      } else if (mode === 'signup') {
        await auth.signup({ email, password, displayName: displayName || undefined })
      } else {
        await auth.recoverWithCode(email, code, password)
      }
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setPassword('')
    setConfirm('')
    setCode('')
  }

  const subtitle =
    mode === 'login' ? 'Sign in to sync across devices.'
    : mode === 'signup' ? 'Create a free account to back up your data.'
    : 'Enter one of your recovery codes and choose a new password.'

  return (
    <div className="min-h-dvh grid place-items-center bg-background px-4">
      <Reveal className="w-full max-w-sm">
      <div className="w-full rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-lift)]">
        <p className="eyebrow mb-4">Local-first · private sync</p>
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

        <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="sr-only">Email</Label>
            <Input id="email" type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {mode === 'forgot' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code" className="sr-only">Recovery code</Label>
              <Input
                id="code"
                type="text"
                placeholder="Recovery code (XXXX-XXXX-XXXX)"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono tracking-wide"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="sr-only">{mode === 'login' ? 'Password' : 'New password'}</Label>
            <Input
              id="password"
              type="password"
              placeholder={mode === 'login' ? 'Password' : mode === 'signup' ? 'Password' : 'New password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'login' ? 8 : 10}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode !== 'login' && (
            <>
              <PasswordRules password={password} className="-mt-0.5" />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm" className="sr-only">Confirm password</Label>
                <Input id="confirm" type="password" placeholder={mode === 'signup' ? 'Confirm password' : 'Confirm new password'} autoComplete="new-password" aria-invalid={mismatch} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {mismatch && <p className="px-0.5 text-[11px] text-destructive">Passwords don't match.</p>}
              </div>
            </>
          )}

          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="display" className="sr-only">Display name</Label>
              <Input id="display" type="text" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          )}

          {auth.error && <p className="text-sm text-destructive">{auth.error}</p>}

          <Button type="submit" disabled={busy || (mode === 'signup' && !signupReady) || (mode === 'forgot' && !forgotReady)} className="w-full">
            {mode === 'login' ? <LogIn className="size-4" /> : mode === 'signup' ? <UserPlus className="size-4" /> : <KeyRound className="size-4" />}
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Set new password'}
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

        {mode === 'forgot' && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Lost your recovery codes? Email us from the address you signed up with and we'll send you a link to set a new password.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <a href={lockedOutMailto(email)}><Mail className="size-3.5" /> Email us</a>
            </Button>
          </div>
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
            <>Each recovery code works once. Setting a new password signs out every other device.</>
          )}
        </p>
      </div>
      </Reveal>
    </div>
  )
}
