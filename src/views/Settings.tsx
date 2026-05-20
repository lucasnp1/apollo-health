import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Database, Download, LogOut, Mail, Plus, RefreshCw, Trash2, UserCircle } from 'lucide-react'
import { db, importBundledSeed, recordCounts, type SeedImportResult } from '../lib/db'
import { wipeLocalDatabase } from '../lib/lock'
import { api } from '../lib/api'
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
  const user = auth.state.status === 'authed' ? auth.state.user : null
  const isAdmin = user?.is_admin === 1

  return (
    <div className="content-grid">
      <section className="surface col-6">
        <AccountSettings auth={auth} />
      </section>

      {isAdmin && (
        <section className="surface col-12">
          <InviteSettings />
        </section>
      )}

      <section className="surface col-6">
        <BundledSeedSettings />
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
            {user.is_admin === 1 ? ' Admin — you can issue invite codes below.' : ''}
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

function InviteSettings() {
  const [invites, setInvites] = useState<Array<{ code: string; used_by: string | null; used_at: number | null; expires_at: number | null; note: string | null; created_at: number }>>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('30')
  const [generated, setGenerated] = useState<string[]>([])

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ invites: typeof invites }>('/api/invites')
      setInvites(res.invites)
    } catch {
      /* admin-only */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await api.get<{ invites: typeof invites }>('/api/invites')
        if (!cancelled) setInvites(res.invites)
      } catch {
        /* admin-only */
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function create() {
    setBusy(true)
    try {
      const res = await api.post<{ codes: string[] }>('/api/invites', {
        note: note || undefined,
        expiresInDays: Number(expiresInDays) || 0,
        count: 1,
      })
      setGenerated((prev) => [...res.codes, ...prev])
      setNote('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function revoke(code: string) {
    await api.delete(`/api/invites?code=${encodeURIComponent(code)}`)
    await refresh()
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Admin</span>
          <h3>Invite codes</h3>
        </div>
        <Mail size={18} style={{ color: 'var(--ink-mute)' }} />
      </div>
      <p className="muted-copy">Share an invite code with a friend so they can create an account.</p>

      <div className="form-grid">
        <label className="wide-field">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who is this for?" />
        </label>
        <label>
          Expires in (days, 0 = never)
          <input inputMode="numeric" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
        </label>
        <button type="button" className="primary-button" onClick={create} disabled={busy}>
          <Plus size={14} /> Generate code
        </button>
      </div>

      {generated.length > 0 && (
        <p className="panel-note" style={{ color: 'var(--good)' }}>
          New: <strong>{generated.join(', ')}</strong> — copy now, won't be highlighted again.
        </p>
      )}

      <div className="stack">
        {invites.length === 0 && <div className="empty" style={{ padding: 18 }}><strong>No codes yet</strong></div>}
        {invites.map((row) => (
          <div className="row" key={row.code}>
            <Mail size={14} />
            <div>
              <strong style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{row.code}</strong>
              <span className="sub">
                {row.used_by ? `Used` : 'Unused'}
                {row.expires_at ? ` · expires ${new Date(row.expires_at).toLocaleDateString()}` : ''}
                {row.note ? ` · ${row.note}` : ''}
              </span>
            </div>
            <span />
            {!row.used_by && (
              <button type="button" className="icon-button danger" aria-label="Revoke invite" onClick={() => revoke(row.code)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}


function BundledSeedSettings() {
  const [status, setStatus] = useState<SeedImportResult | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void recordCounts().then((counts) => setStatus({ status: 'skipped', counts }))
  }, [])

  async function refresh(force = false) {
    setBusy(true)
    try {
      const result = await importBundledSeed(force)
      setStatus(result)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Bundled data</span>
          <h3>Local seed import</h3>
        </div>
      </div>
      <p className="muted-copy">
        If a seed file ships with this build, this re-runs the bundled import. Useful to refresh sample data on a
        new device. Re-importing replaces existing seeded records.
      </p>
      {status && (
        <div className="stack">
          <div className="row">
            <Database size={14} />
            <div>
              <strong>Current totals</strong>
              <span className="sub">
                {status.counts.compounds} compounds · {status.counts.injections} injections · {status.counts.vitals} vitals · {status.counts.exams} exams · {status.counts.results} results · {status.counts.files} files
              </span>
            </div>
            <span /><span />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="primary-button" disabled={busy} onClick={() => refresh(false)}>
          <RefreshCw size={13} /> Apply if newer
        </button>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => refresh(true)}>
          Force re-import
        </button>
      </div>
      {status?.status === 'missing' && <p className="panel-note">No seed file is bundled with this build.</p>}
      {status?.status === 'skipped' && status.seedVersion && (
        <p className="panel-note">Already on seed version <code>{status.seedVersion}</code>.</p>
      )}
      {status?.status === 'imported' && (
        <p className="panel-note" style={{ color: 'var(--good)' }}>Imported seed {status.seedVersion}.</p>
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
        to a doctor. Encrypted export is planned.
      </p>
      <button type="button" className="primary-button" onClick={exportJson}>
        <Download size={14} /> Download JSON
      </button>
    </>
  )
}

function DangerSettings() {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function wipe() {
    setBusy(true)
    try {
      await wipeLocalDatabase()
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

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
        Wipes every local table — compounds, injections, vitals, labs, files, protocols, vials, symptoms, targets,
        body metrics, and your passphrase. Cannot be undone. The seed will be re-applied on next load if one is
        bundled.
      </p>
      {confirming ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="primary-button" style={{ background: 'var(--bad)', color: '#fff' }} disabled={busy} onClick={wipe}>
            <Trash2 size={14} /> Yes, wipe everything
          </button>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="ghost-button" onClick={() => setConfirming(true)}>
          <Trash2 size={14} /> Wipe local data
        </button>
      )}
    </>
  )
}
