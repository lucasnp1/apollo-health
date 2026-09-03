import { useMemo, useState, type ReactNode } from 'react'
import { Archive as ArchiveIcon, Brain, Check, CircleCheck, Clock, Eye, FileText, FlaskConical, HeartPulse, Scale, SlidersHorizontal, Syringe, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, parseISO, differenceInCalendarDays, isToday, isYesterday } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyMetric, type Compound, type InjectionLog, type LabExam, type Symptom, type VitalLog } from '../lib/db'
import { ALL_SYMPTOMS, chipTone } from '../lib/symptoms'
import { archiveRow, restoreRow, setExamArchived, setFileArchived } from '../lib/archive'
import { useUndoableDelete } from '../lib/useUndoableDelete'
import { PanelCard } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { FeedList, FeedRow, type FeedStatus } from '../components/FeedList'
import { cn } from '@/lib/utils'

type EventType = 'injection' | 'weight' | 'bp' | 'lab' | 'file' | 'symptom'

// Status chip on the right of a feed row.
type Status = FeedStatus
const LOGGED: Status = { label: 'Logged', tone: 'neutral', icon: Check }

// One row of the "All" feed: title · when, a one-line sub, a status chip,
// the note left at the time, and a few small facts.
type TimelineEvent = {
  id: string
  date: Date
  icon: LucideIcon
  title: string
  sub?: string
  status: Status
  note?: string
  facts: string[]
  type: EventType
  compoundId?: number
}

const TYPE_LABELS: Record<EventType, string> = {
  injection: 'Injections',
  weight: 'Weight',
  bp: 'BP',
  lab: 'Labs',
  file: 'Files',
  symptom: 'Symptoms',
}

const TYPE_ICONS: Record<EventType, LucideIcon> = {
  injection: Syringe,
  weight: Scale,
  bp: HeartPulse,
  lab: FlaskConical,
  file: FileText,
  symptom: Brain,
}

// ── BP classification (mirrors the Vitals/BpTrend thresholds) ────────────────
type BpTone = 'good' | 'warn' | 'bad'
function bpStatus(sys: number, dia: number): { label: string; tone: BpTone } {
  if (sys >= 160 || dia >= 105) return { label: 'Action', tone: 'bad' }
  if (sys >= 145 || dia >= 95) return { label: 'High', tone: 'bad' }
  if (sys >= 135 || dia >= 88) return { label: 'Monitor', tone: 'warn' }
  if (sys >= 125 || dia >= 82) return { label: 'Good', tone: 'good' }
  return { label: 'Optimal', tone: 'good' }
}
const TONE_BG: Record<BpTone, string> = {
  good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  bad: 'bg-destructive/12 text-destructive',
}
function bpFeedStatus(sys: number, dia: number): Status {
  const s = bpStatus(sys, dia)
  if (s.tone === 'good') return { label: 'In range', tone: 'good', icon: CircleCheck }
  if (s.tone === 'warn') return { label: 'Monitor', tone: 'warn', icon: Clock }
  return { label: s.label, tone: 'bad', icon: TriangleAlert }
}

// "today at 8:12 AM", "yesterday at …", "Thursday at …", then "Sep 1 at …".
function whenLabel(d: Date, now: Date): string {
  const t = format(d, 'h:mm a')
  if (isToday(d)) return `today at ${t}`
  if (isYesterday(d)) return `yesterday at ${t}`
  const days = differenceInCalendarDays(now, d)
  if (days > 0 && days < 7) return `${format(d, 'EEEE')} at ${t}`
  return `${format(d, d.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy')} at ${t}`
}

function arrow(v: number, digits = 1, unit = ''): string {
  return `${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(digits)}${unit ? ` ${unit}` : ''}`
}

// Signed change with an arrow. `lowerBetter` colours it (BP: down = good).
function Delta({ v, unit, lowerBetter }: { v: number; unit?: string; lowerBetter?: boolean }) {
  if (Math.abs(v) < 0.05) return <span className="text-muted-foreground">±0</span>
  const up = v > 0
  const cls = lowerBetter
    ? up ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'
    : 'text-foreground'
  return (
    <span className={cn('font-medium', cls)}>
      {up ? '↑' : '↓'} {up ? '+' : '−'}{Math.abs(v).toFixed(1)}{unit ? ` ${unit}` : ''}
    </span>
  )
}

