import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, BellOff, Download, FileText, FlaskConical, LogOut, Moon, Printer, RotateCcw, Send, Sparkles, Sun, Trash2, Upload, UserCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { wipeLocalDatabase } from '../lib/lock'
import { useTheme } from '../lib/useTheme'
import { describeCadence } from '../lib/schedule'
import type { useAuth } from '../lib/useAuth'
import type { Compound, InjectionLog, LabExam, Protocol, VitalLog } from '../lib/db'
import { DashGrid } from '../components/dashboard/Grid'
import { PanelCard } from '../components/dashboard/PanelCard'
import { usePlan } from '../lib/plan'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type AuthBundle = ReturnType<typeof useAuth>

// Toggle to bring back the "Reset device" (wipe-all) card in Settings.
const SHOW_RESET_DEVICE = false

// Where the "Send feedback" button is addressed. One place to change later.
const FEEDBACK_EMAIL = 'jocenildo@gmail.com'

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
  onExport,
}: {
  auth: AuthBundle
  compounds?: Compound[]
  injections?: InjectionLog[]
  vitals?: VitalLog[]
  exams?: LabExam[]
  protocols?: Protocol[]
  onExport: () => void
}) {
  return (
    <DashGrid>
      <div className="md:col-span-1 xl:col-span-3"><AccountSettings auth={auth} /></div>
      <div className="md:col-span-1 xl:col-span-3"><AppearanceSettings /></div>
      <div className="md:col-span-1 xl:col-span-3"><NotificationSettings /></div>
      <div className="md:col-span-1 xl:col-span-3">
        <BackupSettings
          compounds={compounds}
          injections={injections}
          vitals={vitals}
          exams={exams}
          protocols={protocols}
          onExport={onExport}
        />
      </div>
      <div className="md:col-span-1 xl:col-span-3"><FeedbackSettings auth={auth} /></div>
      <div className="md:col-span-2 xl:col-span-6"><LabDataSettings /></div>
      <div className="md:col-span-2 xl:col-span-6"><TrashSettings compounds={compounds ?? []} /></div>
      {/* Reset device / danger zone hidden for now — flip to re-enable. */}
      {SHOW_RESET_DEVICE && <div className="md:col-span-2 xl:col-span-6"><DangerSettings /></div>}
    </DashGrid>
  )
}

// ── Feedback ───────────────────────────────────────────────────────────────
// One-tap feedback: user types a note, tapping Send opens their own email app
// pre-addressed to us with the message + a little device context. Nothing is
// sent automatically and no backend is involved.
function FeedbackSettings({ auth }: { auth: AuthBundle }) {
  const [msg, setMsg] = useState('')
  const user = auth.state.status === 'authed' ? auth.state.user : null

  function send() {
    const body = [
      msg.trim(),
      '',
      'Sent from Apollo Health',
      user?.email ? `Account: ${user.email}` : '',
      `Device: ${navigator.userAgent}`,
    ].filter(Boolean).join('\n')
    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Apollo Health feedback')}&body=${encodeURIComponent(body)}`
  }

  return (
    <PanelCard subtitle="Help us make Apollo better" title="Send feedback">
      <div className="flex flex-col gap-3">
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={4}
          placeholder="What's working, what's broken, what you wish it did…"
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] leading-tight text-muted-foreground">Opens your email app, addressed to us.</p>
          <Button onClick={send} disabled={!msg.trim()} className="shrink-0">
            <Send className="size-4" /> Send feedback
          </Button>
        </div>
      </div>
    </PanelCard>
  )
}

