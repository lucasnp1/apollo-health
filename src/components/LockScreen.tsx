import { useState } from 'react'
import { Activity, Lock } from 'lucide-react'

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
      <div className="lock-shell">
        <div className="lock-panel">
          <p className="lock-copy">Loading local database…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lock-shell">
      <div className="lock-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-mark" style={{ background: '#0f766e' }}><Activity size={16} /></div>
          <div>
            <h1 style={{ margin: 0 }}>Apollo Health</h1>
            <p className="lock-copy" style={{ margin: '2px 0 0' }}>
              {isSetup ? 'Set a passphrase to protect your data.' : 'Locked. Enter your passphrase to continue.'}
            </p>
          </div>
        </div>

        <form className="lock-form" onSubmit={onSubmit}>
          <label className="visually-hidden" htmlFor="pass">Passphrase</label>
          <input
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
              <label className="visually-hidden" htmlFor="confirm">Confirm passphrase</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm passphrase"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </>
          )}
          {lockState.error && <p className="form-error">{lockState.error}</p>}
          <button type="submit" className="primary-button" disabled={busy || pass.length === 0}>
            <Lock size={14} />
            {isSetup ? 'Set passphrase' : 'Unlock'}
          </button>
        </form>

        <p className="lock-copy">
          {isSetup
            ? 'This is a convenience lock — it keeps someone glancing at your phone from opening the app. It does not encrypt your data, which still lives in this browser. Lose the passphrase and you must clear local data to start over. There is no recovery.'
            : `Auto-locks after ${lockState.idleMinutes} minute${lockState.idleMinutes === 1 ? '' : 's'} of inactivity. After 5 wrong tries, attempts pause for 30 seconds.`}
        </p>
      </div>
    </div>
  )
}
