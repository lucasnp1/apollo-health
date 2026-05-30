import { useEffect, useState } from 'react'
import { AlertTriangle, Bell, BellOff, Download, FlaskConical, LogOut, Moon, Printer, Sun, Trash2, Upload, UserCircle, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { wipeLocalDatabase } from '../lib/lock'
import { useTheme } from '../lib/useTheme'
import { describeCadence } from '../lib/schedule'
import type { useAuth } from '../lib/useAuth'
import type { Compound, InjectionLog, LabExam, Protocol, VitalLog } from '../lib/db'

type AuthBundle = ReturnType<typeof useAuth>

async function importJson(file: File) {
  const text = await file.text()
  const dump = JSON.parse(text)
  // Only import tables that exist in the dump — merge, don't wipe everything
  if (Array.isArray(dump.exams)         && dump.exams.length)         await db.exams.bulkPut(dump.exams)
  if (Array.isArray(dump.results)       && dump.results.length)       await db.results.bulkPut(dump.results)
  if (Array.isArray(dump.compounds)     && dump.compounds.length)     await db.compounds.bulkPut(dump.compounds)
  if (Array.isArray(dump.injections)    && dump.injections.length)    await db.injections.bulkPut(dump.injections)
  if (Array.isArray(dump.vitals)        && dump.vitals.length)        await db.vitals.bulkPut(dump.vitals)
  if (Array.isArray(dump.protocols)     && dump.protocols.length)     await db.protocols.bulkPut(dump.protocols)
  if (Array.isArray(dump.protocolDoses) && dump.protocolDoses.length) await db.protocolDoses.bulkPut(dump.protocolDoses)
  if (Array.isArray(dump.vials)         && dump.vials.length)         await db.vials.bulkPut(dump.vials)
  if (Array.isArray(dump.symptoms)      && dump.symptoms.length)      await db.symptoms.bulkPut(dump.symptoms)
  if (Array.isArray(dump.markerTargets) && dump.markerTargets.length) await db.markerTargets.bulkPut(dump.markerTargets)
  if (Array.isArray(dump.goals)         && dump.goals.length)         await db.goals.bulkPut(dump.goals)
  if (Array.isArray(dump.bodyMetrics)   && dump.bodyMetrics.length)   await db.bodyMetrics.bulkPut(dump.bodyMetrics)
}

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

export function Settings({
  auth,
  compounds,
  injections,
  vitals,
  exams,
  protocols,
}: {
  auth: AuthBundle
  compounds?: Compound[]
  injections?: InjectionLog[]
  vitals?: VitalLog[]
  exams?: LabExam[]
  protocols?: Protocol[]
}) {
  return (
    <div className="content-grid">
      <section className="surface col-6">
        <AccountSettings auth={auth} />
      </section>

      <section className="surface col-6">
        <AppearanceSettings />
      </section>

      <section className="surface col-6">
        <NotificationSettings />
      </section>

      <section className="surface col-6">
        <BackupSettings
          compounds={compounds}
          injections={injections}
          vitals={vitals}
          exams={exams}
          protocols={protocols}
        />
      </section>

      <section className="surface col-6">
        <LabDataSettings />
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

function AppearanceSettings() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <>
      <div className="panel-header">
        <div><span className="section-label">Display</span><h3>Appearance</h3></div>
        {isDark ? <Moon size={16} style={{ color: 'var(--accent-ink)' }} /> : <Sun size={16} style={{ color: 'var(--warn)' }} />}
      </div>
      <p className="muted-copy">Switch between light and dark theme. Your preference is saved locally.</p>
      <button
        type="button"
        className="ghost-button"
        style={{ alignSelf: 'flex-start' }}
        onClick={toggle}
      >
        {isDark ? <><Sun size={14} /> Switch to light mode</> : <><Moon size={14} /> Switch to dark mode</>}
      </button>
    </>
  )
}

function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [enabled, setEnabled] = useState(() => localStorage.getItem('apollo-notif') === '1')

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission)
  }, [])

  async function requestPermission() {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') {
      localStorage.setItem('apollo-notif', '1')
      setEnabled(true)
    }
  }

  function toggle() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem('apollo-notif', next ? '1' : '0')
  }

  const blocked = permission === 'denied'

  return (
    <>
      <div className="panel-header">
        <div><span className="section-label">Alerts</span><h3>Notifications</h3></div>
        {enabled && !blocked ? <Bell size={16} style={{ color: 'var(--accent)' }} /> : <BellOff size={16} style={{ color: 'var(--ink-mute)' }} />}
      </div>
      {blocked ? (
        <p className="muted-copy" style={{ color: 'var(--warn)' }}>
          Notifications are blocked in your browser settings. To re-enable, open your browser's site permissions for this page.
        </p>
      ) : permission === 'granted' ? (
        <>
          <p className="muted-copy">
            {enabled ? "You'll receive a notification before each scheduled injection." : 'Notifications are disabled. Enable to get injection reminders.'}
          </p>
          <button type="button" className="ghost-button" style={{ alignSelf: 'flex-start' }} onClick={toggle}>
            {enabled ? <><BellOff size={14} /> Disable reminders</> : <><Bell size={14} /> Enable reminders</>}
          </button>
        </>
      ) : (
        <>
          <p className="muted-copy">
            Allow Apollo to send you a notification when your next injection is due — even if the tab is in the background.
          </p>
          <button type="button" className="primary-button" style={{ alignSelf: 'flex-start' }} onClick={requestPermission}>
            <Bell size={14} /> Allow notifications
          </button>
        </>
      )}
    </>
  )
}