// ── Trash ────────────────────────────────────────────────────────────────
// Lists soft-deleted injections (those with a sync tombstone set) so the
// user can restore one before it's pushed to the server. Only injections
// currently soft-delete on this app — other tables hard-delete, but the
// undo toast catches those at the moment of deletion.
function TrashSettings({ compounds }: { compounds: Compound[] }) {
  const deleted = useLiveQuery(
    () => db.injections
      .filter((i) => i.deletedAtSync !== undefined && i.deletedAtSync !== null)
      .toArray(),
    [],
    [],
  )
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const sorted = [...deleted].sort((a, b) => (b.deletedAtSync ?? 0) - (a.deletedAtSync ?? 0))

  async function restore(id: number) {
    // Clear the tombstone + bump updatedAt so the sync engine pushes the
    // restoration on the next tick. `.modify` removes the property cleanly
    // (partial-update with undefined leaves the key in place).
    await db.injections.where('id').equals(id).modify((row) => {
      delete row.deletedAtSync
      row.updatedAt = Date.now()
      row.dirty = 1
    })
  }

  async function purgeAll() {
    if (!confirm('Permanently delete all trash? This cannot be undone.')) return
    await db.injections.filter((i) => i.deletedAtSync !== undefined).delete()
  }

  return (
    <PanelCard
      subtitle="Recently deleted"
      title="Trash"
      action={sorted.length > 0 && (
        <Button variant="outline" size="sm" onClick={purgeAll}>
          <Trash2 className="size-3.5" /> Empty trash
        </Button>
      )}
    >
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recently deleted injections. Items you delete appear here until they sync.
        </p>
      ) : (
        <div className="flex flex-col">
          {sorted.map((inj, i) => {
            const c = compoundMap.get(inj.compoundId)
            const deletedAt = inj.deletedAtSync ? new Date(inj.deletedAtSync) : null
            return (
              <div key={inj.id} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c?.name ?? 'Unknown compound'} · {inj.dose}{inj.unit ? ` ${inj.unit}` : ''}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Logged {format(parseISO(inj.takenAt), 'MMM d, HH:mm')}
                    {deletedAt && ` · Deleted ${format(deletedAt, 'MMM d, HH:mm')}`}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => inj.id !== undefined && restore(inj.id)}>
                  <RotateCcw className="size-3" /> Restore
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </PanelCard>
  )
}

function AccountSettings({ auth }: { auth: AuthBundle }) {
  const user = auth.state.status === 'authed' ? auth.state.user : null
  const { isPro, openUpgrade } = usePlan()
  const planLabel = isPro ? (user?.plan_kind ? `Apollo Pro · ${user.plan_kind}` : 'Apollo Pro') : 'Free plan'
  return (
    <PanelCard
      className="h-full"
      subtitle="Account"
      title={user?.email ?? 'Account'}
      action={<UserCircle className="size-4 text-muted-foreground" />}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Signed in as <strong className="text-foreground">{user?.display_name || user?.email}</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', isPro ? 'bg-primary/12 text-primary' : 'bg-secondary text-muted-foreground')}>
            {isPro && <Sparkles className="size-3" />} {planLabel}
          </span>
          {!isPro && (
            <Button size="sm" onClick={() => openUpgrade()}>
              <Sparkles className="size-3.5" /> Upgrade to Pro
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={() => auth.logout()}>
          <LogOut className="size-3.5" /> Sign out
        </Button>
      </div>
    </PanelCard>
  )
}

function AppearanceSettings() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <PanelCard
      className="h-full"
      subtitle="Display"
      title="Appearance"
      action={isDark ? <Moon className="size-4 text-muted-foreground" /> : <Sun className="size-4 text-muted-foreground" />}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Switch between light and dark theme. Your preference is saved locally.</p>
        <Button variant="outline" size="sm" className="self-start" onClick={toggle}>
          {isDark ? <><Sun className="size-3.5" /> Switch to light mode</> : <><Moon className="size-3.5" /> Switch to dark mode</>}
        </Button>
      </div>
    </PanelCard>
  )
}

function NotificationSettings() {
  const { isPro, openUpgrade } = usePlan()
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
    <PanelCard
      className="h-full"
      subtitle="Alerts"
      title="Notifications"
      action={enabled && !blocked && isPro ? <Bell className="size-4 text-muted-foreground" /> : <BellOff className="size-4 text-muted-foreground" />}
    >
      {!isPro ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Get a reminder before each scheduled injection is due.</p>
          <Button size="sm" className="self-start" onClick={() => openUpgrade('Injection reminders')}>
            <Sparkles className="size-3.5" /> Unlock with Pro
          </Button>
        </div>
      ) : blocked ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Notifications are blocked in your browser settings. To re-enable, open your browser's site permissions for this page.
        </p>
      ) : permission === 'granted' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {enabled ? "You'll receive a notification before each scheduled injection." : 'Notifications are disabled. Enable to get injection reminders.'}
          </p>
          <Button variant="outline" size="sm" className="self-start" onClick={toggle}>
            {enabled ? <><BellOff className="size-3.5" /> Disable reminders</> : <><Bell className="size-3.5" /> Enable reminders</>}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Allow Apollo to send you a notification when your next injection is due, even if the tab is in the background.
          </p>
          <Button size="sm" className="self-start" onClick={requestPermission}>
            <Bell className="size-3.5" /> Allow notifications
          </Button>
        </div>
      )}
    </PanelCard>
  )
}

