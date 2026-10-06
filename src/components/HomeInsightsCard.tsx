// "What needs a look": the one interpreting card on Home. Bloods, blood
// pressure read against weight/hematocrit/estradiol/dose, blood-letting and
// check-ins in one ranked list, serious first. Check-ins are always a single
// row at the end unless they are strong. The rules live in lib/homeInsights.

import { useEffect, useMemo, useState } from 'react'
import { Brain, CalendarClock, Droplets, FlaskConical, HeartPulse, Lock, type LucideIcon } from 'lucide-react'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '../lib/db'
import { useBloodTests } from '../lib/useBloodTests'
import { usePlan } from '../lib/plan'
import { buildFindings } from '../lib/labFindings'
import { toUnit } from '../lib/labUnits'
import { dayOf, fmtDay } from '../lib/dates'
import { bleedNudge, hctSeries } from '../lib/phlebotomy'
import { ALL_SYMPTOMS, customDefs } from '../lib/symptoms'
import { wellbeingSummary } from '../lib/wellbeingSummary'
import { CAUSES } from '../lib/wellbeingCauses'
import { bleedInsight, bpInsight, doseChange, labInsight, rankInsights, staleInsight, symptomInsight, type HomeInsight } from '../lib/homeInsights'
import { useBleeds } from '../views/bloods/bleedFeed'
import { PhlebotomyDialog } from '../views/bloods/Bleeds'
import type { View } from '../app/views'
import { ChartCard } from './dashboard/ChartCard'
import { FeedList, FeedRow } from './FeedList'
import { Button } from '@/components/ui/button'

const STEP = 4
const KIND_ICON: Record<HomeInsight['kind'], LucideIcon> = { bloods: FlaskConical, bp: HeartPulse, bleed: Droplets, stale: CalendarClock, symptoms: Brain }

export function HomeInsightsCard({ symptoms, vitals, injections, compounds, bodyMetrics, onNavigate }: {
  symptoms: Symptom[]
  vitals: VitalLog[]
  injections: InjectionLog[]
  compounds: Compound[]
  bodyMetrics: BodyMetric[]
  onNavigate: (v: View) => void
}) {
  const { isPro, openUpgrade } = usePlan()
  const tests = useBloodTests()
  const bleeds = useBleeds()
  const [all, setAll] = useState(false)
  const [logging, setLogging] = useState(false)
  // Moves on when the app comes back into view, so a PWA left open on Home does not go stale.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') setNow(Date.now()) }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  const insights = useMemo(() => {
    if (!tests || !bleeds) return undefined
    const today = dayOf(new Date(now).toISOString())
    const latest = tests[0]
    const out: Array<HomeInsight | undefined> = []

    // Bloods: the newest test only, every pairing same-draw.
    let bloodRow = false
    if (latest) {
      const stale = staleInsight(latest, today)
      if (stale) out.push(stale)
      else if (isPro) {
        const findings = buildFindings(latest.markers.map((m) => ({
          id: m.resultId, examId: latest.id, marker: m.printedName, value: m.value, rawValue: m.rawValue, unit: m.unit, low: m.low, high: m.high,
        })), [latest.exam], latest.id)
        for (const f of findings) {
          // Suppressed LH/FSH is expected on a protocol, not something to act on.
          if (f.id === 'hpta' || (f.status !== 'bad' && f.status !== 'warn')) continue
          out.push(labInsight(f, latest, bleeds, today))
          if (f.id === 'blood') bloodRow = true
        }
      } else {
        const flagged = latest.markers.filter((m) => m.labFlag === 'high' || m.labFlag === 'low')
        if (flagged.length) {
          out.push({
            id: 'lab-free', kind: 'bloods', tone: 'warn', chip: 'Pro',
            title: `${flagged.length} result${flagged.length === 1 ? '' : 's'} outside the lab range`,
            sub: `Your ${fmtDay(latest.date)} test`,
            facts: flagged.slice(0, 3).map((m) => ({ text: `${m.label} ${m.rawValue || m.value} ${m.unit}`.trim(), tone: 'warn' as const })),
            why: [],
          })
        }
      }
    }
    const series = hctSeries(tests)
    if (!bloodRow) out.push(bleedInsight(bleedNudge(series, bleeds, today)))

    // Blood pressure, read against weight, hematocrit, estradiol and the dose.
    const weights = [
      ...bodyMetrics.filter((b) => b.weightKg !== undefined).map((b) => ({ at: b.measuredAt, kg: b.weightKg! })),
      ...injections.filter((i) => i.weightKg !== undefined).map((i) => ({ at: i.takenAt, kg: i.weightKg! })),
    ]
    const hct = series[series.length - 1]
    const e2m = latest?.markers.find((m) => m.key === 'estradiol' && m.value !== undefined)
    const pgml = e2m ? toUnit('estradiol', e2m.value!, e2m.unit, 'pg/mL') : undefined
    out.push(bpInsight({
      vitals, weights,
      hct: hct ? { pct: hct.pct, date: hct.date } : undefined,
      e2: pgml !== undefined && latest ? { pgml, date: latest.date } : undefined,
      dose: doseChange(compounds, injections, now),
    }, now))

    // Check-ins: one row.
    const defs = [...ALL_SYMPTOMS, ...customDefs(symptoms)]
    out.push(symptomInsight(wellbeingSummary(symptoms, defs, CAUSES, { labs: {}, recentCompounds: [] }, now)))

    return rankInsights(out.filter((i): i is HomeInsight => !!i))
  }, [tests, bleeds, isPro, vitals, bodyMetrics, injections, compounds, symptoms, now])

  if (!insights) return null
  const hasData = (tests?.length ?? 0) > 0 || vitals.length > 0 || symptoms.length > 0
  if (insights.length === 0) {
    if (!hasData) return null
    return (
      <div className="reveal flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5 shadow-[var(--shadow-card)]">
        <span className="size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-medium">Nothing needs a look right now</span>{' '}
          <span className="text-muted-foreground">across your bloods, pressure, weight and check-ins.</span>
        </p>
      </div>
    )
  }

  const openTest = (id: number) => {
    onNavigate('labs')
    window.location.assign(`#test/${id}`)
  }
  const list = all ? insights : insights.slice(0, STEP)
  return (
    <ChartCard title="What needs a look" subtitle="Your bloods, pressure, weight and check-ins, read together">
      <FeedList className="-mt-2">
        {list.map((ins) => (
          <InsightRow
            key={ins.id}
            insight={ins}
            onOpenTest={ins.testId !== undefined ? () => openTest(ins.testId!) : undefined}
            onLogBleed={ins.logBleed ? () => setLogging(true) : undefined}
            onLocked={ins.id === 'lab-free' ? () => openUpgrade('Bloods read') : undefined}
          />
        ))}
      </FeedList>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-muted-foreground">From your own numbers. Not medical advice.</p>
        {insights.length > STEP && (
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? 'Show less' : `Show ${insights.length - STEP} more`}
          </Button>
        )}
      </div>
      {logging && <PhlebotomyDialog onClose={() => setLogging(false)} />}
    </ChartCard>
  )
}