function BackupSettings({
  compounds,
  injections,
  vitals,
  exams,
  protocols,
}: {
  compounds?: Compound[]
  injections?: InjectionLog[]
  vitals?: VitalLog[]
  exams?: LabExam[]
  protocols?: Protocol[]
}) {
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      await importJson(file)
      setImportDone(true)
      setTimeout(() => setImportDone(false), 4000)
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Backup &amp; export</span>
          <h3>Data export / import</h3>
        </div>
      </div>
      <p className="muted-copy">
        Download a full JSON backup to transfer between devices, or import a backup file.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="primary-button" onClick={exportJson}>
          <Download size={14} /> Download JSON
        </button>
        <label className="ghost-button" style={{ cursor: 'pointer' }}>
          <input type="file" accept="application/json" hidden onChange={handleImport} disabled={importing} />
          <Upload size={14} /> {importDone ? 'Imported ✓' : importing ? 'Importing…' : 'Import JSON'}
        </label>
        <button type="button" className="ghost-button" onClick={() => window.print()}>
          <Printer size={14} /> Print report
        </button>
      </div>
      {/* Hidden print-only report — rendered in DOM, visible only when printing */}
      <PrintReport compounds={compounds} injections={injections} vitals={vitals} exams={exams} protocols={protocols} />
    </>
  )
}

// ─── Print-only clinical summary ───────────────────────────────────────────

