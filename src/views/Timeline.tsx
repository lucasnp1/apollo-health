import { useMemo, useState } from 'react'
import { Brain, FileText, FlaskConical, HeartPulse, Syringe } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, parseISO, startOfDay, startOfWeek, differenceInCalendarDays, isThisWeek, isToday, isYesterday } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'
import { SectionCard } from '../components/Section'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EventType = 'injection' | 'bp' | 'lab' | 'file' | 'symptom'

type TimelineEvent = {
  id: string
  date: Date
  icon: LucideIcon
  title: string
  detail: string
  type: EventType
  compoundId?: number
}

const TYPE_LABELS: Record<EventType, string> = {
  injection: 'Injections',
  bp: 'BP',
  lab: 'Labs',
  file: 'Files',
  symptom: 'Symptoms',
}

const TYPE_ICONS: Record<EventType, LucideIcon> = {
  injection: Syringe,
  bp: HeartPulse,
  lab: FlaskConical,
  file: FileText,
  symptom: Brain,
}

// ── Day/week grouped rendering ──────────────────────────────────────────────

type Group = { label: string; subLabel?: string; events: TimelineEvent[] }

function groupEvents(events: TimelineEvent[]): Group[] {
  const now = new Date()
  const groups = new Map<string, Group>()
  const order: string[] = []

  for (const e of events) {
    const d = startOfDay(e.date)
    const key = d.toISOString()

    if (!groups.has(key)) {
      let label: string
      let subLabel: string | undefined
      const daysAgo = differenceInCalendarDays(now, d)

      if (isToday(d)) {
        label = 'Today'
        subLabel = format(d, 'EEE, MMM d')
      } else if (isYesterday(d)) {
        label = 'Yesterday'
        subLabel = format(d, 'EEE, MMM d')
      } else if (daysAgo < 7) {
        label = format(d, 'EEEE')           // "Monday"
        subLabel = format(d, 'MMM d')
      } else if (isThisWeek(startOfWeek(d))) {
        label = `This week`
        subLabel = format(d, 'MMM d')
      } else {
        // Group by week for older entries
        const weekStart = startOfWeek(d, { weekStartsOn: 1 })
        const weekKey = weekStart.toISOString()
        const weekLabel = `Week of ${format(weekStart, 'MMM d')}`

        if (!groups.has(weekKey)) {
          groups.set(weekKey, { label: weekLabel, events: [] })
          order.push(weekKey)
        }
        groups.get(weekKey)!.events.push(e)
        continue
      }

      groups.set(key, { label, subLabel, events: [] })
      order.push(key)
    }
    groups.get(key)!.events.push(e)
  }

  return order.map(k => groups.get(k)!)
}

