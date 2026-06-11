import { useMemo, useState } from 'react'
import { useTheme } from '../lib/useTheme'
import { Brain, Plus, Trash2 } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Symptom } from '../lib/db'
import { EmptyState } from '../components/EmptyState'
import { useUndoableDelete } from '../lib/useUndoableDelete'

// Symptoms come in two flavours that need to render differently in the
// check-in: positive symptoms (high = good — e.g. mood, energy) and
// negative symptoms (high = bad — e.g. headache, joint pain). The
// scale chips use the same 1-5 control but the color logic differs.
type Direction = 'positive' | 'negative'

type SymptomDef = {
  key: keyof Symptom
  label: string
  direction: Direction
}

const POSITIVE: SymptomDef[] = [
  { key: 'mood',   label: 'Mood',   direction: 'positive' },
  { key: 'energy', label: 'Energy', direction: 'positive' },
  { key: 'sleep',  label: 'Sleep',  direction: 'positive' },
  { key: 'libido', label: 'Libido', direction: 'positive' },
]

const NEGATIVE: SymptomDef[] = [
  { key: 'waterRetention',    label: 'Water retention',    direction: 'negative' },
  { key: 'acne',              label: 'Acne',               direction: 'negative' },
  { key: 'nippleSensitivity', label: 'Nipple sensitivity', direction: 'negative' },
  { key: 'jointPain',         label: 'Joint pain',         direction: 'negative' },
  { key: 'headache',          label: 'Headache',           direction: 'negative' },
]

// Tone for a chip given the symptom direction + selected value.
// Positive symptoms: value 4-5 reads as good, 1-2 as bad.
// Negative symptoms: value 4-5 reads as bad, 1-2 as fine.
// Value 3 stays neutral (the "no opinion" middle).
function chipTone(value: number, direction: Direction): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === 3) return 'neutral'
  if (direction === 'positive') {
    if (value >= 4) return 'good'
    return 'bad'
  } else {
    if (value >= 4) return 'bad'
    if (value <= 2) return 'good'
    return 'warn'
  }
}

