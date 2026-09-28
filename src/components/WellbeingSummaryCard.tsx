// "What keeps coming up": the Wellbeing summary as its own card, high on
// Home. It sits under the three at-a-glance tiles because it is the one piece
// of Home that interprets rather than shows: the tiles say where you are, this
// says what keeps happening and what it is often linked to, and the charts
// below are the detail. Nothing to summarize, nothing rendered; nothing that
// stood out, one quiet line.

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type Symptom, type VitalLog } from '../lib/db'
import { canonicalize } from '../lib/markers'
import { ALL_SYMPTOMS, customDefs } from '../lib/symptoms'
import { times, wellbeingSummary, type Insight, type LabPoint } from '../lib/wellbeingSummary'
import { CAUSES } from '../lib/wellbeingCauses'
import { ChartCard } from './dashboard/ChartCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Marker keys the cause map can cite; only these are read from the labs.
const CITED = new Set(Object.values(CAUSES).flatMap((r) => r.markers))
const DAY = 86_400_000
const STEP = 2

export function WellbeingSummaryCard({
  symptoms, vitals, injections, compounds,
}: {
  symptoms: Symptom[]
  vitals: VitalLog[]
  injections: InjectionLog[]
  compounds: Compound[]
}) {
  const [all, setAll] = useState(false)
  // Custom symptoms are whatever the user has ever rated (see symptoms.ts).
  const allDefs = useMemo(() => [...ALL_SYMPTOMS, ...customDefs(symptoms)], [symptoms])

  // Latest result per cited marker, for "your last estradiol was ..." evidence.
  // Personal targets win over the lab's range, as on the Labs page, so the two
  // never disagree about the same result.
  const labs = useLiveQuery(async () => {
    const [results, exams, targets] = await Promise.all([
      // isFinite also drops NaN ("4,5" typed on a comma keypad) and nulls from old backups.
      db.results.filter((r) => !r.deletedAtSync && !r.archivedAt && Number.isFinite(r.value)).toArray(),
      db.exams.filter((e) => !e.deletedAtSync && !e.archivedAt).toArray(),
      db.markerTargets.toArray(),
    ])
    const at = new Map(exams.map((e) => [e.id, e.collectedAt]))
    const target = new Map(targets.map((t) => [t.marker, t]))
    const out: Record<string, LabPoint> = {}
    for (const r of results) {
      const meta = canonicalize(r.marker)
      const when = at.get(r.examId)
      if (!meta || !when || !CITED.has(meta.key)) continue
      if (out[meta.key] && out[meta.key].at >= when) continue
      const t = target.get(meta.key)
      out[meta.key] = { label: meta.label, value: r.value!, raw: r.rawValue, unit: r.unit, low: t?.low ?? r.low, high: t?.high ?? r.high, at: when }
    }
    return out
  }, [], {} as Record<string, LabPoint>)

  // "This week" is counted from this clock. It moves on whenever the app comes
  // back into view, so a PWA left open on Home for days does not go stale.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') setNow(Date.now()) }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])
  const summary = useMemo(() => {
    const bpRecent = vitals.filter((v) => now - Date.parse(v.measuredAt) < 14 * DAY)
    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
    const names = new Map(compounds.map((c) => [c.id, c.name]))
    const recentCompounds = [...new Set(injections
      .filter((i) => now - Date.parse(i.takenAt) < 21 * DAY)
      .map((i) => names.get(i.compoundId))
      .filter((n): n is string => !!n))]
    return wellbeingSummary(symptoms, allDefs, CAUSES, {
      labs,
      bp: bpRecent.length ? { sys: avg(bpRecent.map((v) => v.systolic)), dia: avg(bpRecent.map((v) => v.diastolic)), n: bpRecent.length } : undefined,
      recentCompounds,
    }, now)
  }, [symptoms, allDefs, labs, vitals, injections, compounds, now])

  if (summary.checkIns === 0) return null
  const { checkIns, insights } = summary
  const counted = `${checkIns} check-in${checkIns === 1 ? '' : 's'}`

  if (insights.length === 0) {
    return (
      <div className="reveal flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5 shadow-[var(--shadow-card)]">
        <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        <p className="text-sm">
          {/* Says what it is about: under the three tiles it must not read as a
              verdict on pressure and weight too. */}
          <span className="font-medium">Nothing stood out in how you&apos;ve felt</span>{' '}
          <span className="text-muted-foreground">{checkIns === 1 ? 'in your last check-in' : `over your last ${counted}`}.</span>
        </p>
      </div>
    )
  }

  const list = all ? insights : insights.slice(0, STEP)
  return (
    <ChartCard title="What keeps coming up" subtitle={`Last 30 days · ${counted}`}>
      <ul className="-mt-1 flex flex-col gap-2">
        {list.map((ins) => <InsightRow key={ins.keys.join()} insight={ins} />)}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-muted-foreground">Patterns from your check-ins, not a diagnosis.</p>
        {insights.length > STEP && (
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? 'Show less' : `Show ${insights.length - STEP} more`}
          </Button>
        )}
      </div>
    </ChartCard>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const { title, week, month, tone, mild, causes } = insight
  const [open, setOpen] = useState(false)
  const when = `${week > 0 ? `${times(week)} this week and ${times(month)} this month` : `${times(month)} this month, not this week`}${mild ? ', all mild' : ''}.`
  // Every cause line names its own symptom, so grouped lines read on their own.
  // Collapsed shows the first; the rest, the user's numbers and the guides open on tap.
  const lines = [...new Set(causes.map((c) => c.line))]
  const evidence = causes.flatMap((c) => c.evidence)
  const guides = [...new Set(causes.map((c) => c.guide).filter((g): g is string => !!g))]
  const more = lines.length > 1 || evidence.length > 0 || guides.length > 0
  const head = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">
          <span className="font-medium text-foreground">{title}</span>{' '}
          <span className="text-muted-foreground">{when}</span>
        </span>
        {lines[0] && <span className={cn('mt-1 block text-sm text-foreground/85', !open && 'line-clamp-2')}>{lines[0]}</span>}
      </span>
      {more && (open
        ? <ChevronUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        : <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />)}
    </>
  )
  const headCls = 'flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left'
  return (
    <li className={cn('rounded-lg border-l-2 bg-muted/40', tone === 'bad' ? 'border-l-destructive' : 'border-l-amber-500')}>
      {more ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(headCls, 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')}
        >
          {head}
        </button>
      ) : (
        <div className={headCls}>{head}</div>
      )}
      {open && (
        <div className="flex flex-col gap-1 px-3 pb-3">
          {lines.slice(1).map((l) => <p key={l} className="text-sm text-foreground/85">{l}</p>)}
          {evidence.map((e) => <p key={e} className="text-xs text-muted-foreground">{e}</p>)}
          {guides.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {guides.map((g) => (
                <a key={g} href={`/guides/${g}`} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent-ink)] underline-offset-2 hover:underline">
                  {guideTitle(g)} <ArrowUpRight className="size-3" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

const guideTitle = (slug: string) =>
  ({ 'hematocrit-on-trt-what-to-do': 'High hematocrit', 'estradiol-on-trt-without-an-ai': 'Estradiol without an AI', 'peptides-mk-677-blood-sugar': 'MK-677 and blood sugar' } as Record<string, string>)[slug]
  ?? `${slug.split('-').map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ').replace(/^(Tsh|Dht|Psa|Lh|Fsh|Igf1|Crp|Shbg)\b/, (m) => m.toUpperCase())} guide`