function TimelineGrouped({ events }: { events: TimelineEvent[] }) {
  const groups = useMemo(() => groupEvents(events), [events])

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, gi) => (
        <div key={gi}>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-sm font-semibold">{group.label}</span>
            {group.subLabel && (
              <span className="text-xs text-muted-foreground">{group.subLabel}</span>
            )}
          </div>
          <div className="flex flex-col">
            {group.events.map((e, i) => (
              <div key={e.id} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t')}>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                  <e.icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                </div>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{format(e.date, 'HH:mm')}</time>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Timeline({
  compounds,
  injections,
  vitals,
  exams,
  files,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  files: Array<{ id?: number; addedAt: string; name: string; status: string }>
}) {
  const symptoms = useLiveQuery(() => db.symptoms.toArray(), [], [])

  const [activeType, setActiveType] = useState<EventType | null>(null)
  const [activeCompoundId, setActiveCompoundId] = useState<number | null>(null)

  const events = useMemo<TimelineEvent[]>(() => {
    const compoundMap = new Map(compounds.map((c) => [c.id, c]))
    const now = Date.now()

    // Deduplicate files by name — keep the most-recently-added entry per filename
    const dedupedFiles = files.reduce((acc, f) => {
      const existing = acc.get(f.name)
      if (!existing || f.addedAt > existing.addedAt) acc.set(f.name, f)
      return acc
    }, new Map<string, typeof files[number]>())

    return [
      ...injections.map((i) => ({
        id: `i-${i.id}`,
        date: parseISO(i.takenAt),
        icon: Syringe,
        title: compoundMap.get(i.compoundId)?.name ?? 'Injection',
        detail: i.rawDose ?? `${i.dose ?? ''} ${i.unit}${i.site ? ` · ${i.site}` : ''}${i.weightKg ? ` · ${i.weightKg} kg` : ''}`,
        type: 'injection' as EventType,
        compoundId: i.compoundId,
      })),
      ...vitals.map((v) => ({
        id: `v-${v.id}`,
        date: parseISO(v.measuredAt),
        icon: HeartPulse,
        title: 'Blood pressure',
        detail: `${v.systolic}/${v.diastolic}${v.pulse ? ` · ${v.pulse} bpm` : ''}`,
        type: 'bp' as EventType,
      })),
      ...exams.map((e) => ({
        id: `e-${e.id}`,
        date: parseISO(e.collectedAt),
        icon: FlaskConical,
        title: e.name,
        detail: e.labName ?? 'Lab exam',
        type: 'lab' as EventType,
      })),
      ...[...dedupedFiles.values()].map((f) => ({
        id: `f-${f.id ?? f.name}-${f.addedAt}`,
        date: parseISO(f.addedAt),
        icon: FileText,
        title: f.name,
        detail: f.status,
        type: 'file' as EventType,
      })),
      ...symptoms.map((s) => ({
        id: `s-${s.id}`,
        date: parseISO(s.recordedAt),
        icon: Brain,
        title: 'Symptom log',
        detail: `Mood ${s.mood ?? '—'} · Energy ${s.energy ?? '—'}`,
        type: 'symptom' as EventType,
      })),
    ]
      .filter((e) => e.date.getTime() <= now)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [injections, vitals, exams, files, symptoms, compounds])

  // Compounds that actually appear in the timeline
  const injectionCompounds = useMemo(() => {
    const seen = new Set<number>()
    const out: Compound[] = []
    for (const e of events) {
      if (e.type === 'injection' && e.compoundId !== undefined && !seen.has(e.compoundId)) {
        seen.add(e.compoundId)
        const c = compounds.find((c) => c.id === e.compoundId)
        if (c) out.push(c)
      }
    }
    return out
  }, [events, compounds])

  const filtered = useMemo(() => {
    if (!activeType) return events
    return events.filter((e) => {
      if (e.type !== activeType) return false
      if (activeType === 'injection' && activeCompoundId !== null) {
        return e.compoundId === activeCompoundId
      }
      return true
    })
  }, [events, activeType, activeCompoundId])

  // Count per type for badges
  const counts = useMemo(() => {
    const map: Record<EventType, number> = { injection: 0, bp: 0, lab: 0, file: 0, symptom: 0 }
    for (const e of events) map[e.type]++
    return map
  }, [events])

  function toggleType(t: EventType) {
    if (activeType === t) {
      setActiveType(null)
      setActiveCompoundId(null)
    } else {
      setActiveType(t)
      setActiveCompoundId(null)
    }
  }

  return (
    <SectionCard
      eyebrow="All activity"
      title="Timeline"
      action={activeType && (
        <Button variant="ghost" size="sm" onClick={() => { setActiveType(null); setActiveCompoundId(null) }}>
          Clear filter
        </Button>
      )}
    >
      {/* Type filter chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(Object.keys(TYPE_LABELS) as EventType[]).filter((t) => counts[t] > 0).map((t) => {
          const Icon = TYPE_ICONS[t]
          const active = activeType === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="size-3" />
              {TYPE_LABELS[t]}
              <span className={cn(
                'rounded-full px-1.5 text-[10px] font-bold leading-4 tabular-nums',
                active ? 'bg-background/20 text-background' : 'bg-secondary text-muted-foreground',
              )}>{counts[t]}</span>
            </button>
          )
        })}
      </div>

      {/* Compound sub-filter (only when Injections active + multiple compounds) */}
      {activeType === 'injection' && injectionCompounds.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-muted-foreground">Compound:</span>
          {injectionCompounds.map((c) => {
            const active = activeCompoundId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCompoundId(active ? null : c.id!)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  active ? 'border-foreground bg-accent text-foreground' : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.color ?? 'var(--primary)' }} />
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events match the current filter.</p>
      ) : (
        <TimelineGrouped events={filtered} />
      )}
    </SectionCard>
  )
}