function symptomCell(val: unknown, direction: 'positive' | 'negative') {
  if (typeof val !== 'number') return <span className="text-muted-foreground">—</span>
  const tone = chipTone(val, direction)
  const cls = tone === 'good' ? 'text-emerald-700 dark:text-emerald-400'
    : tone === 'bad' ? 'text-destructive'
    : tone === 'warn' ? 'text-amber-700 dark:text-amber-400'
    : 'text-foreground'
  return <span className={cn('font-semibold tabular-nums', cls)}>{val}</span>
}

// ── Generic column-configurable data grid ────────────────────────────────────

type Col<T> = {
  key: string
  label: string
  num?: boolean
  defaultHidden?: boolean
  render: (row: T) => ReactNode
}

function loadHidden(storageKey: string, cols: { key: string; defaultHidden?: boolean }[]): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set(cols.filter((c) => c.defaultHidden).map((c) => c.key))
}

function DataGrid<T>({
  columns, rows, rowKey, storageKey, empty, onArchive,
}: {
  columns: Col<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  storageKey: string
  empty: string
  onArchive?: (row: T) => void
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden(storageKey, columns))
  const [pickerOpen, setPickerOpen] = useState(false)
  const visible = columns.filter((c) => !hidden.has(c.key))

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (visible.length > 1) next.add(key) // keep at least one column
      try { localStorage.setItem(storageKey, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</p>
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setPickerOpen((o) => !o)}>
          <SlidersHorizontal className="size-3.5" /> Columns
        </Button>
      </div>

      {pickerOpen && (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
          {columns.map((c) => {
            const on = !hidden.has(c.key)
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggle(c.key)}
                aria-pressed={on}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="-mx-2 overflow-x-auto sm:mx-0">
          <div className="min-w-full px-2 sm:px-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {visible.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        'whitespace-nowrap border-b border-border px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground',
                        c.num ? 'text-right' : 'text-left',
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                  {onArchive && <th className="w-8 border-b border-border" aria-hidden="true" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={rowKey(row)} className="group transition-colors hover:bg-muted/40">
                    {visible.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'whitespace-nowrap border-b border-border/60 px-3 py-2.5',
                          c.num ? 'text-right font-mono tabular-nums' : 'text-left',
                        )}
                      >
                        {c.render(row)}
                      </td>
                    ))}
                    {onArchive && (
                      <td className="border-b border-border/60 px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onArchive(row)}
                          aria-label="Archive entry"
                          title="Archive"
                          className="rounded-md p-1 text-muted-foreground opacity-40 transition-opacity hover:text-foreground group-hover:opacity-100"
                        >
                          <ArchiveIcon className="size-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Per-type column definitions ──────────────────────────────────────────────

type InjRow = { key: string; inj: InjectionLog; name: string; color: string }
const INJ_COLS: Col<InjRow>[] = [
  { key: 'date', label: 'Date', render: (r) => format(parseISO(r.inj.takenAt), 'MMM d, yyyy') },
  { key: 'time', label: 'Time', render: (r) => format(parseISO(r.inj.takenAt), 'HH:mm') },
  { key: 'drug', label: 'Drug', render: (r) => (
    <span className="flex items-center gap-2 font-medium">
      <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />{r.name}
    </span>
  ) },
  { key: 'amount', label: 'Amount', num: true, render: (r) => r.inj.rawDose ?? (r.inj.dose != null ? `${r.inj.dose} ${r.inj.unit}` : '—') },
  { key: 'route', label: 'Route', render: (r) => r.inj.route },
  { key: 'site', label: 'Site', render: (r) => r.inj.site ?? '—' },
  { key: 'weight', label: 'Body wt', num: true, defaultHidden: true, render: (r) => (r.inj.weightKg != null ? `${r.inj.weightKg} kg` : '—') },
  { key: 'notes', label: 'Notes', render: (r) => r.inj.notes || '—' },
]

type WeightRow = { key: string; id: number; at: string; kg: number; delta?: number; source: string; notes?: string }
const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual', apple_health: 'Apple Health', capacitor_healthkit: 'HealthKit', health_connect: 'Health Connect',
}
const WEIGHT_COLS: Col<WeightRow>[] = [
  { key: 'date', label: 'Date', render: (r) => format(parseISO(r.at), 'MMM d, yyyy') },
  { key: 'time', label: 'Time', render: (r) => format(parseISO(r.at), 'HH:mm') },
  { key: 'weight', label: 'Weight', num: true, render: (r) => <span className="font-semibold">{r.kg} kg</span> },
  { key: 'change', label: 'Change', num: true, render: (r) => (r.delta === undefined ? <span className="text-muted-foreground">—</span> : <Delta v={r.delta} unit="kg" />) },
  { key: 'source', label: 'Source', defaultHidden: true, render: (r) => SOURCE_LABEL[r.source] ?? r.source },
  { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
]

type BpRow = { key: string; v: VitalLog; dSys?: number }
const BP_COLS: Col<BpRow>[] = [
  { key: 'date', label: 'Date', render: (r) => format(parseISO(r.v.measuredAt), 'MMM d, yyyy') },
  { key: 'time', label: 'Time', render: (r) => format(parseISO(r.v.measuredAt), 'HH:mm') },
  { key: 'sys', label: 'Systolic', num: true, render: (r) => <span className="font-semibold">{r.v.systolic}</span> },
  { key: 'dia', label: 'Diastolic', num: true, render: (r) => r.v.diastolic },
  { key: 'pulse', label: 'Pulse', num: true, render: (r) => r.v.pulse ?? '—' },
  { key: 'status', label: 'Status', render: (r) => {
    const s = bpStatus(r.v.systolic, r.v.diastolic)
    return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONE_BG[s.tone])}>{s.label}</span>
  } },
  { key: 'dsys', label: 'Δ Sys', num: true, render: (r) => (r.dSys === undefined ? <span className="text-muted-foreground">—</span> : <Delta v={r.dSys} lowerBetter />) },
  { key: 'notes', label: 'Notes', render: (r) => r.v.notes || '—' },
]

const SYM_COLS: Col<Symptom>[] = [
  { key: 'date', label: 'Date', render: (r) => format(parseISO(r.recordedAt), 'MMM d, yyyy') },
  { key: 'time', label: 'Time', render: (r) => format(parseISO(r.recordedAt), 'HH:mm') },
  ...ALL_SYMPTOMS.map((def): Col<Symptom> => ({
    key: def.key as string,
    label: def.label,
    num: true,
    render: (r) => symptomCell(r[def.key], def.direction),
  })),
  { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
]

const LAB_COLS: Col<LabExam>[] = [
  { key: 'date', label: 'Date', render: (r) => (r.collectedAt ? format(parseISO(r.collectedAt), 'MMM d, yyyy') : '—') },
  { key: 'name', label: 'Panel', render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'lab', label: 'Lab', render: (r) => r.labName ?? '—' },
  { key: 'type', label: 'Type', defaultHidden: true, render: (r) => r.examType ?? '—' },
  { key: 'notes', label: 'Notes', defaultHidden: true, render: (r) => r.notes || '—' },
]

type FileRow = { id?: number; name: string; addedAt: string; status: string }
const FILE_COLS: Col<FileRow>[] = [
  { key: 'date', label: 'Added', render: (r) => format(parseISO(r.addedAt), 'MMM d, yyyy HH:mm') },
  { key: 'name', label: 'File', render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'status', label: 'Status', render: (r) => r.status },
]

// ── The "All" feed: one structured row per entry, newest first ───────────────

function TimelineFeed({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
  const now = new Date()
  return (
    <FeedList>
      {events.map((e) => (
        <FeedRow key={e.id} icon={e.icon} title={e.title} when={whenLabel(e.date, now)} sub={e.sub} status={e.status} note={e.note} clampNote facts={e.facts} />
      ))}
    </FeedList>
  )
}

// One symptom check-in, summarised: the first few ratings and what to watch.
function symptomSummary(s: Symptom): { rated: number; first: string[]; watch: string[]; good: number } {
  const first: string[] = []
  const watch: string[] = []
  let rated = 0
  let good = 0
  for (const def of ALL_SYMPTOMS) {
    const v = s[def.key]
    if (typeof v !== 'number') continue
    rated += 1
    if (first.length < 3) first.push(`${def.label} ${v}`)
    const t = chipTone(v, def.direction)
    if (t === 'good') good += 1
    else if (t === 'bad' || t === 'warn') watch.push(def.label)
  }
  return { rated, first, watch, good }
}

export function Timeline({
  compounds, injections, vitals, exams, files, bodyMetrics,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  files: Array<{ id?: number; addedAt: string; name: string; status: string }>
  bodyMetrics: BodyMetric[]
}) {
  const symptoms = useLiveQuery(() => db.symptoms.filter((s) => !s.archivedAt).toArray(), [], [])
  // Lab results, so each panel row can say how many markers it holds and how
  // many sit outside the lab's range.
  const results = useLiveQuery(() => db.results.filter((r) => !r.archivedAt).toArray(), [], [])
  const examStats = useMemo(() => {
    const m = new Map<number, { n: number; ranged: number; flagged: number }>()
    for (const r of results) {
      const s = m.get(r.examId) ?? { n: 0, ranged: 0, flagged: 0 }
      s.n += 1
      if (r.value !== undefined && (r.low !== undefined || r.high !== undefined)) {
        s.ranged += 1
        if ((r.low !== undefined && r.value < r.low) || (r.high !== undefined && r.value > r.high)) s.flagged += 1
      }
      m.set(r.examId, s)
    }
    return m
  }, [results])

  // Archiving an entry (never a delete) with an Undo toast. Restore is symmetric.
  const undo = useUndoableDelete()
  const archiveOne = (table: 'injections' | 'vitals' | 'bodyMetrics' | 'symptoms', id?: number) => {
    if (id == null) return
    void undo({ label: 'Archived', remove: () => archiveRow(table, id), restore: () => restoreRow(table, id) })
  }
  const archiveExamEntry = (id?: number) => {
    if (id == null) return
    void undo({ label: 'Archived', remove: () => setExamArchived(id, true), restore: () => setExamArchived(id, false) })
  }
  const archiveFileEntry = (id?: number) => {
    if (id == null) return
    void undo({ label: 'Archived', remove: () => setFileArchived(id, true), restore: () => setFileArchived(id, false) })
  }

  const [activeType, setActiveType] = useState<EventType | null>(null)
  const [activeCompoundId, setActiveCompoundId] = useState<number | null>(null)

  const compoundMap = useMemo(() => new Map(compounds.map((c) => [c.id, c])), [compounds])
  const now = Date.now()

  // Deduped files (keep newest per filename), newest first.
  const fileRows = useMemo<FileRow[]>(() => {
    const map = new Map<string, FileRow>()
    for (const f of files) {
      const existing = map.get(f.name)
      if (!existing || f.addedAt > existing.addedAt) map.set(f.name, f)
    }
    return [...map.values()].sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }, [files])

  // ── Per-type detailed rows ──
  const injRows = useMemo<InjRow[]>(() => {
    return injections
      .filter((i) => (activeCompoundId == null ? true : i.compoundId === activeCompoundId))
      .map((i) => {
        const c = compoundMap.get(i.compoundId)
        return { key: `i-${i.id}`, inj: i, name: c?.name ?? 'Injection', color: c?.color ?? 'var(--primary)' }
      })
  }, [injections, compoundMap, activeCompoundId])

  const weightRows = useMemo<WeightRow[]>(() => {
    const pts = bodyMetrics
      .filter((b) => b.weightKg !== undefined)
      .map((b) => ({ id: b.id, at: b.measuredAt, kg: b.weightKg as number, source: b.source, notes: b.notes }))
      .sort((a, b) => a.at.localeCompare(b.at))
    const withDelta = pts.map((p, i) => ({ key: `w-${p.id}`, id: p.id!, at: p.at, kg: p.kg, source: p.source, notes: p.notes, delta: i > 0 ? p.kg - pts[i - 1].kg : undefined }))
    return withDelta.reverse()
  }, [bodyMetrics])

  const bpRows = useMemo<BpRow[]>(() => {
    const sorted = [...vitals].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    const withDelta = sorted.map((v, i) => ({ key: `v-${v.id}`, v, dSys: i > 0 ? v.systolic - sorted[i - 1].systolic : undefined }))
    return withDelta.reverse()
  }, [vitals])

  const symRows = useMemo<Symptom[]>(
    () => [...symptoms].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [symptoms],
  )
  const labRows = useMemo<LabExam[]>(
    () => [...exams].sort((a, b) => (b.collectedAt ?? '').localeCompare(a.collectedAt ?? '')),
    [exams],
  )

  // ── "All" overview events + tab counts ──
  const events = useMemo<TimelineEvent[]>(() => {
    const facts = (...xs: Array<string | undefined | false>) => xs.filter((x): x is string => typeof x === 'string' && x.length > 0)
    return [
      ...injections.map((i): TimelineEvent => {
        const name = compoundMap.get(i.compoundId)?.name ?? 'Injection'
        const dose = i.rawDose ?? (i.dose != null ? `${i.dose} ${i.unit}` : undefined)
        return {
          id: `i-${i.id}`,
          date: parseISO(i.takenAt),
          icon: Syringe,
          title: dose ? `${name} · ${dose}` : name,
          sub: facts(i.site, i.route).join(' · ') || undefined,
          status: LOGGED,
          note: i.notes || undefined,
          facts: facts(dose, i.site, i.route, i.weightKg ? `${i.weightKg} kg` : undefined),
          type: 'injection',
          compoundId: i.compoundId,
        }
      }),
      ...weightRows.map((w): TimelineEvent => {
        const moved = w.delta !== undefined && Math.abs(w.delta) >= 0.05
        return {
          id: w.key,
          date: parseISO(w.at),
          icon: Scale,
          title: `Weight ${w.kg} kg`,
          sub: w.delta === undefined ? 'first entry' : moved ? `${arrow(w.delta, 1, 'kg')} vs last` : 'no change vs last',
          status: LOGGED,
          note: w.notes || undefined,
          facts: facts(`${w.kg} kg`, moved ? arrow(w.delta!, 1) : undefined, w.source !== 'manual' ? SOURCE_LABEL[w.source] ?? w.source : undefined),
          type: 'weight',
        }
      }),
      ...vitals.map((v): TimelineEvent => {
        const status = bpFeedStatus(v.systolic, v.diastolic)
        return {
          id: `v-${v.id}`,
          date: parseISO(v.measuredAt),
          icon: HeartPulse,
          title: `Blood pressure ${v.systolic}/${v.diastolic}`,
          sub: facts(v.pulse ? `pulse ${v.pulse}` : undefined, bpStatus(v.systolic, v.diastolic).label.toLowerCase()).join(' · '),
          status,
          note: v.notes || undefined,
          facts: facts(String(v.systolic), String(v.diastolic), v.pulse ? `${v.pulse} bpm` : undefined),
          type: 'bp',
        }
      }),
      ...exams.map((e): TimelineEvent => {
        const s = examStats.get(e.id!) ?? { n: 0, ranged: 0, flagged: 0 }
        const markers = `${s.n} marker${s.n === 1 ? '' : 's'}`
        const status: Status = s.flagged > 0
          ? { label: `${s.flagged} flagged`, tone: 'bad', icon: TriangleAlert }
          : s.ranged > 0 ? { label: 'In range', tone: 'good', icon: CircleCheck } : LOGGED
        return {
          id: `e-${e.id}`,
          date: parseISO(e.collectedAt),
          icon: FlaskConical,
          title: e.name,
          sub: facts(e.labName ?? 'Lab panel', s.n > 0 ? markers : undefined).join(' · '),
          status,
          note: e.notes || undefined,
          facts: facts(s.n > 0 ? markers : undefined, s.flagged > 0 ? `${s.flagged} out of range` : s.ranged > 0 ? 'all in range' : undefined, e.examType),
          type: 'lab',
        }
      }),
      ...fileRows.map((f): TimelineEvent => ({
        id: `f-${f.id ?? f.name}-${f.addedAt}`,
        date: parseISO(f.addedAt),
        icon: FileText,
        title: f.name,
        sub: f.status,
        status: f.status === 'Needs review' ? { label: 'Review', tone: 'accent', icon: Eye } : LOGGED,
        facts: facts(f.status),
        type: 'file',
      })),
      ...symptoms.map((s): TimelineEvent => {
        const sum = symptomSummary(s)
        const status: Status = sum.watch.length > 0
          ? { label: `${sum.watch.length} to watch`, tone: 'warn', icon: Clock }
          : sum.good > 0 ? { label: 'Feeling good', tone: 'good', icon: CircleCheck } : LOGGED
        return {
          id: `s-${s.id}`,
          date: parseISO(s.recordedAt),
          icon: Brain,
          title: 'Symptom check-in',
          sub: sum.first.join(' · ') || undefined,
          status,
          note: s.notes || undefined,
          facts: facts(`${sum.rated} rated`, ...sum.watch.slice(0, 2)),
          type: 'symptom',
        }
      }),
    ]
      .filter((e) => e.date.getTime() <= now)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [injections, vitals, exams, examStats, fileRows, symptoms, compoundMap, weightRows, now])

  const counts = useMemo<Record<EventType, number>>(() => ({
    injection: injections.length,
    weight: weightRows.length,
    bp: vitals.length,
    lab: exams.length,
    file: fileRows.length,
    symptom: symptoms.length,
  }), [injections, weightRows, vitals, exams, fileRows, symptoms])

  // Compounds that actually appear in the injection log (for the sub-filter).
  const injectionCompounds = useMemo(() => {
    const seen = new Set<number>()
    const out: Compound[] = []
    for (const i of injections) {
      if (i.compoundId !== undefined && !seen.has(i.compoundId)) {
        seen.add(i.compoundId)
        const c = compoundMap.get(i.compoundId)
        if (c) out.push(c)
      }
    }
    return out
  }, [injections, compoundMap])

  function selectTab(t: EventType | null) {
    setActiveType(t)
    setActiveCompoundId(null)
  }

  const tabs: Array<{ id: EventType | null; label: string; count: number }> = [
    { id: null, label: 'All', count: events.length },
    ...((Object.keys(TYPE_LABELS) as EventType[])
      .filter((t) => counts[t] > 0)
      .map((t) => ({ id: t, label: TYPE_LABELS[t], count: counts[t] }))),
  ]

  return (
    <PanelCard
      subtitle="Everything you've logged"
      title="Timeline"
    >
      {/* Type tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const Icon = tab.id ? TYPE_ICONS[tab.id] : null
          const active = activeType === tab.id
          return (
            <button
              key={tab.id ?? 'all'}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {Icon && <Icon className="size-3" />}
              {tab.label}
              <span className={cn(
                'rounded-full px-1.5 text-xs font-bold leading-4 tabular-nums',
                active ? 'bg-background/20 text-background' : 'bg-secondary text-muted-foreground',
              )}>{tab.count}</span>
            </button>
          )
        })}
      </div>

      {/* Injection compound sub-filter */}
      {activeType === 'injection' && injectionCompounds.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Compound:</span>
          {injectionCompounds.map((c) => {
            const on = activeCompoundId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCompoundId(on ? null : c.id!)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  on ? 'border-foreground bg-accent text-foreground' : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.color ?? 'var(--primary)' }} />
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      {activeType === null && <TimelineFeed events={events} />}
      {activeType === 'injection' && <DataGrid columns={INJ_COLS} rows={injRows} rowKey={(r) => r.key} storageKey="apollo-tl-cols-injection" empty="No injections logged." onArchive={(r) => archiveOne('injections', r.inj.id)} />}
      {activeType === 'weight' && <DataGrid columns={WEIGHT_COLS} rows={weightRows} rowKey={(r) => r.key} storageKey="apollo-tl-cols-weight" empty="No weight entries yet." onArchive={(r) => archiveOne('bodyMetrics', r.id)} />}
      {activeType === 'bp' && <DataGrid columns={BP_COLS} rows={bpRows} rowKey={(r) => r.key} storageKey="apollo-tl-cols-bp" empty="No blood pressure readings yet." onArchive={(r) => archiveOne('vitals', r.v.id)} />}
      {activeType === 'symptom' && <DataGrid columns={SYM_COLS} rows={symRows} rowKey={(r) => r.id ?? r.recordedAt} storageKey="apollo-tl-cols-symptom" empty="No symptom check-ins yet." onArchive={(r) => archiveOne('symptoms', r.id)} />}
      {activeType === 'lab' && <DataGrid columns={LAB_COLS} rows={labRows} rowKey={(r) => r.id ?? r.name} storageKey="apollo-tl-cols-lab" empty="No lab panels yet." onArchive={(r) => archiveExamEntry(r.id)} />}
      {activeType === 'file' && <DataGrid columns={FILE_COLS} rows={fileRows} rowKey={(r) => r.id ?? r.name} storageKey="apollo-tl-cols-file" empty="No files yet." onArchive={(r) => archiveFileEntry(r.id)} />}
    </PanelCard>
  )
}