function InsightRow({ insight: i, onOpenTest, onLogBleed, onLocked }: {
  insight: HomeInsight
  onOpenTest?: () => void
  onLogBleed?: () => void
  onLocked?: () => void
}) {
  const [open, setOpen] = useState(false)
  const more = i.why.length > 0 || !!i.practices?.length || !!onOpenTest || !!onLogBleed
  return (
    <FeedRow
      icon={onLocked ? Lock : i.icon ?? KIND_ICON[i.kind]}
      iconTone={i.tone === 'neutral' ? 'neutral' : i.tone}
      title={i.title}
      sub={i.sub}
      status={{ label: i.chip, tone: i.tone === 'neutral' ? 'neutral' : i.tone }}
      facts={i.facts}
      note={onLocked ? 'Pro reads what they mean together and what people usually do.' : undefined}
      onClick={onLocked ?? (more ? () => setOpen((o) => !o) : undefined)}
      expanded={onLocked || !more ? undefined : open}
    >
      {open && (
        <div className="flex flex-col gap-2 pb-3 pl-14 pr-2">
          {i.why.map((w) => <p key={w} className="feed-note text-foreground/85">{w}</p>)}
          {!!i.causes?.length && (
            <div>
              <p className="eyebrow mt-1">Why it happens on a protocol</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                {i.causes.map((c) => <li key={c} className="text-sm text-muted-foreground">{c}</li>)}
              </ul>
            </div>
          )}
          {!!i.practices?.length && (
            <div>
              <p className="eyebrow mt-1 text-[var(--accent-ink)]">What people usually do · not a recommendation</p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                {i.practices.map((p) => <li key={p} className="text-sm text-muted-foreground">{p}</li>)}
              </ul>
            </div>
          )}
          {(onOpenTest || onLogBleed) && (
            <div className="mt-1 flex flex-wrap gap-2">
              {onLogBleed && <Button size="sm" className="h-9" onClick={onLogBleed}><Droplets className="size-4" /> Log a blood-letting</Button>}
              {onOpenTest && <Button size="sm" variant="outline" className="h-9" onClick={onOpenTest}>Open the test</Button>}
            </div>
          )}
        </div>
      )}
    </FeedRow>
  )
}
