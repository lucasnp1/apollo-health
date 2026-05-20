import { useMemo } from 'react'
import { Brain, FileText, FlaskConical, HeartPulse, Syringe } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'

type TimelineEvent = {
  id: string
  date: Date
  icon: LucideIcon
  title: string
  detail: string
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

  const events = useMemo<TimelineEvent[]>(() => {
    const compoundMap = new Map(compounds.map((c) => [c.id, c]))
    const now = Date.now()
    return [
      ...injections.map((i) => ({
        id: `i-${i.id}`,
        date: parseISO(i.takenAt),
        future: false,
        icon: Syringe,
        title: compoundMap.get(i.compoundId)?.name ?? 'Injection',
        detail: i.rawDose ?? `${i.dose ?? ''} ${i.unit}`,
      })),
      ...vitals.map((v) => ({
        id: `v-${v.id}`,
        date: parseISO(v.measuredAt),
        future: false,
        icon: HeartPulse,
        title: 'Blood pressure',
        detail: `${v.systolic}/${v.diastolic}`,
      })),
      ...exams.map((e) => ({
        id: `e-${e.id}`,
        date: parseISO(e.collectedAt),
        future: false,
        icon: FlaskConical,
        title: e.name,
        detail: 'Lab exam',
      })),
      ...files.map((f) => ({
        id: `f-${f.id}`,
        date: parseISO(f.addedAt),
        future: false,
        icon: FileText,
        title: f.name,
        detail: f.status,
      })),
      ...symptoms.map((s) => ({
        id: `s-${s.id}`,
        date: parseISO(s.recordedAt),
        future: false,
        icon: Brain,
        title: 'Symptom log',
        detail: `Mood ${s.mood ?? '—'} · Energy ${s.energy ?? '—'}`,
      })),
    ]
      .filter((e) => e.date.getTime() <= now)        // history only — no future events
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [injections, vitals, exams, files, symptoms, compounds])

  return (
    <section className="surface">
      <div className="panel-header">
        <div>
          <span className="section-label">All activity</span>
          <h3>Timeline</h3>
        </div>
      </div>
      <div className="timeline-list">
        {events.map((e) => (
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
    </section>
  )
}
