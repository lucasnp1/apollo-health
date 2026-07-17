import { useMemo, lazy, Suspense } from 'react'
import {
  AlertTriangle, CalendarClock, ChevronRight, FlaskConical, Plus, Syringe, X,
} from 'lucide-react'
import { format, startOfDay } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BodyMetric, type Compound, type InjectionLog, type LabExam, type LabResult, type VitalLog } from '../lib/db'
import { flagLatestResults, type EnrichedResult } from '../lib/insights'
import { pendingDoses, upcomingSchedule, timeUntil, type ScheduledItem } from '../lib/schedule'
import { skipScheduledDose } from '../lib/injections'
import { DashGrid } from '../components/dashboard/Grid'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { SiteRotation } from '../components/SiteRotation'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { View } from '../app/views'
import type { QuickLogPrefill, QuickLogLine } from '../App'
const ActiveLevelsCard = lazy(() => import('../components/ActiveLevelsCard').then((m) => ({ default: m.ActiveLevelsCard })))

type QuickLogFn = (tab: 'injection' | 'bp' | 'weight', prefill?: QuickLogPrefill) => void

const DAY = 86_400_000

function compactAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(ms / DAY)}d ago`
}

// Whole days a scheduled instant is before the start of today (0 = today).
function overdueDays(scheduledAt: Date): number {
  return Math.floor((startOfDay(new Date()).getTime() - scheduledAt.getTime()) / DAY)
}

function lineFor(item: ScheduledItem): QuickLogLine {
  return {
    compoundId: item.protocol.compoundId,
    dose: item.protocol.dose,
    unit: item.protocol.unit,
    protocolId: item.protocol.id,
    scheduledAt: item.scheduledAt.toISOString(),
  }
}

export function Overview({
  compounds,
  injections,
  vitals,
  exams,
  results,
  bodyMetrics,
  onNavigate,
  onOpenQuickLog,
  onOpenWizard,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  bodyMetrics: BodyMetric[]
  onNavigate: (view: View) => void
  onOpenQuickLog: QuickLogFn
  onOpenWizard: () => void
}) {
  const protocols = useLiveQuery(() => db.protocols.filter((p) => !p.archived).toArray(), [], [])
  const protocolDoses = useLiveQuery(() => db.protocolDoses.toArray(), [], [])
  const compoundMap = useMemo(() => new Map(compounds.map((c) => [c.id, c])), [compounds])

  // Overdue + due-today, keyed on canonical schedule instants (so logging /
  // dismissing actually clears them). Plus the next future dose for the
  // "all caught up" state.
  const pending = useMemo(() => pendingDoses(protocols, protocolDoses), [protocols, protocolDoses])
  const nextUp = useMemo(
    () => upcomingSchedule(protocols, protocolDoses, new Date(), 30).find((it) => it.scheduledAt.getTime() > Date.now()),
    [protocols, protocolDoses],
  )

  const labFlags = flagLatestResults(results)
  const latestBp = vitals[0]

  const hctResult = results.find((r) => {
    const m = r.marker?.toLowerCase()
    return (m?.includes('hematocrit') || m === 'hct' || m === 'haematocrit') && r.value !== undefined && r.value > 52
  })

  // BP average of the LAST 5 readings (vitals is newest-first).
  const bpAvg5 = useMemo(() => {
    const last5 = vitals.slice(0, 5)
    if (last5.length === 0) return undefined
    const avg = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
    return { sys: avg(last5.map((v) => v.systolic)), dia: avg(last5.map((v) => v.diastolic)), n: last5.length }
  }, [vitals])

  // Weight: newest + delta vs the previous point, across bodyMetrics + injections.
  const weightInfo = useMemo(() => {
    const pts: Array<{ ms: number; kg: number }> = []
    for (const b of bodyMetrics) if (b.weightKg !== undefined) pts.push({ ms: new Date(b.measuredAt).getTime(), kg: b.weightKg })
    for (const i of injections) if (i.weightKg !== undefined) pts.push({ ms: new Date(i.takenAt).getTime(), kg: i.weightKg })
    pts.sort((a, b) => a.ms - b.ms)
    if (pts.length === 0) return undefined
    const latest = pts[pts.length - 1]
    const prev = pts.length > 1 ? pts[pts.length - 2] : undefined
    return { kg: latest.kg, delta: prev ? latest.kg - prev.kg : undefined, at: latest.ms }
  }, [bodyMetrics, injections])

  const bpTone = bpAvg5
    ? bpAvg5.sys >= 145 ? 'text-destructive' : bpAvg5.sys >= 135 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
    : ''

  const hasProtocol = compounds.length > 0
  const hasInjection = injections.length > 0
  const hasLabs = exams.length > 0
  const showOnboarding = !hasProtocol || !hasInjection || !hasLabs

  function logAll() {
    if (pending.length === 0) return
    onOpenQuickLog('injection', { lines: pending.map(lineFor) })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── HCT safety banner ── */}
      {hctResult && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-sm">
            <strong className="text-destructive">Hematocrit {hctResult.rawValue}% — above 52%.</strong>{' '}
            <span className="text-muted-foreground">Elevated blood viscosity. Consider donating blood and consulting your physician.</span>
          </p>
          <Button variant="outline" size="sm" onClick={() => onNavigate('labs')}>
            View labs <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}

      {/* ── Onboarding banner ── */}
      {showOnboarding && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            <strong className="text-foreground">Finish setting up:</strong>{' '}
            {[!hasProtocol && 'add a compound', !hasInjection && 'log an injection', !hasLabs && 'import bloodwork'].filter(Boolean).join(' · ')}
          </p>
          {!hasProtocol && <Button size="sm" onClick={onOpenWizard}><Plus className="size-3.5" /> Add compound</Button>}
          {hasProtocol && !hasInjection && <Button size="sm" onClick={() => onOpenQuickLog('injection')}><Plus className="size-3.5" /> Log injection</Button>}
          {hasProtocol && hasInjection && !hasLabs && <Button size="sm" onClick={() => onNavigate('labs')}><FlaskConical className="size-3.5" /> Go to Labs</Button>}
        </div>
      )}

      <DashGrid>
        {/* ── 1. Today's protocol — the driver ── */}
        <div className="md:col-span-2 xl:col-span-3">
          <ProtocolTodayCard
            pending={pending}
            nextUp={nextUp}
            hasProtocols={protocols.length > 0}
            compoundMap={compoundMap}
            onLogAll={logAll}
            onLogOne={(it) => onOpenQuickLog('injection', { lines: [lineFor(it)] })}
            onDismiss={(it) => void skipScheduledDose(it.protocol.id!, it.scheduledAt.toISOString())}
            onOpenWizard={onOpenWizard}
            onNavigate={onNavigate}
          />
        </div>

        {/* ── 2. Vitals — BP avg of last 5 + weight ── */}
        <PanelCard
          className="md:col-span-2 xl:col-span-3"
          title="Vitals"
          subtitle="Recent averages"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Blood pressure</p>
              <p className={`font-mono text-2xl font-semibold tabular-nums ${bpTone}`}>
                {bpAvg5 ? `${bpAvg5.sys}/${bpAvg5.dia}` : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {bpAvg5
                  ? `avg last ${bpAvg5.n}${latestBp ? ` · latest ${latestBp.systolic}/${latestBp.diastolic}` : ''}`
                  : 'No readings'}
              </p>
              <Button variant="ghost" size="sm" className="mt-0.5 h-7 self-start px-2 text-xs text-muted-foreground" onClick={() => onOpenQuickLog('bp')}>
                <Plus className="size-3" /> Log BP
              </Button>
            </div>
            <div className="flex flex-col gap-1 border-l pl-4">
              <p className="text-xs font-medium text-muted-foreground">Weight</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {weightInfo ? weightInfo.kg : '—'}<small className="ml-1 text-xs font-normal text-muted-foreground">kg</small>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {weightInfo
                  ? (weightInfo.delta !== undefined && Math.abs(weightInfo.delta) >= 0.05
                      ? `${weightInfo.delta > 0 ? '+' : ''}${weightInfo.delta.toFixed(1)} kg vs last`
                      : format(weightInfo.at, 'MMM d'))
                  : 'Not logged'}
              </p>
              <Button variant="ghost" size="sm" className="mt-0.5 h-7 self-start px-2 text-xs text-muted-foreground" onClick={() => onOpenQuickLog('weight')}>
                <Plus className="size-3" /> Log weight
              </Button>
            </div>
          </div>
        </PanelCard>

        {/* ── 3. Site rotation — full width, high priority for planning pins ── */}
        {injections.length > 0 && (
          <PanelCard className="md:col-span-2 xl:col-span-6" title="Site rotation" subtitle="Volume, balance & recency — last 60 days">
            <SiteRotation injections={injections} compounds={compounds} />
          </PanelCard>
        )}

        {/* ── 4. Active levels — plain-language ── */}
        {injections.length > 0 && (
          <div className="md:col-span-2 xl:col-span-6">
            <Suspense fallback={null}>
              <ActiveLevelsCard compounds={compounds} injections={injections} />
            </Suspense>
          </div>
        )}

        {/* ── 5. Recent doses ── */}
        <PanelCard
          className="md:col-span-2 xl:col-span-6"
          title="Recent doses"
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate('meds')}>
              All <ChevronRight className="size-3.5" />
            </Button>
          }
        >
          {injections.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[36%]">Compound</TableHead>
                  <TableHead className="w-[14%]">Dose</TableHead>
                  <TableHead className="hidden w-[10%] md:table-cell">Route</TableHead>
                  <TableHead className="hidden md:table-cell">Site</TableHead>
                  <TableHead className="w-[16%] text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {injections.slice(0, 8).map((inj) => {
                  const compound = compoundMap.get(inj.compoundId)
                  return (
                    <TableRow key={inj.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: compound?.color ?? 'var(--primary)' }} />
                          <span className="truncate font-medium">{compound?.name ?? 'Injection'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{inj.dose} {inj.unit}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {inj.route && (
                          <span className="rounded-full border border-border bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {inj.route}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{inj.site ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{compactAgo(inj.takenAt)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <PanelEmpty icon={Syringe} title="No doses logged yet" detail="Tap + Add to log your first injection." />
          )}
        </PanelCard>

        {/* ── 6. Lab flags — only when there are flags ── */}
        {labFlags.length > 0 && (
          <PanelCard
            className="md:col-span-2 xl:col-span-3"
            title="Lab flags"
            subtitle="Markers outside their reference range"
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigate('labs')}>
                Labs <ChevronRight className="size-3.5" />
              </Button>
            }
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Marker</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                  <TableHead className="w-[60px] text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labFlags.slice(0, 6).map((result) => (
                  <TableRow key={result.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                        <span className="truncate font-medium">{result.marker}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">{result.rawValue} {result.unit ?? ''}</TableCell>
                    <TableCell className="hidden font-mono text-xs tabular-nums text-muted-foreground md:table-cell">{result.low ?? '?'}–{result.high ?? '?'}</TableCell>
                    <TableCell className="text-right">
                      <span className="rounded-full bg-destructive/12 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                        {labStatusLabel(result)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelCard>
        )}
      </DashGrid>
    </div>
  )
}

// ── Today's protocol card ────────────────────────────────────────────────────

function ProtocolTodayCard({
  pending,
  nextUp,
  hasProtocols,
  compoundMap,
  onLogAll,
  onLogOne,
  onDismiss,
  onOpenWizard,
  onNavigate,
}: {
  pending: ScheduledItem[]
  nextUp?: ScheduledItem
  hasProtocols: boolean
  compoundMap: Map<number | undefined, Compound>
  onLogAll: () => void
  onLogOne: (it: ScheduledItem) => void
  onDismiss: (it: ScheduledItem) => void
  onOpenWizard: () => void
  onNavigate: (view: View) => void
}) {
  const anyOverdue = pending.some((it) => overdueDays(it.scheduledAt) >= 1)

  return (
    <PanelCard
      className="h-full"
      title="Today's protocol"
      subtitle={pending.length > 0 ? (anyOverdue ? 'Log what you took, or dismiss it' : 'Due today') : 'Your schedule'}
      action={
        hasProtocols ? (
          <Button variant="ghost" size="sm" onClick={() => onNavigate('meds')}>
            Manage <ChevronRight className="size-3.5" />
          </Button>
        ) : undefined
      }
    >
      {!hasProtocols ? (
        <PanelEmpty
          icon={CalendarClock}
          title="No protocols yet"
          detail="Add a compound with a schedule and your daily doses show up here."
          action={<Button size="sm" onClick={onOpenWizard}><Plus className="size-3.5" /> Add compound</Button>}
        />
      ) : pending.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <ul className="flex flex-col">
            {pending.map((it, i) => {
              const c = compoundMap.get(it.protocol.compoundId)
              const od = overdueDays(it.scheduledAt)
              return (
                <li key={`${it.protocol.id}-${it.scheduledAt.toISOString()}`} className={`flex items-center gap-2.5 py-2 ${i > 0 ? 'border-t' : ''}`}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: c?.color ?? 'var(--primary)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.name ?? it.protocol.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">{it.protocol.dose} {it.protocol.unit}</span>
                      {' · '}
                      <span className={od >= 1 ? 'text-destructive' : ''}>{od >= 1 ? `${od}d overdue` : 'due today'}</span>
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => onLogOne(it)}>Log</Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Dismiss dose"
                    title="Dismiss (didn't take)"
                    onClick={() => onDismiss(it)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
          {pending.length > 1 && (
            <Button size="lg" onClick={onLogAll}>
              <Syringe className="size-4" /> Log all {pending.length} (one syringe)
            </Button>
          )}
        </div>
      ) : nextUp ? (
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: compoundMap.get(nextUp.protocol.compoundId)?.color ?? 'var(--primary)' }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {compoundMap.get(nextUp.protocol.compoundId)?.name ?? nextUp.protocol.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{nextUp.protocol.dose} {nextUp.protocol.unit}</span>
                {' · '}next {timeUntil(nextUp.scheduledAt)}
              </p>
            </div>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ All caught up — nothing due today.</p>
        </div>
      ) : (
        <PanelEmpty icon={CalendarClock} title="Nothing scheduled" detail="No upcoming protocol doses." />
      )}
    </PanelCard>
  )
}

function labStatusLabel(r: LabResult) {
  if (r.status?.toLowerCase().includes('high')) return 'High'
  if (r.status?.toLowerCase().includes('low')) return 'Low'
  if (r.value !== undefined && r.high !== undefined && r.value > r.high) return 'High'
  if (r.value !== undefined && r.low !== undefined && r.value < r.low) return 'Low'
  return 'Flag'
}
