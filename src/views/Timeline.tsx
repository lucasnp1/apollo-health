import { useMemo, useState } from 'react'
import { Brain, FileText, FlaskConical, HeartPulse, Syringe } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'

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
    <section className="surface" style={{ maxWidth: '100%' }}>
      <div className="panel-header">
        <div>
          <span className="section-label">All activity</span>
          <h3>Timeline</h3>
        </div>
        {activeType && (
          <button type="button" className="ghost-button" style={{ fontSize: 12 }} onClick={() => { setActiveType(null); setActiveCompoundId(null) }}>
            Clear filter
          </button>
        )}
      </div>

      {/* Type filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {(Object.keys(TYPE_LABELS) as EventType[]).filter((t) => counts[t] > 0).map((t) => {
          const Icon = TYPE_ICONS[t]
          const active = activeType === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--ink-dim)',
                cursor: 'pointer', transition: 'all 150ms',
              }}
            >
              <Icon size={11} />
              {TYPE_LABELS[t]}
              <span style={{
                background: active ? 'var(--accent)' : 'var(--line)',
                color: active ? '#fff' : 'var(--ink-mute)',
                borderRadius: 999, padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
              }}>{counts[t]}</span>
            </button>
          )
        })}
      </div>

      {/* Compound sub-filter (only when Injections active + multiple compounds) */}
      {activeType === 'injection' && injectionCompounds.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-mute)', alignSelf: 'center', marginRight: 2 }}>Compound:</span>
          {injectionCompounds.map((c) => {
            const active = activeCompoundId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCompoundId(active ? null : c.id!)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 999, fontSize: 11,
                  border: `1px solid ${active ? c.color ?? 'var(--accent)' : 'var(--line)'}`,
                  background: active ? (c.color ?? 'var(--accent)') + '18' : 'transparent',
                  color: active ? (c.color ?? 'var(--accent-ink)') : 'var(--ink-dim)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color ?? 'var(--accent)', flexShrink: 0 }} />
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="panel-note">No events match the current filter.</p>
      ) : (
        <div className="timeline-list">
          {filtered.map((e) => (
            <div className="timeline-item" key={e.id}>
              <div className="timeline-icon">
                <e.icon size={14} />
              </div>
              <div>
                <strong>{e.title}</strong>
                <span>{e.detail}</span>
              </div>
              <time>{format(e.date, 'MMM d, yyyy HH:mm')}</time>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
