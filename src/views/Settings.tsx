import { Database, Download, Lock } from 'lucide-react'
import { db } from '../lib/db'

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

export function Settings() {
  return (
    <div className="content-grid">
      <section className="surface col-6">
        <div className="panel-header">
          <div>
            <span className="section-label">Privacy</span>
            <h3>Local-first</h3>
          </div>
          <Lock size={18} style={{ color: 'var(--ink-mute)' }} />
        </div>
        <div className="stack">
          <div className="row">
            <Database size={14} />
            <div>
              <strong>No account</strong>
              <span className="sub">No sign-up, no identity.</span>
            </div>
            <span /><span />
          </div>
          <div className="row">
            <Database size={14} />
            <div>
              <strong>IndexedDB only</strong>
              <span className="sub">Data lives in this browser, on this device.</span>
            </div>
            <span /><span />
          </div>
          <div className="row">
            <Database size={14} />
            <div>
              <strong>No analytics</strong>
              <span className="sub">No tracking scripts shipped with this build.</span>
            </div>
            <span /><span />
          </div>
        </div>
      </section>

      <section className="surface col-6">
        <div className="panel-header">
          <div>
            <span className="section-label">Backup</span>
            <h3>Export</h3>
          </div>
        </div>
        <p className="muted-copy">
          Plain JSON dump of every table. Useful before clearing site data, switching browsers, or handing data to a doctor.
          Encrypted export is planned.
        </p>
        <button type="button" className="primary-button" onClick={exportJson}>
          <Download size={15} /> Download JSON
        </button>
      </section>
    </div>
  )
}
