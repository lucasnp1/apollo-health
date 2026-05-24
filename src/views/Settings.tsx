import { useEffect, useState } from 'react'
import { AlertTriangle, Download, LogOut, Trash2, UserCircle, X } from 'lucide-react'
import { db } from '../lib/db'
import { wipeLocalDatabase } from '../lib/lock'
import type { useAuth } from '../lib/useAuth'

type AuthBundle = ReturnType<typeof useAuth>

async function exportJson() {
  const dump = {
    exportedAt: new Date().toISOString(),
    compounds: await db.compounds.toArray(),
    injections: await db.injections.toArray(),
    vitals: await db.vitals.toArray(),
    exams: await db.exams.toArray(),
    results: await db.results.toArray(),
    files: (await db.files.toArray()).map((f) => ({ ...f, blob: undefined })),
    protocols: await db.protocols.toArray(),
    protocolDoses: await db.protocolDoses.toArray(),
    vials: await db.vials.toArray(),
    symptoms: await db.symptoms.toArray(),
    markerTargets: await db.markerTargets.toArray(),
    goals: await db.goals.toArray(),
    bodyMetrics: await db.bodyMetrics.toArray(),
  }
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `apollo-health-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function Settings({ auth }: { auth: AuthBundle }) {
  return (
    <div className="content-grid">
      <section className="surface col-6">
        <AccountSettings auth={auth} />
      </section>

      <section className="surface col-6">
        <BackupSettings />
      </section>

      <section className="surface col-12">
        <DangerSettings />
      </section>
    </div>
  )
}

function AccountSettings({ auth }: { auth: AuthBundle }) {
  const user = auth.state.status === 'authed' ? auth.state.user : null
  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Account</span>
          <h3>{user ? user.email : 'Guest mode'}</h3>
        </div>
        <UserCircle size={18} style={{ color: 'var(--ink-mute)' }} />
      </div>
      {user ? (
        <>
          <p className="muted-copy">
            Signed in as <strong>{user.display_name || user.email}</strong>.
          </p>
          <button type="button" className="ghost-button" onClick={() => auth.logout()} style={{ alignSelf: 'flex-start' }}>
            <LogOut size={14} /> Sign out
          </button>
        </>
      ) : (
        <p className="muted-copy">
          You are using local-only mode. Data lives in this browser. Sign in to sync across devices.
        </p>
      )}
    </>
  )
}

function BackupSettings() {
  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Backup</span>
          <h3>JSON export</h3>
        </div>
      </div>
      <p className="muted-copy">
        Plain JSON dump of every table. Useful before clearing site data, switching browsers, or handing data
        to a doctor.
      </p>
      <button type="button" className="primary-button" onClick={exportJson}>
        <Download size={14} /> Download JSON
      </button>
    </>
  )
}

function DangerSettings() {
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  const confirmed = confirmText.trim().toUpperCase() === 'RESET'

  async function wipe() {
    if (!confirmed) return
    setBusy(true)
    try {
      await wipeLocalDatabase()
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setConfirmText('')
  }

  // Close on Escape
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen])

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Danger zone</span>
          <h3>Reset device</h3>
        </div>
        <AlertTriangle size={18} style={{ color: 'var(--bad)' }} />
      </div>
      <p className="muted-copy">
        Wipes every local table — compounds, injections, vitals, labs, files, protocols, vials, symptoms,
        targets, body metrics, and your passphrase. <strong>Cannot be undone.</strong>
      </p>
      <button
        type="button"
        className="ghost-button"
        style={{ alignSelf: 'flex-start', color: 'var(--bad)', borderColor: 'var(--bad-soft)' }}
        onClick={() => setModalOpen(true)}
      >
        <Trash2 size={14} /> Wipe local data…
      </button>

      {/* Confirmation modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(10,10,10,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
          role="dialog"
          aria-modal
        >
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            width: '100%', maxWidth: 420,
            padding: 28,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={20} style={{ color: 'var(--bad)', flexShrink: 0 }} />
                <h3 style={{ margin: 0, fontSize: 16 }}>Wipe all local data?</h3>
              </div>
              <button type="button" className="icon-button" onClick={closeModal} aria-label="Cancel"><X size={14} /></button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: 0, lineHeight: 1.6 }}>
              This will permanently delete every injection, vital, lab result, protocol, compound, file, and
              symptom stored on this device. <strong style={{ color: 'var(--bad)' }}>There is no undo.</strong>
              {' '}If you are synced, your data remains on the server.
            </p>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Type <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4 }}>RESET</code> to confirm
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                autoFocus
                style={{ marginTop: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="ghost-button" onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                style={{
                  background: confirmed ? 'var(--bad)' : 'var(--line)',
                  color: confirmed ? '#fff' : 'var(--ink-mute)',
                  cursor: confirmed ? 'pointer' : 'not-allowed',
                }}
                onClick={wipe}
                disabled={!confirmed || busy}
              >
                <Trash2 size={14} /> {busy ? 'Wiping…' : 'Wipe everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
