import { useState } from 'react'
import { Brain, Plus, Trash2 } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Symptom } from '../lib/db'
import { EmptyState } from '../components/EmptyState'

const SLIDERS: Array<{ key: keyof Symptom; label: string }> = [
  { key: 'libido', label: 'Libido' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'mood', label: 'Mood' },
  { key: 'energy', label: 'Energy' },
  { key: 'waterRetention', label: 'Water retention' },
  { key: 'acne', label: 'Acne' },
  { key: 'nippleSensitivity', label: 'Nipple sensitivity' },
  { key: 'jointPain', label: 'Joint pain' },
  { key: 'headache', label: 'Headache' },
]

export function Symptoms() {
  const symptoms = useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().toArray(), [], [])
  const [draft, setDraft] = useState<Partial<Symptom>>({ recordedAt: new Date().toISOString().slice(0, 16) })

  async function save() {
    if (!draft.recordedAt) return
    await db.symptoms.add({
      recordedAt: new Date(draft.recordedAt).toISOString(),
      libido: draft.libido,
      sleep: draft.sleep,
      mood: draft.mood,
      energy: draft.energy,
      waterRetention: draft.waterRetention,
      acne: draft.acne,
      nippleSensitivity: draft.nippleSensitivity,
      jointPain: draft.jointPain,
      headache: draft.headache,
      notes: draft.notes,
    })
    setDraft({ recordedAt: new Date().toISOString().slice(0, 16) })
  }

  const chart = symptoms
    .slice()
    .reverse()
    .map((s) => ({
      date: format(parseISO(s.recordedAt), 'MMM d'),
      libido: s.libido,
      sleep: s.sleep,
      mood: s.mood,
      energy: s.energy,
    }))

  return (
    <div className="content-grid">
      <section className="surface col-12">
        <div className="panel-header">
          <div>
            <span className="section-label">Today</span>
            <h3>Log how you feel</h3>
          </div>
          <span className="safety-chip">30 seconds. Subjective.</span>
        </div>
        <div className="symptom-grid">
          {SLIDERS.map(({ key, label }) => (
            <div className="symptom-cell" key={key as string}>
              <label>
                {label}
                <strong>{(draft[key] as number | undefined) ?? '—'}</strong>
              </label>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={(draft[key] as number | undefined) ?? 0}
                onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <div className="form-grid">
          <label>
            When
            <input type="datetime-local" value={draft.recordedAt} onChange={(e) => setDraft({ ...draft, recordedAt: e.target.value })} />
          </label>
          <label className="wide-field">
            Notes
            <textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
          <button type="button" className="primary-button" onClick={save}><Plus size={15} /> Save</button>
        </div>
      </section>

      <section className="surface col-7">
        <div className="panel-header">
          <div>
            <span className="section-label">Trend</span>
            <h3>Core scores</h3>
          </div>
        </div>
        {chart.length > 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chart} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#1f242b" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
              <YAxis domain={[0, 5]} tickLine={false} axisLine={false} tick={{ fill: '#6b7480', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#13171c', border: '1px solid #2a313a', borderRadius: 8, color: '#e6ebf1' }} />
              <Line type="monotone" dataKey="libido" stroke="#c084fc" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sleep" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="mood" stroke="#5eead4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="energy" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={Brain} title="Need a few entries" detail="Log at least two days to see a trend." />
        )}
      </section>

      <section className="surface col-5">
        <div className="panel-header">
          <div>
            <span className="section-label">History</span>
            <h3>Recent</h3>
          </div>
        </div>
        <div className="stack">
          {symptoms.slice(0, 10).map((s) => (
            <div className="row" key={s.id}>
              <Brain size={14} />
              <div>
                <strong>
                  Mood {s.mood ?? '—'} · Energy {s.energy ?? '—'}
                </strong>
                <span className="sub">{s.notes || `Libido ${s.libido ?? '—'} · Sleep ${s.sleep ?? '—'}`}</span>
              </div>
              <time>{format(parseISO(s.recordedAt), 'MMM d')}</time>
              <button type="button" className="icon-button danger" onClick={() => db.symptoms.delete(s.id!)} aria-label="Delete entry">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
