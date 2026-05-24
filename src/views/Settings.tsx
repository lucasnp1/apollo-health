import { useEffect, useState } from 'react'
import { AlertTriangle, Database, Download, LogOut, RefreshCw, Trash2, UserCircle } from 'lucide-react'
import { db, importBundledSeed, recordCounts, type SeedImportResult } from '../lib/db'
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
        <BundledSeedSettings />
      </section>

      <section className="surface col-6">
        <BackupSettings />
      </section>

      <section className="surface col-6">
        <DeduplicateSettings />
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

function DeduplicateSettings() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ removed: number } | null>(null)

  async function deduplicate() {
    setBusy(true)
    setResult(null)
    try {
      const all = await db.injections.toArray()
      const seen = new Map<string, number>() // key → lowest id to keep
      const toDelete: number[] = []

      for (const inj of all.filter((i) => !i.deletedAtSync)) {
        const minuteBucket = Math.floor(Date.parse(inj.takenAt) / 60_000)
        const key = `${inj.compoundId}|${inj.dose ?? ''}|${minuteBucket}`
        const existing = seen.get(key)
        if (existing === undefined) {
          seen.set(key, inj.id!)
        } else {
          // Keep the lower id (older write), mark the other for deletion
          if (inj.id! < existing) {
            toDelete.push(existing)
            seen.set(key, inj.id!)
          } else {
            toDelete.push(inj.id!)
          }
        }
      }

      // Soft-delete duplicates (tombstone so they sync-delete from server too)
      for (const id of toDelete) {
        await db.injections.update(id, {
          deletedAtSync: Date.now(),
          dirty: 1,
          updatedAt: Date.now(),
        })
      }

      setResult({ removed: toDelete.length })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Data quality</span>
          <h3>Remove duplicate logs</h3>
        </div>
        <Database size={18} style={{ color: 'var(--ink-mute)' }} />
      </div>
      <p className="muted-copy">
        The sync engine can create phantom duplicate injection records when the same entry
        is downloaded multiple times. This permanently removes duplicates (same compound,
        same dose, within the same minute) keeping the oldest record.
      </p>
      <button type="button" className="ghost-button" disabled={busy} onClick={deduplicate}>
        <RefreshCw size={14} /> {busy ? 'Scanning…' : 'Find & remove duplicates'}
      </button>
      {result && (
        <p className="panel-note" style={{ color: result.removed > 0 ? 'var(--good)' : undefined }}>
          {result.removed > 0
            ? `Removed ${result.removed} duplicate record${result.removed > 1 ? 's' : ''}. Data will sync-clean on next push.`
            : 'No duplicates found — data looks clean.'}
        </p>
      )}
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
