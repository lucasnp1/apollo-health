import { lazy, Suspense, useMemo } from 'react'
import { AlertTriangle, CalendarClock, Check, ChevronRight, Plus, Syringe } from 'lucide-react'
// Lazy — recharts loads after initial paint so the page appears immediately
const PKOverviewCard = lazy(() => import('../components/PKOverviewCard').then(m => ({ default: m.PKOverviewCard })))
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type LabResult, type VitalLog } from '../lib/db'
import { SiteRotation } from '../components/SiteRotation'
import { flagLatestResults, type EnrichedResult } from '../lib/insights'
import { simpleUpcomingSchedule, timeUntil } from '../lib/schedule'
import { skipScheduledDose } from '../lib/injections'
import { SectionCard, PageGrid, EmptyHint } from '../components/Section'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { View } from '../app/views'
import type { QuickLogPrefill } from '../App'

export function Overview({
  compounds,
  injections,
  vitals,
  exams,
  results,
  onNavigate,
  onOpenQuickLog,
  onOpenWizard,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  onNavigate: (view: View) => void
  onOpenQuickLog: (tab: 'injection', prefill?: QuickLogPrefill) => void
  onOpenWizard: () => void
}) {
  const protocols = useLiveQuery(() => db.protocols.filter((p) => !p.archived).toArray(), [], [])
  const protocolDoses = useLiveQuery(() => db.protocolDoses.toArray(), [], [])
  const compoundMap = useMemo(() => new Map(compounds.map((c) => [c.id, c])), [compounds])
  const upcoming = useMemo(
    () => simpleUpcomingSchedule(protocols, injections, protocolDoses).slice(0, 5),
    [protocols, injections, protocolDoses],
  )

  const labFlags = flagLatestResults(results)
  const latestBp = vitals[0]

  const hctResult = results.find((r) => {
    const m = r.marker?.toLowerCase()
    return (m?.includes('hematocrit') || m === 'hct' || m === 'haematocrit') && r.value !== undefined && r.value > 52
  })

  const hasProtocol = compounds.length > 0
  const hasInjection = injections.length > 0
  const hasLabs = exams.length > 0
  const showOnboarding = !hasProtocol || !hasInjection || !hasLabs

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentVitals = vitals.filter((v) => parseISO(v.measuredAt).getTime() >= sevenDaysAgo)
  const avgBp = recentVitals.length >= 2
    ? {
        sys: Math.round(recentVitals.reduce((s, v) => s + v.systolic, 0) / recentVitals.length),
        dia: Math.round(recentVitals.reduce((s, v) => s + v.diastolic, 0) / recentVitals.length),
      }
    : undefined
  const bpHigh = latestBp && latestBp.systolic >= 145
  const bpWarn = latestBp && latestBp.systolic >= 135 && !bpHigh

  const onboardingItems = [
    { done: hasProtocol, title: 'Create your first protocol', detail: 'Set up your compound, dose schedule, and vial.', label: 'Create', onClick: onOpenWizard },
    { done: hasInjection, title: 'Log your first injection', detail: 'Record your dose, site, and how you feel.', label: 'Log', onClick: () => onOpenQuickLog('injection') },
    { done: hasLabs, title: 'Add your latest bloodwork', detail: 'Upload a PDF or enter markers manually.', label: 'Go to Labs', onClick: () => onNavigate('labs') },
  ]

  return (
    <PageGrid>
      {/* ── Onboarding ── */}
      {showOnboarding && (
        <SectionCard className="md:col-span-12" eyebrow="Getting started" title="Set up your health record">
          <div className="flex flex-col">
            {onboardingItems.map((item, i) => (
              <div key={i} className={cn('flex items-center gap-3 py-3', i > 0 && 'border-t')}>
                <span className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full border',
                  item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40',
                )}>
                  {item.done && <Check className="size-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', item.done && 'text-muted-foreground line-through')}>{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
                {!item.done && (
                  <Button variant="outline" size="sm" onClick={item.onClick}>
                    <Plus className="size-3.5" /> {item.label}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── HCT alert ── */}
      {hctResult && (
        <SectionCard className="md:col-span-12 border-l-2 border-l-destructive" eyebrow="Safety flag" title={`Hematocrit ${hctResult.rawValue}% — above 52%`}
          action={<Button variant="outline" size="sm" onClick={() => onNavigate('labs')}>View labs <ChevronRight className="size-3.5" /></Button>}>
          <p className="text-sm text-muted-foreground">Elevated hematocrit increases blood viscosity. Consider donating blood and consulting your physician.</p>
        </SectionCard>
      )}

      {/* ── BP status ── */}
      <SectionCard className="md:col-span-4" eyebrow="Now" title="Status">
        <div className="flex items-baseline gap-2">
          <span className={cn('font-mono text-3xl font-medium tabular-nums', bpHigh && 'text-destructive', bpWarn && 'text-amber-600 dark:text-amber-400')}>
            {latestBp ? `${latestBp.systolic}/${latestBp.diastolic}` : '—'}
          </span>
          <span className="text-xs text-muted-foreground">BP</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {avgBp
            ? `avg 7d ${avgBp.sys}/${avgBp.dia} · ${latestBp?.pulse ?? '—'} bpm`
            : latestBp
              ? `${latestBp.pulse ?? '—'} bpm · ${format(parseISO(latestBp.measuredAt), 'MMM d')}`
              : 'No reading yet'}
        </p>
      </SectionCard>

      {/* ── Site rotation (component renders its own header) ── */}
      <SectionCard className="md:col-span-8">
        <SiteRotation injections={injections} compounds={compounds} />
      </SectionCard>

      {/* ── PK curve (self-contained legacy card for now) ── */}
      <div className="md:col-span-12">
        <Suspense fallback={null}>
          <PKOverviewCard compounds={compounds} injections={injections} protocols={protocols} protocolDoses={[]} exams={exams} />
        </Suspense>
      </div>

      {/* ── Recent doses ── */}
      <SectionCard
        className="md:col-span-6"
        eyebrow="History"
        title="Recent doses"
        action={<Button variant="ghost" size="sm" onClick={() => onNavigate('meds')}>All <ChevronRight className="size-3.5" /></Button>}
      >
        {injections.length > 0 ? (
          <div className="flex flex-col">
            {injections.slice(0, 6).map((inj, i) => {
              const compound = compoundMap.get(inj.compoundId)
              return (
                <div key={inj.id} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t')}>
                  <Syringe className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{compound?.name ?? 'Injection'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {inj.dose} {inj.unit}{inj.site ? ` · ${inj.site}` : ''}{inj.weightKg ? ` · ${inj.weightKg} kg` : ''}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(parseISO(inj.takenAt), { addSuffix: true })}
                  </time>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyHint icon={Syringe} title="No doses logged yet" detail="Use Add to log your first injection." />
        )}
      </SectionCard>

      {/* ── Upcoming doses ── */}
      <SectionCard
        className="md:col-span-6"
        eyebrow="Your schedule"
        title="Upcoming doses"
        action={<Button variant="ghost" size="sm" onClick={() => onNavigate('meds')}>My compounds <ChevronRight className="size-3.5" /></Button>}
      >
        {upcoming.length > 0 ? (
          <div className="flex flex-col">
            {upcoming.map((item, idx) => {
              const c = compoundMap.get(item.protocol.compoundId)
              const overdue = item.isOverdue
              return (
                <div key={item.protocol.id} className={cn('flex items-center gap-3 py-2.5', idx > 0 && 'border-t')}>
                  <CalendarClock className={cn('size-3.5 shrink-0', overdue ? 'text-destructive' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.name ?? 'Compound'}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.protocol.dose} {item.protocol.unit} · {format(item.nextDue, 'EEE MMM d')}</p>
                  </div>
                  <Badge variant={overdue ? 'destructive' : 'secondary'} className="shrink-0 tabular-nums">
                    {overdue ? `${Math.round(Math.abs(item.daysUntil))}d overdue` : timeUntil(item.nextDue)}
                  </Badge>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => skipScheduledDose(item.protocol.id!, item.nextDue.toISOString())}>Skip</Button>
                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onOpenQuickLog('injection', { compoundId: item.protocol.compoundId, dose: item.protocol.dose, unit: item.protocol.unit, protocolId: item.protocol.id, scheduledAt: item.nextDue.toISOString() })}>Log</Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyHint icon={CalendarClock} title="No scheduled doses" detail="Add a compound to populate this list." action={<Button size="sm" onClick={() => onNavigate('meds')}>My compounds</Button>} />
        )}
      </SectionCard>

      {/* ── Lab flags ── */}
      {labFlags.length > 0 && (
        <SectionCard
          className="md:col-span-12"
          eyebrow="Watch list"
          title="Lab flags"
          action={<Button variant="ghost" size="sm" onClick={() => onNavigate('labs')}>Labs <ChevronRight className="size-3.5" /></Button>}
        >
          <div className="flex flex-col">
            {labFlags.slice(0, 6).map((result, i) => (
              <div key={result.id} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t')}>
                <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{result.marker}</p>
                  <p className="truncate text-xs text-muted-foreground">{result.rawValue} {result.unit ?? ''} · ref {result.low ?? '?'}–{result.high ?? '?'}</p>
                </div>
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{labStatusLabel(result)}</Badge>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </PageGrid>
  )
}

function labStatusLabel(r: LabResult) {
  if (r.status?.toLowerCase().includes('high')) return 'High'
  if (r.status?.toLowerCase().includes('low')) return 'Low'
  if (r.value !== undefined && r.high !== undefined && r.value > r.high) return 'High'
  if (r.value !== undefined && r.low !== undefined && r.value < r.low) return 'Low'
  return 'Flag'
}