function BackupSettings({
  compounds,
  injections,
  vitals,
  exams,
  protocols,
  onExport,
}: {
  compounds?: Compound[]
  injections?: InjectionLog[]
  vitals?: VitalLog[]
  exams?: LabExam[]
  protocols?: Protocol[]
  onExport: () => void
}) {
  const { isPro, openUpgrade } = usePlan()
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
    <PanelCard className="h-full" subtitle="Export & backup" title="Export your data">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Export your log as a CSV sheet or PDF to share, for example with a doctor. You choose exactly what to include.
        </p>
        <Button size="sm" className="self-start" onClick={onExport}>
          <FileText className="size-3.5" /> Export CSV or PDF {!isPro && <Sparkles className="size-3" />}
        </Button>

        <div className="mt-1 border-t pt-3">
          <p className="mb-2 text-xs text-muted-foreground">Full backup, to move everything to a new device.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportJson}>
              <Download className="size-3.5" /> Backup file
            </Button>
            <Button asChild variant="outline" size="sm">
              <label className="cursor-pointer">
                <input type="file" accept="application/json" hidden onChange={handleImport} disabled={importing} />
                <Upload className="size-3.5" /> {importDone ? 'Imported ✓' : importing ? 'Importing…' : 'Restore'}
              </label>
            </Button>
            <Button variant="outline" size="sm" onClick={() => (isPro ? window.print() : openUpgrade('Print report'))}>
              <Printer className="size-3.5" /> Print {!isPro && <Sparkles className="size-3 text-primary" />}
            </Button>
          </div>
        </div>
      </div>
      {/* Hidden print-only report — rendered in DOM, visible only when printing */}
      <PrintReport compounds={compounds} injections={injections} vitals={vitals} exams={exams} protocols={protocols} />
    </PanelCard>
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
          <h1>Apollo Health Clinical Summary</h1>
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
          {avgSys && <p className="print-stat">Average: <strong>{avgSys}/{avgDia} mmHg</strong> ({avgSys >= 130 ? '⚠ Elevated' : '✓ Normal range'})</p>}
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
  // Live dupe scan so the count refreshes as the user dedupes / imports.
  const allExams = useLiveQuery(() => db.exams.toArray(), [], []) as LabExam[]
  const dupeGroups = useMemo(() => {
    const groups = new Map<string, LabExam[]>()
    for (const ex of allExams) {
      // Group on the same key the user perceives as "the same exam":
      // name + collection date (rounded to day).
      const key = `${ex.name.trim().toLowerCase()}|${ex.collectedAt.slice(0, 10)}`
      const list = groups.get(key) ?? []
      list.push(ex)
      groups.set(key, list)
    }
    return [...groups.values()].filter((g) => g.length > 1)
  }, [allExams])
  const dupeExamCount = dupeGroups.reduce((sum: number, g: LabExam[]) => sum + (g.length - 1), 0)
  const [scanShown, setScanShown] = useState(false)

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

  // Surgical: keep the OLDEST exam in each group + its results, delete the
  // rest. Same-day same-name groups have effectively identical data, so
  // the "oldest wins" rule preserves the original record and drops the
  // accidental clones from re-imports.
  async function dedupeExams() {
    if (dupeExamCount === 0) return
    if (!confirm(`Remove ${dupeExamCount} duplicate exam${dupeExamCount === 1 ? '' : 's'} and the ${'results'} attached to them? The oldest copy of each group is kept.`)) return
    setBusy(true)
    try {
      const toDelete: number[] = []
      for (const group of dupeGroups) {
        // Sort by createdAt if available else by id; oldest first → keep [0].
        const sorted = [...group].sort((a, b) => {
          const at = (a as { createdAt?: number }).createdAt ?? a.id ?? 0
          const bt = (b as { createdAt?: number }).createdAt ?? b.id ?? 0
          return at - bt
        })
        for (let i = 1; i < sorted.length; i++) {
          const id = sorted[i].id
          if (typeof id === 'number') toDelete.push(id)
        }
      }
      // Drop the results that belonged to the doomed exams first so we
      // don't leave dangling result rows.
      if (toDelete.length > 0) {
        await db.results.where('examId').anyOf(toDelete).delete()
        await db.exams.where('id').anyOf(toDelete).delete()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelCard
      subtitle="Labs"
      title="Lab data"
      action={<FlaskConical className="size-4 text-muted-foreground" />}
    >
      {/* Duplicate scanner — surfaces dupes the user accumulated from
          re-importing the same JSON backup multiple times. */}
      <div className="mb-4 flex flex-col gap-2.5">
        <p className="text-sm text-muted-foreground">
          {dupeExamCount === 0
            ? 'No duplicate exams detected on this device.'
            : `${dupeExamCount} duplicate exam${dupeExamCount === 1 ? '' : 's'} detected across ${dupeGroups.length} group${dupeGroups.length === 1 ? '' : 's'}. Same name + same date.`}
        </p>
        {dupeExamCount > 0 && (
          <>
            <Button variant="outline" size="sm" className="self-start" onClick={() => setScanShown((s) => !s)}>
              {scanShown ? 'Hide list' : `Show ${dupeGroups.length} duplicate group${dupeGroups.length === 1 ? '' : 's'}`}
            </Button>
            {scanShown && (
              <ul className="ml-4 flex list-disc flex-col gap-1 text-xs text-muted-foreground">
                {dupeGroups.slice(0, 12).map((g: LabExam[], i: number) => (
                  <li key={i}>
                    {g[0].name} · {format(parseISO(g[0].collectedAt), 'MMM d, yyyy')} · {g.length} copies
                  </li>
                ))}
                {dupeGroups.length > 12 && <li>… and {dupeGroups.length - 12} more</li>}
              </ul>
            )}
            <Button size="sm" className="self-start" onClick={dedupeExams} disabled={busy}>
              <Trash2 className="size-3.5" /> Remove {dupeExamCount} duplicate{dupeExamCount === 1 ? '' : 's'}
            </Button>
          </>
        )}
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        Or remove all imported lab results and exams to start clean.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="self-start text-amber-700 dark:text-amber-400"
        onClick={clearLabs}
        disabled={busy}
      >
        <Trash2 className="size-3.5" /> {done ? 'Cleared ✓' : busy ? 'Clearing…' : 'Clear all lab data'}
      </Button>
    </PanelCard>
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

  return (
    <PanelCard
      subtitle="Danger zone"
      title="Reset device"
      action={<AlertTriangle className="size-4 text-destructive" />}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Wipes every local table: compounds, injections, vitals, labs, files, protocols, vials, symptoms,
          targets, body metrics, and your passphrase. <strong className="text-foreground">Cannot be undone.</strong>
        </p>
        <Button variant="outline" size="sm" className="self-start text-destructive" onClick={() => setModalOpen(true)}>
          <Trash2 className="size-3.5" /> Wipe all local data…
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) closeModal() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Wipe all local data?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete every injection, vital, lab result, protocol, compound, file, and
              symptom stored on this device. <strong className="text-destructive">There is no undo.</strong>
              {' '}If you are synced, your data remains on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wipe-confirm">
              Type <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">RESET</code> to confirm
            </Label>
            <Input
              id="wipe-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              autoFocus
              className="font-mono tracking-widest"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={wipe} disabled={!confirmed || busy}>
              <Trash2 className="size-3.5" /> {busy ? 'Wiping…' : 'Wipe everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelCard>
  )
}
