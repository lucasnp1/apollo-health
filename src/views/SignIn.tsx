import { useState } from 'react'
import { Activity, KeyRound, LogIn, UserPlus } from 'lucide-react'
import type { useAuth } from '../lib/useAuth'

type AuthBundle = ReturnType<typeof useAuth>

export function SignIn({ auth }: { auth: AuthBundle }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [invite, setInvite] = useState('')
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
        await auth.signup({ email, password, invite: invite.toUpperCase(), displayName: displayName || undefined })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lock-shell">
      <div className="lock-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-mark" style={{ background: 'var(--accent)' }}><Activity size={16} /></div>
          <div>
            <h1 style={{ margin: 0 }}>Apollo Health</h1>
            <p className="lock-copy" style={{ margin: '2px 0 0' }}>
              {mode === 'login' ? 'Sign in to sync across devices.' : 'Create an account with your invite code.'}
            </p>
          </div>
        </div>

        <div className="pill-tabs" role="tablist" style={{ alignSelf: 'flex-start' }}>
          <button type="button" role="tab" className={mode === 'login' ? 'active' : undefined} onClick={() => setMode('login')}>Sign in</button>
          <button type="button" role="tab" className={mode === 'signup' ? 'active' : undefined} onClick={() => setMode('signup')}>Sign up</button>
        </div>

        <form className="lock-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="email">Email</label>
          <input id="email" type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

          <label className="visually-hidden" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder={mode === 'login' ? 'Password' : 'Password (≥ 8 characters)'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === 'signup' && (
            <>
              <label className="visually-hidden" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <label className="visually-hidden" htmlFor="invite">Invite code</label>
              <input id="invite" type="text" placeholder="Invite code" autoCapitalize="characters" required value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} />
              <label className="visually-hidden" htmlFor="display">Display name</label>
              <input id="display" type="text" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </>
          )}

          {auth.error && <p className="form-error">{auth.error}</p>}

          <button type="submit" className="primary-button" disabled={busy}>
            {mode === 'login' ? <LogIn size={14} /> : <UserPlus size={14} />}
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button type="button" className="link-button" onClick={() => auth.continueAsGuest()}>
          <KeyRound size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          Continue without an account (local-only)
        </button>

        <p className="lock-copy">
          {mode === 'signup'
            ? 'Need an invite? Ask a friend who already has access. Codes are issued by the account admin.'
            : 'Data syncs to your account on Cloudflare. Encrypted in transit; encrypted at rest. No third parties.'}
        </p>
      </div>
    </div>
  )
}
