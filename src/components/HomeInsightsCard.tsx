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
import { bleedInsight, bpInsight, countLine, doseChange, labInsight, rankInsights, staleInsight, symptomInsight, type HomeInsight, type Signal } from '../lib/homeInsights'
import { useBleeds } from '../views/bloods/bleedFeed'
import { PhlebotomyDialog } from '../views/bloods/Bleeds'
import type { View } from '../app/views'
import { ChartCard } from './dashboard/ChartCard'
import { FeedChip, FeedList, FeedRow } from './FeedList'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBar, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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
  const [openId, setOpenId] = useState<string>()
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
            sub: `${flagged.slice(0, 2).map((m) => `${m.label} ${m.rawValue || m.value}${m.unit ? ` ${m.unit}` : ''}`).join(', ')} · ${fmtDay(latest.date)} test`,
            signals: [],
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
  const current = insights.find((x) => x.id === openId)
  return (
    <ChartCard title="What needs a look" subtitle={countLine(insights)}>
      <FeedList className="-mt-1">
        {list.map((ins) => (
          <FeedRow
            key={ins.id}
            className="py-3.5"
            icon={ins.id === 'lab-free' ? Lock : ins.icon ?? KIND_ICON[ins.kind]}
            iconTone={ins.tone === 'neutral' ? 'neutral' : ins.tone}
            title={ins.title}
            sub={ins.sub}
            status={{ label: ins.chip, tone: ins.tone === 'neutral' ? 'neutral' : ins.tone }}
            onClick={() => (ins.id === 'lab-free' ? openUpgrade('Bloods read') : setOpenId(ins.id))}
          />
        ))}
      </FeedList>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-[13px] leading-snug text-muted-foreground">Read together from your bloods, pressure, weight and check-ins. Not medical advice.</p>
        {insights.length > STEP && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? 'Show less' : `Show ${insights.length - STEP} more`}
          </Button>
        )}
      </div>
      {current && (
        <InsightSheet
          insight={current}
          onClose={() => setOpenId(undefined)}
          onOpenTest={current.testId !== undefined ? () => { setOpenId(undefined); openTest(current.testId!) } : undefined}
          onLogBleed={current.logBleed ? () => { setOpenId(undefined); setLogging(true) } : undefined}
        />
      )}
      {logging && <PhlebotomyDialog onClose={() => setLogging(false)} />}
    </ChartCard>
  )
}

const DOT: Record<NonNullable<Signal['tone']> | 'none', string> = {
  bad: 'bg-destructive', warn: 'bg-amber-500', good: 'bg-emerald-500', none: 'bg-muted-foreground/40',
}
const VALUE: Record<NonNullable<Signal['tone']> | 'none', string> = {
  bad: 'text-destructive', warn: 'text-amber-700 dark:text-amber-400', good: 'text-emerald-700 dark:text-emerald-400', none: 'text-foreground',
}

/** The detail of one insight: full width, one idea per block, body text at reading size. */
function InsightSheet({ insight: i, onClose, onOpenTest, onLogBleed }: {
  insight: HomeInsight
  onClose: () => void
  onOpenTest?: () => void
  onLogBleed?: () => void
}) {
  const hasActions = !!onOpenTest || !!onLogBleed
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent sheet className="sm:max-w-lg">
        <DialogHeader className="gap-2">
          <FeedChip status={{ label: i.chip, tone: i.tone === 'neutral' ? 'neutral' : i.tone }} className="self-start" />
          <DialogTitle className="text-[22px]">{i.title}</DialogTitle>
          <DialogDescription>{i.sub}</DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-6">
          {i.summary && <p className="text-[15px] leading-[1.6] text-foreground/90 text-pretty">{i.summary}</p>}

          {i.signals.length > 0 && (
            <section>
              {i.signalsTitle && <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{i.signalsTitle}</h3>}
              <ul className="mt-2 divide-y divide-border/70">
                {i.signals.map((s) => (
                  <li key={s.label} className="py-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className={cn('size-2 shrink-0 translate-y-[-1px] rounded-full', DOT[s.tone ?? 'none'])} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{s.label}</span>
                      {s.value && <span className={cn('shrink-0 font-mono text-[15px] font-medium tabular-nums', VALUE[s.tone ?? 'none'])}>{s.value}</span>}
                    </div>
                    {s.text && <p className="mt-1.5 pl-5 text-[14px] leading-[1.55] text-muted-foreground text-pretty">{s.text}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!!i.causes?.length && (
            <section>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Why it happens on a protocol</h3>
              <ul className="mt-3 flex list-disc flex-col gap-2.5 pl-5 marker:text-muted-foreground/60">
                {i.causes.map((c) => <li key={c} className="text-[15px] leading-[1.55] text-foreground/90 text-pretty">{c}</li>)}
              </ul>
            </section>
          )}

          {!!i.practices?.length && (
            <section>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">What people usually do</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Common practice on a protocol, not a recommendation.</p>
              <ol className="mt-3 flex list-decimal flex-col gap-2.5 pl-5 marker:font-mono marker:text-[13px] marker:text-[var(--accent-ink)]">
                {i.practices.map((p) => <li key={p} className="pl-1 text-[15px] leading-[1.55] text-foreground/90 text-pretty">{p}</li>)}
              </ol>
            </section>
          )}
        </DialogBody>
        {hasActions && (
          <DialogBar>
            {onOpenTest && <Button variant={onLogBleed ? 'outline' : 'default'} onClick={onOpenTest}>Open the test</Button>}
            {onLogBleed && <Button onClick={onLogBleed}><Droplets className="size-4" /> Log a blood-letting</Button>}
          </DialogBar>
        )}
      </DialogContent>
    </Dialog>
  )
}
