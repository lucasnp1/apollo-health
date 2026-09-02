import { useState } from 'react'
import { AlertTriangle, Archive as ArchiveIcon, Bell, BellOff, Download, FileText, KeyRound, LogOut, Send, Sparkles, Trash2, Upload, UserX } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { wipeLocalDatabase } from '../lib/lock'
import { describeCadence } from '../lib/schedule'
import type { useAuth } from '../lib/useAuth'
import type { Compound, InjectionLog, LabExam, Protocol, VitalLog } from '../lib/db'
import { DashGrid } from '../components/dashboard/Grid'
import { PanelCard } from '../components/dashboard/PanelCard'
import { PasswordRules, passwordOk } from '../components/PasswordRules'
import { LegalLink } from '../components/LegalLink'
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
  onOpenArchive,
}: {
  auth: AuthBundle
  compounds?: Compound[]
  injections?: InjectionLog[]
  vitals?: VitalLog[]
  exams?: LabExam[]
  protocols?: Protocol[]
  onExport: () => void
  onOpenArchive: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <DashGrid>
        <div className="md:col-span-1 xl:col-span-3"><AccountSettings auth={auth} /></div>
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
        <div className="md:col-span-1 xl:col-span-3"><FeedbackSettings /></div>
        <div className="md:col-span-1 xl:col-span-3"><ArchiveCard onOpen={onOpenArchive} /></div>
        {/* Reset device / danger zone hidden for now — flip to re-enable. */}
        {SHOW_RESET_DEVICE && <div className="md:col-span-2 xl:col-span-6"><DangerSettings /></div>}
      </DashGrid>

      {/* Sign out — floating, no container, red. */}
      <div className="flex flex-col items-center gap-3 pb-2">
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => auth.logout()}>
          <LogOut className="size-3.5" /> Sign out
        </Button>
        <p className="text-[11px] text-muted-foreground">
          <LegalLink href="/privacy" className="text-muted-foreground">Privacy</LegalLink>
          {' · '}
          <LegalLink href="/terms" className="text-muted-foreground">Terms</LegalLink>
        </p>
      </div>
    </div>
  )
}

// ── Feedback ───────────────────────────────────────────────────────────────
// One-tap feedback: user types a note, tapping Send opens their own email app
// pre-addressed to us with the message + a little device context. Nothing is
// sent automatically and no backend is involved.
function FeedbackSettings() {
  const { showToast } = useToast()
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    const message = msg.trim()
    if (!message || sending) return
    setSending(true)
    try {
      await api.post('/api/feedback', { message })
      setMsg('')
      showToast({ message: 'Thanks. Your feedback was sent.' })
    } catch {
      showToast({ tone: 'error', message: 'Could not send. Please try again.' })
    } finally {
      setSending(false)
    }
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
        <Button onClick={send} disabled={!msg.trim() || sending} className="self-start">
          <Send className="size-4" /> {sending ? 'Sending…' : 'Send feedback'}
        </Button>
      </div>
    </PanelCard>
  )
}

// ── Archive ────────────────────────────────────────────────────────────────
// Removing anything in Apollo archives it (never a permanent delete). This card
// counts what's archived and opens the full Archive view to restore from.
function ArchiveCard({ onOpen }: { onOpen: () => void }) {
  const count = useLiveQuery(async () => {
    const counts = await Promise.all([
      db.injections.filter((i) => !!i.archivedAt).count(),
      db.vitals.filter((v) => !!v.archivedAt).count(),
      db.bodyMetrics.filter((b) => !!b.archivedAt).count(),
      db.symptoms.filter((s) => !!s.archivedAt).count(),
      db.files.filter((f) => !!f.archivedAt).count(),
      db.results.filter((r) => !!r.archivedAt).count(),
    ])
    return counts.reduce((a, b) => a + b, 0)
  }, [], 0)

  return (
    <PanelCard className="h-full" subtitle="Removed items" title="Archive" action={<ArchiveIcon className="size-4 text-muted-foreground" />}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Anything you remove is archived, never deleted. {count ? `${count} item${count === 1 ? '' : 's'} archived.` : 'Nothing archived yet.'}
        </p>
        <Button variant="outline" size="sm" className="self-start" onClick={onOpen}>
          <ArchiveIcon className="size-3.5" /> Open archive
        </Button>
      </div>
    </PanelCard>
  )
}