function todayIsoLocal(): string {
  // Trim seconds + tz so the value fits a datetime-local input.
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function Symptoms() {
  const { chart: colors } = useTheme()
  const symptoms = useLiveQuery(() => db.symptoms.orderBy('recordedAt').reverse().toArray(), [], [])
  const deleteWithUndo = useUndoableDelete()
  const [draft, setDraft] = useState<Partial<Symptom>>({ recordedAt: todayIsoLocal() })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft.recordedAt || saving) return
    setSaving(true)
    try {
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
      setDraft({ recordedAt: todayIsoLocal() })
    } finally {
      setSaving(false)
    }
  }

  const hasAnyValue = useMemo(
    () =>
      [...POSITIVE, ...NEGATIVE].some((s) => typeof draft[s.key] === 'number') ||
      Boolean(draft.notes?.trim()),
    [draft],
  )

  const chartData = useMemo(
    () =>
      symptoms
        .slice()
        .reverse()
        .slice(-30)
        .map((s) => ({
          date: format(parseISO(s.recordedAt), 'MMM d'),
          mood: s.mood,
          energy: s.energy,
          sleep: s.sleep,
          libido: s.libido,
        })),
    [symptoms],
  )

  return (
    <div className="content-grid">
      {/* ── Today's check-in ───────────────────────────────────────────── */}
      <section className="surface col-12 symptom-checkin">
        <div className="panel-header">
          <div>
            <span className="section-label">Today</span>
            <h3>How are you feeling?</h3>
          </div>
          <input
            type="datetime-local"
            className="symptom-when"
            value={draft.recordedAt}
            onChange={(e) => setDraft({ ...draft, recordedAt: e.target.value })}
            aria-label="When"
          />
        </div>

        <div className="symptom-group-label">Positive — higher is better</div>
        <div className="symptom-rows">
          {POSITIVE.map((s) => (
            <SymptomScale
              key={s.key as string}
              def={s}
              value={draft[s.key] as number | undefined}
              onChange={(v) => setDraft({ ...draft, [s.key]: v })}
            />
          ))}
        </div>

        <div className="symptom-group-label">Side effects — higher is worse</div>
        <div className="symptom-rows">
          {NEGATIVE.map((s) => (
            <SymptomScale
              key={s.key as string}
              def={s}
              value={draft[s.key] as number | undefined}
              onChange={(v) => setDraft({ ...draft, [s.key]: v })}
            />
          ))}
        </div>

        <label className="symptom-notes">
          <span>Notes (optional)</span>
          <textarea
            rows={2}
            placeholder="What's affecting these today?"
            value={draft.notes ?? ''}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>

        <div className="symptom-actions">
          <button
            type="button"
            className="primary-button"
            onClick={save}
            disabled={!hasAnyValue || saving}
          >
            <Plus size={14} /> {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
      </section>

      {/* ── Trend ──────────────────────────────────────────────────────── */}
      <section className="surface col-7">
        <div className="panel-header">
          <div>
            <span className="section-label">Trend</span>
            <h3>Core scores (last 30)</h3>
          </div>
        </div>
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 11 }} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 10, color: colors.tooltipText, boxShadow: '0 8px 24px rgba(26,22,16,0.15)' }} />
              <Line type="monotone" dataKey="mood"   stroke="#1a1611" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="energy" stroke="#c5821e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sleep"  stroke="#2566c4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="libido" stroke="#9b4ec2" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={Brain} title="Need a few entries" detail="Log at least two days to see a trend." />
        )}
        <div className="symptom-legend">
          <LegendDot color="#1a1611" label="Mood" />
          <LegendDot color="#c5821e" label="Energy" />
          <LegendDot color="#2566c4" label="Sleep" />
          <LegendDot color="#9b4ec2" label="Libido" />
        </div>
      </section>

      {/* ── Recent entries ─────────────────────────────────────────────── */}
      <section className="surface col-5">
        <div className="panel-header">
          <div>
            <span className="section-label">History</span>
            <h3>Recent check-ins</h3>
          </div>
        </div>
        {symptoms.length === 0 ? (
          <EmptyState icon={Brain} title="No check-ins yet" detail="Log how you feel above to start building a trend." />
        ) : (
          <ul className="symptom-history">
            {symptoms.slice(0, 8).map((s) => (
              <li key={s.id}>
                <div className="symptom-history-head">
                  <strong>{format(parseISO(s.recordedAt), 'EEE MMM d')}</strong>
                  <span>{formatDistanceToNow(parseISO(s.recordedAt), { addSuffix: true })}</span>
                </div>
                <div className="symptom-history-chips">
                  {(['mood', 'energy', 'sleep', 'libido'] as const).map((k) => {
                    const v = s[k]
                    if (typeof v !== 'number') return null
                    return (
                      <span key={k} className={`symptom-history-chip tone-${chipTone(v, 'positive')}`}>
                        {k[0].toUpperCase() + k.slice(1)} {v}
                      </span>
                    )
                  })}
                </div>
                {s.notes && <p className="symptom-history-notes">{s.notes}</p>}
                <button
                  type="button"
                  className="icon-button danger symptom-history-delete"
                  aria-label="Delete check-in"
                  onClick={() => {
                    const snapshot = { ...s }
                    void deleteWithUndo({
                      label: 'Check-in deleted',
                      remove: () => db.symptoms.delete(s.id!),
                      restore: () => db.symptoms.put(snapshot),
                    })
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SymptomScale({
  def,
  value,
  onChange,
}: {
  def: SymptomDef
  value: number | undefined
  onChange: (v: number) => void
}) {
  return (
    <div className="symptom-scale">
      <span className="symptom-scale-label">{def.label}</span>
      <div className="symptom-scale-chips" role="radiogroup" aria-label={def.label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n
          const tone = selected ? chipTone(n, def.direction) : 'neutral'
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? `symptom-chip selected tone-${tone}` : 'symptom-chip'}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="symptom-legend-item">
      <span style={{ background: color }} />
      {label}
    </span>
  )
}
