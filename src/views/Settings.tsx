import { useEffect, useState } from 'react'
import { AlertTriangle, Database, Download, Lock as LockIcon, RefreshCw, Trash2 } from 'lucide-react'
import { db, importBundledSeed, recordCounts, type SeedImportResult } from '../lib/db'
import { wipeLocalDatabase } from '../lib/lock'
import type { useLockState } from '../lib/useLockState'

type LockStateBundle = ReturnType<typeof useLockState>

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

export function Settings({ lockState }: { lockState: LockStateBundle }) {
  return (
    <div className="content-grid">
      <section className="surface col-6">
        <LockSettings lockState={lockState} />
      </section>

      <section className="surface col-6">
        <BundledSeedSettings />
      </section>

      <section className="surface col-6">
        <BackupSettings />
      </section>

      <section className="surface col-6">
        <DangerSettings />
      </section>
    </div>
  )
}

function LockSettings({ lockState }: { lockState: LockStateBundle }) {
  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Security</span>
          <h3>Passphrase lock</h3>
        </div>
        <LockIcon size={18} style={{ color: 'var(--ink-mute)' }} />
      </div>
      <p className="muted-copy">
        Stored as a salted PBKDF2 hash in this browser. There is no recovery if you forget it — losing the passphrase
        means wiping your local data and starting over.
      </p>

      <div className="form-grid">
        <label>
          Auto-lock after
          <select
            value={String(lockState.idleMinutes)}
            onChange={(e) => { void lockState.setIdleMinutes(Number(e.target.value)) }}
          >
            {[1, 2, 5, 10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>{n} minute{n === 1 ? '' : 's'}</option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost-button" onClick={() => lockState.lock()} style={{ alignSelf: 'flex-end' }}>
          <LockIcon size={13} /> Lock now
        </button>
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