function AccountSettings({ auth }: { auth: AuthBundle }) {
  const user = auth.state.status === 'authed' ? auth.state.user : null
  const { isPro, openUpgrade } = usePlan()
  const planLabel = isPro ? (user?.plan_kind ? `Apollo Pro · ${user.plan_kind}` : 'Apollo Pro') : 'Free plan'
  const [pwOpen, setPwOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  return (
    <PanelCard
      className="h-full"
      subtitle="Account"
      title={user?.email ?? 'Account'}
      action={
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', isPro ? 'bg-primary/12 text-primary' : 'bg-secondary text-muted-foreground')}>
          {isPro && <Sparkles className="size-3" />} {planLabel}
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {isPro ? (
          <p className="text-sm text-muted-foreground">You're on Apollo Pro. Thanks for the support.</p>
        ) : (
          <Button size="sm" className="self-start" onClick={() => openUpgrade()}>
            <Sparkles className="size-3.5" /> Upgrade to Pro
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
            <KeyRound className="size-3.5" /> Change password
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDelOpen(true)}>
            <UserX className="size-3.5" /> Delete account
          </Button>
        </div>
      </div>
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} auth={auth} />
      <DeleteAccountDialog open={delOpen} onClose={() => setDelOpen(false)} auth={auth} />
    </PanelCard>
  )
}

function ChangePasswordDialog({ open, onClose, auth }: { open: boolean; onClose: () => void; auth: AuthBundle }) {
  const { showToast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const ready = current.length > 0 && passwordOk(next) && next === confirm

  function close() {
    setCurrent(''); setNext(''); setConfirm(''); setError('')
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      await auth.changePassword(current, next)
      showToast({ message: 'Password updated. Your other devices were signed out.' })
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Every other device will be signed out. This one stays signed in.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-current">Current password</Label>
              <Input id="pw-current" type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-next">New password</Label>
              <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              <PasswordRules password={next} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" aria-invalid={mismatch} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {mismatch && <p className="text-[11px] text-destructive">Passwords don't match.</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={!ready || busy}>
              <KeyRound className="size-3.5" /> {busy ? 'Saving…' : 'Save password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteAccountDialog({ open, onClose, auth }: { open: boolean; onClose: () => void; auth: AuthBundle }) {
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const confirmed = confirmText.trim().toUpperCase() === 'DELETE' && password.length > 0

  function close() {
    if (busy) return
    setPassword(''); setConfirmText(''); setError('')
    onClose()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!confirmed || busy) return
    setBusy(true)
    setError('')
    try {
      await auth.deleteAccount(password)
      // Hard reload so no in-memory state from the old account survives.
      window.location.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account')
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Delete your account?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your account and everything in it from our servers: injections, blood pressure, weight, symptoms, labs, uploaded files and any subscription. The copy on this device is removed too.
              {' '}<strong className="text-destructive">There is no undo.</strong> If you want a copy first, export a backup from Settings before you continue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="del-password">Your password</Label>
              <Input id="del-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="del-confirm">
                Type <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">DELETE</code> to confirm
              </Label>
              <Input id="del-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className="font-mono tracking-widest" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={!confirmed || busy}>
              <UserX className="size-3.5" /> {busy ? 'Deleting…' : 'Delete my account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NotificationSettings() {
  return (
    <PanelCard className="h-full" subtitle="Alerts" title="Notifications" action={<BellOff className="size-4 text-muted-foreground" />}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Reminders before each scheduled injection are on the way.</p>
        <Button variant="outline" size="sm" className="self-start" disabled>
          <Bell className="size-3.5" /> Coming soon
        </Button>
      </div>
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
  const { isPro } = usePlan()
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
          </div>
        </div>
      </div>
      {/* Kept in the DOM (hidden) for the browser's own print; the export page covers PDF now. */}
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