function PrintReport({
  compounds,
  injections,
  vitals,
  exams,
  protocols,
}: {
  compounds?: Compound[]
  injections?: InjectionLog[]
  vitals?: VitalLog[]
  exams?: LabExam[]
  protocols?: Protocol[]
}) {
  const compoundMap = new Map((compounds ?? []).map((c) => [c.id, c]))
  const recentBP = (vitals ?? []).slice(0, 10)
  const avgSys = recentBP.length ? Math.round(recentBP.reduce((s, v) => s + v.systolic, 0) / recentBP.length) : null
  const avgDia = recentBP.length ? Math.round(recentBP.reduce((s, v) => s + v.diastolic, 0) / recentBP.length) : null
  const recentInjections = (injections ?? []).slice(0, 20)

  return (
    <div className="print-report">
      <div className="print-header">
        <div>
          <h1>Apollo Health — Clinical Summary</h1>
          <p>Generated {format(new Date(), 'MMMM d, yyyy')}</p>
        </div>
        <p style={{ fontSize: 11, color: '#666', maxWidth: 300, textAlign: 'right' }}>
          This report is for informational purposes only. Please discuss with your healthcare provider.
        </p>
      </div>

      {/* Active Protocols */}
      {protocols && protocols.filter((p) => !p.archived).length > 0 && (
        <section className="print-section">
          <h2>Active Protocols</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Compound</th>
                <th>Dose</th>
                <th>Schedule</th>
                <th>Phase</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {protocols.filter((p) => !p.archived).map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{compoundMap.get(p.compoundId)?.name ?? '—'}</td>
                  <td>{p.dose} {p.unit}</td>
                  <td>{describeCadence(p.cadence)}</td>
                  <td>{p.phase ?? '—'}</td>
                  <td>{p.startedAt ? format(parseISO(p.startedAt), 'MMM d, yyyy') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Blood Pressure */}
      {recentBP.length > 0 && (
        <section className="print-section">
          <h2>Blood Pressure <span style={{ fontSize: 12, fontWeight: 400, color: '#555' }}>({recentBP.length} readings)</span></h2>
          {avgSys && <p className="print-stat">Average: <strong>{avgSys}/{avgDia} mmHg</strong> — {avgSys >= 130 ? '⚠ Elevated' : '✓ Normal range'}</p>}
          <table className="print-table">
            <thead>
              <tr><th>Date</th><th>Systolic</th><th>Diastolic</th><th>Pulse</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {recentBP.map((v) => (
                <tr key={v.id}>
                  <td>{format(parseISO(v.measuredAt), 'MMM d, yyyy HH:mm')}</td>
                  <td style={{ color: v.systolic >= 140 ? '#dc2626' : v.systolic >= 130 ? '#d97706' : undefined }}>{v.systolic}</td>
                  <td>{v.diastolic}</td>
                  <td>{v.pulse ?? '—'}</td>
                  <td>{v.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Recent Lab Exams */}
      {exams && exams.length > 0 && (
        <section className="print-section">
          <h2>Lab History</h2>
          <table className="print-table">
            <thead>
              <tr><th>Date</th><th>Panel / Test</th><th>Lab</th></tr>
            </thead>
            <tbody>
              {exams.slice(0, 10).map((e) => (
                <tr key={e.id}>
                  <td>{e.collectedAt ? format(parseISO(e.collectedAt), 'MMM d, yyyy') : '—'}</td>
                  <td>{e.name}</td>
                  <td>{e.labName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Injection Log */}
      {recentInjections.length > 0 && (
        <section className="print-section">
          <h2>Recent Injections</h2>
          <table className="print-table">
            <thead>
              <tr><th>Date</th><th>Compound</th><th>Dose</th><th>Route</th><th>Site</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {recentInjections.map((inj) => (
                <tr key={inj.id}>
                  <td>{format(parseISO(inj.takenAt), 'MMM d, yyyy HH:mm')}</td>
                  <td>{compoundMap.get(inj.compoundId)?.name ?? '—'}</td>
                  <td>{inj.dose} {compoundMap.get(inj.compoundId)?.unit ?? ''}</td>
                  <td>{(inj as { route?: string }).route ?? 'IM'}</td>
                  <td>{inj.site ?? '—'}</td>
                  <td>{inj.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="print-footer">
        Exported from Apollo Health · {format(new Date(), 'MMMM d, yyyy')} · Data is stored locally on your device.
      </p>
    </div>
  )
}

function LabDataSettings() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function clearLabs() {
    if (!confirm('Clear all lab exams and results? This cannot be undone.')) return
    setBusy(true)
    try {
      await db.results.clear()
      await db.exams.clear()
      await db.files.clear()
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="panel-header">
        <div><span className="section-label">Labs</span><h3>Lab data</h3></div>
        <FlaskConical size={16} style={{ color: 'var(--accent-ink)' }} />
      </div>
      <p className="muted-copy">
        Remove all imported lab results and exams. Use this to fix duplicate data before re-importing from PDFs.
      </p>
      <button
        type="button"
        className="ghost-button"
        style={{ alignSelf: 'flex-start', color: 'var(--warn)', borderColor: 'rgba(245,158,11,0.3)' }}
        onClick={clearLabs}
        disabled={busy}
      >
        <Trash2 size={14} /> {done ? 'Cleared ✓' : busy ? 'Clearing…' : 'Clear all lab data'}
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
        <Trash2 size={14} /> Wipe all local data…
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
