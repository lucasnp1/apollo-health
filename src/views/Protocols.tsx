import { useMemo, useState } from 'react'
import { Pencil, Plus, Syringe, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type Protocol } from '../lib/db'
import { simpleUpcomingSchedule } from '../lib/schedule'
import { deleteInjection } from '../lib/injections'
import { useUndoableDelete } from '../lib/useUndoableDelete'
import { SiteCombobox } from '../components/SiteCombobox'
import { SiteRotation } from '../components/SiteRotation'
import { DashGrid } from '../components/dashboard/Grid'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { CompoundCarousel } from '../components/dashboard/CompoundCarousel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function Protocols({
  compounds,
  injections,
  onOpenQuickLog,
  onOpenWizard,
  onEditProtocol,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  onOpenQuickLog: (tab: 'injection', prefill?: import('../App').QuickLogPrefill) => void
  onOpenWizard: () => void
  onEditProtocol: (p: Protocol & { id: number }) => void
}) {
  const protocols = useLiveQuery(() => db.protocols.toArray(), [], [])
  const protocolDoses = useLiveQuery(() => db.protocolDoses.toArray(), [], [])
  const activeProtocols = useMemo(
    () => (protocols ?? []).filter(p => !p.archived),
    [protocols],
  )
  const schedule = useMemo(
    () => simpleUpcomingSchedule(activeProtocols, injections, protocolDoses),
    [activeProtocols, injections, protocolDoses],
  )

  return (
    <div className="flex flex-col gap-5">
      {/* ── Compounds carousel hero ── */}
      {activeProtocols.length > 0 ? (
        <CompoundCarousel
          protocols={activeProtocols}
          compounds={compounds}
          injections={injections}
          schedule={schedule}
          onLog={onOpenQuickLog}
          onEdit={onEditProtocol}
        />
      ) : (
        <PanelCard>
          <PanelEmpty
            icon={Syringe}
            title="Nothing set up yet"
            detail="Add a compound to track your schedule and doses."
            action={<Button onClick={onOpenWizard}><Plus className="size-4" /> Add compound</Button>}
          />
        </PanelCard>
      )}

      <DashGrid>
        {/* ── Recent doses ── */}
        <PanelCard className="md:col-span-2 xl:col-span-4" title="Recent doses" subtitle="Latest logged injections">
          <RecentDoses injections={injections} compounds={compounds} />
        </PanelCard>

        {/* ── Site rotation ── */}
        <PanelCard className="md:col-span-2 xl:col-span-2" title="Site rotation" subtitle="Red = used recently">
          <SiteRotation injections={injections} compounds={compounds} />
        </PanelCard>
      </DashGrid>
    </div>
  )
}

// ── Recent doses ──────────────────────────────────────────────────────────

function RecentDoses({ injections, compounds }: { injections: InjectionLog[]; compounds: Compound[] }) {
  const compoundMap = new Map(compounds.map((c) => [c.id, c]))
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [editEntry, setEditEntry] = useState<InjectionLog | null>(null)
  const deleteWithUndo = useUndoableDelete()

  async function handleDelete(id: number) {
    const snapshot = await db.injections.get(id)
    setConfirmId(null)
    if (!snapshot) return
    void deleteWithUndo({
      label: 'Injection deleted',
      remove: () => deleteInjection(id),
      // Vial volume self-corrects on next render once the row is back.
      restore: () => db.injections.put(snapshot),
    })
  }

  return (
    <>
      {/* Delete confirm */}
      <Dialog open={confirmId !== null} onOpenChange={(o) => { if (!o) setConfirmId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>Delete this injection log?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmId !== null && handleDelete(confirmId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editEntry && (
        <EditInjectionDialog
          entry={editEntry}
          compounds={compounds}
          onClose={() => setEditEntry(null)}
        />
      )}

      {injections.length > 0 ? (
        <div className="flex flex-col">
          {injections.slice(0, 10).map((entry, i) => {
            const c = compoundMap.get(entry.compoundId)
            return (
              <div key={entry.id} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t')}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: c?.color ?? 'var(--primary)' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c?.name ?? 'Unknown'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.rawDose ?? `${entry.dose ?? ''} ${entry.unit}`}
                    {entry.site ? ` · ${entry.site}` : ''}
                    {entry.weightKg !== undefined ? ` · ${entry.weightKg} kg` : ''}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </p>
                </div>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{format(parseISO(entry.takenAt), 'MMM d HH:mm')}</time>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditEntry(entry)} aria-label="Edit">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setConfirmId(entry.id!)} aria-label="Delete">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <PanelEmpty icon={Syringe} title="No injections logged" detail="Tap Log on a compound card or use Quick Log in the sidebar." />
      )}
    </>
  )
}

// ── Edit injection dialog ───────────────────────────────────────────────────

function EditInjectionDialog({ entry, compounds, onClose }: { entry: InjectionLog; compounds: Compound[]; onClose: () => void }) {
  const [compoundId, setCompoundId] = useState(entry.compoundId)
  const [dose, setDose] = useState(String(entry.dose ?? ''))
  const [route, setRoute] = useState<'IM' | 'SubQ' | 'Oral' | 'Other'>(entry.route ?? 'IM')
  const [site, setSite] = useState(entry.site ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [takenAt, setTakenAt] = useState(entry.takenAt.slice(0, 16))
  const [busy, setBusy] = useState(false)
  const compound = compounds.find((c) => c.id === compoundId)

  const recentInjections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().limit(30).toArray(), [], [])
  const recentSites = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const inj of recentInjections ?? []) {
      if (inj.site && !seen.has(inj.site)) { seen.add(inj.site); out.push(inj.site) }
      if (out.length >= 6) break
    }
    return out
  }, [recentInjections])

  async function save() {
    setBusy(true)
    try {
      await db.injections.update(entry.id!, {
        compoundId,
        dose: dose ? Number(dose) : undefined,
        rawDose: dose ? `${dose} ${compound?.unit ?? entry.unit}` : entry.rawDose,
        unit: (compound?.unit ?? entry.unit) as InjectionLog['unit'],
        route,
        site: site || undefined,
        notes: notes || undefined,
        takenAt: new Date(takenAt).toISOString(),
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit injection</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Compound</Label>
            <Select value={String(compoundId)} onValueChange={(v) => setCompoundId(Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {compounds.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ei-dose">Dose ({compound?.unit ?? entry.unit})</Label>
            <Input id="ei-dose" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Route</Label>
            <Select value={route} onValueChange={(v) => setRoute(v as typeof route)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IM">IM (Intramuscular)</SelectItem>
                <SelectItem value="SubQ">SubQ (Subcutaneous)</SelectItem>
                <SelectItem value="Oral">Oral</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Site</Label>
            <SiteCombobox value={site} onChange={setSite} recentSites={recentSites} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="ei-when">Date &amp; time</Label>
            <Input id="ei-when" type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="ei-notes">Notes</Label>
            <Input id="ei-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
