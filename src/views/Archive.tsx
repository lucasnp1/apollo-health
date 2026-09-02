import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { Archive as ArchiveIcon, RotateCcw } from 'lucide-react'
import { db } from '../lib/db'
import { restoreRow, setFileArchived } from '../lib/archive'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Item = { id: number; label: string; at?: string; restore: () => Promise<void> }

// Everything the user has archived, grouped by type, each restorable. Archived
// rows are hidden from the app but kept + synced, never permanently deleted.
export function Archive() {
  const files = useLiveQuery(() => db.files.filter((f) => !!f.archivedAt).reverse().sortBy('archivedAt'), [], [])
  const injections = useLiveQuery(() => db.injections.filter((i) => !!i.archivedAt).toArray(), [], [])
  const vitals = useLiveQuery(() => db.vitals.filter((v) => !!v.archivedAt).toArray(), [], [])
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.filter((b) => !!b.archivedAt).toArray(), [], [])
  const symptoms = useLiveQuery(() => db.symptoms.filter((s) => !!s.archivedAt).toArray(), [], [])
  const compounds = useLiveQuery(() => db.compounds.toArray(), [], [])
  // Only show results archived on their own — ones archived with a file are
  // restored by restoring that file, so listing them here would double up.
  const results = useLiveQuery(async () => {
    const archived = await db.results.filter((r) => !!r.archivedAt).toArray()
    if (!archived.length) return []
    const examIds = [...new Set(archived.map((r) => r.examId))]
    const exams = await db.exams.where('id').anyOf(examIds).toArray()
    const archivedExam = new Set(exams.filter((e) => e.archivedAt).map((e) => e.id))
    return archived.filter((r) => !archivedExam.has(r.examId))
  }, [], [])

  const compMap = new Map((compounds ?? []).map((c) => [c.id, c]))

  const groups: Array<{ key: string; title: string; items: Item[] }> = [
    { key: 'files', title: 'Files', items: (files ?? []).map((f) => ({ id: f.id!, label: f.name, at: f.addedAt, restore: () => setFileArchived(f.id!, false) })) },
    { key: 'inj', title: 'Injections', items: (injections ?? []).map((i) => ({ id: i.id!, label: `${compMap.get(i.compoundId)?.name ?? 'Injection'} · ${i.rawDose ?? (i.dose != null ? `${i.dose} ${i.unit}` : '')}`, at: i.takenAt, restore: () => restoreRow('injections', i.id!) })) },
    { key: 'weight', title: 'Weight', items: (bodyMetrics ?? []).filter((b) => b.weightKg != null).map((b) => ({ id: b.id!, label: `${b.weightKg} kg`, at: b.measuredAt, restore: () => restoreRow('bodyMetrics', b.id!) })) },
    { key: 'bp', title: 'Blood pressure', items: (vitals ?? []).map((v) => ({ id: v.id!, label: `${v.systolic}/${v.diastolic}`, at: v.measuredAt, restore: () => restoreRow('vitals', v.id!) })) },
    { key: 'sym', title: 'Symptoms', items: (symptoms ?? []).map((s) => ({ id: s.id!, label: 'Check-in', at: s.recordedAt, restore: () => restoreRow('symptoms', s.id!) })) },
    { key: 'labs', title: 'Lab results', items: (results ?? []).map((r) => ({ id: r.id!, label: `${r.marker} · ${r.rawValue}${r.unit ? ' ' + r.unit : ''}`, restore: () => restoreRow('results', r.id!) })) },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <div className="mb-5">
        <p className="eyebrow">Archive</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.01em]">Archive</h2>
        <p className="mt-1 text-sm text-muted-foreground">Archived items are hidden from your log but never deleted. Restore anything whenever you want.</p>
      </div>

      {groups.length === 0 ? (
        <PanelCard title="Archive">
          <PanelEmpty icon={ArchiveIcon} title="Nothing archived" detail="Items you remove are kept here so you can always restore them." />
        </PanelCard>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <PanelCard key={g.key} title={g.title} subtitle={`${g.items.length} archived`}>
              <div className="flex flex-col">
                {g.items.map((it, idx) => (
                  <div key={it.id} className={cn('flex items-center gap-3 py-2.5', idx > 0 && 'border-t')}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.label}</p>
                      {it.at && <p className="text-xs text-muted-foreground">{format(parseISO(it.at), 'MMM d, yyyy')}</p>}
                    </div>
                    <Button variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => void it.restore()}>
                      <RotateCcw className="size-3" /> Restore
                    </Button>
                  </div>
                ))}
              </div>
            </PanelCard>
          ))}
        </div>
      )}
    </div>
  )
}
