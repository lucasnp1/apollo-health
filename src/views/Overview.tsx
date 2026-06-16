import { useMemo } from 'react'
import {
  AlertTriangle, CalendarClock, ChevronRight, FlaskConical,
  HeartPulse, Plus, Scale, Syringe,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type LabResult, type VitalLog } from '../lib/db'
import { flagLatestResults, type EnrichedResult } from '../lib/insights'
import { simpleUpcomingSchedule } from '../lib/schedule'
import { skipScheduledDose } from '../lib/injections'
import { DashGrid, StatRow } from '../components/dashboard/Grid'
import { StatCard } from '../components/dashboard/StatCard'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { HeroCard } from '../components/dashboard/HeroCard'
import { SiteRotation } from '../components/SiteRotation'
import { lazy, Suspense } from 'react'
const ActiveLevelsCard = lazy(() => import('../components/ActiveLevelsCard').then((m) => ({ default: m.ActiveLevelsCard })))
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { View } from '../app/views'
import type { QuickLogPrefill } from '../App'

// Compact "X ago" labels — matches the rest of the app (carousel, schedule).
function compactAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(ms / 86_400_000)
  return `${days}d ago`
}

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
  const schedule = useMemo(
    () => simpleUpcomingSchedule(protocols, injections, protocolDoses),
    [protocols, injections, protocolDoses],
  )
  const upNext = schedule[0]

  const labFlags = flagLatestResults(results)
  const latestBp = vitals[0]

  // HCT alert — hematocrit > 52% is a safety flag for TRT users
  const hctResult = results.find((r) => {
    const m = r.marker?.toLowerCase()
    return (m?.includes('hematocrit') || m === 'hct' || m === 'haematocrit') && r.value !== undefined && r.value > 52
  })

  // 7-day average BP
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentVitals = vitals.filter((v) => parseISO(v.measuredAt).getTime() >= sevenDaysAgo)
  const avgBp = recentVitals.length >= 2
    ? {
        sys: Math.round(recentVitals.reduce((s, v) => s + v.systolic, 0) / recentVitals.length),
        dia: Math.round(recentVitals.reduce((s, v) => s + v.diastolic, 0) / recentVitals.length),
      }
    : undefined

  const lastWeight = useMemo(() => {
    for (const inj of injections) if (inj.weightKg !== undefined) return inj.weightKg
    return undefined
  }, [injections])

  const lastTest = exams[0]
  const outOfRange = labFlags.length

  const bpTone = latestBp
    ? latestBp.systolic >= 145 ? 'bad' as const : latestBp.systolic >= 135 ? 'primary' as const : 'good' as const
    : 'neutral' as const

  const hasProtocol = compounds.length > 0
  const hasInjection = injections.length > 0
  const hasLabs = exams.length > 0
  const showOnboarding = !hasProtocol || !hasInjection || !hasLabs

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

      {/* ── KPI row — 4 essentials (no Next dose since Up Next has it; no Lab panels) ── */}
      <StatRow>
        <StatCard
          icon={HeartPulse}
          label="Blood pressure"
          value={latestBp ? `${latestBp.systolic}/${latestBp.diastolic}` : '—'}
          sub={avgBp ? `avg 7d ${avgBp.sys}/${avgBp.dia}` : latestBp ? format(parseISO(latestBp.measuredAt), 'MMM d') : 'No reading'}
          tone={bpTone}
          colorValue={bpTone === 'bad'}
        />
        <StatCard
          icon={Syringe}
          label="Active compounds"
          value={protocols.length}
          sub={injections.length > 0 ? `${injections.length} doses logged` : undefined}
          tone="primary"
        />
        <StatCard
          icon={FlaskConical}
          label="Out of range"
          value={outOfRange}
          sub={lastTest ? `last test ${format(parseISO(lastTest.collectedAt), 'MMM d')}` : 'No labs yet'}
          tone={outOfRange > 0 ? 'bad' : 'good'}
          colorValue
        />
        <StatCard
          icon={Scale}
          label="Weight"
          value={lastWeight !== undefined ? `${lastWeight} kg` : '—'}
          tone="info"
        />
      </StatRow>

      <DashGrid>
        {/* ── 1. Up next ── */}
        <HeroCard
          className="md:col-span-2 xl:col-span-3"
          eyebrow={upNext ? 'Up next' : 'Status'}
          icon={CalendarClock}
          title={
            upNext
              ? (compoundMap.get(upNext.protocol.compoundId)?.name ?? upNext.protocol.name)
              : latestBp
                ? `${latestBp.systolic}/${latestBp.diastolic}`
                : 'Welcome'
          }
          subtitle={
            upNext
              ? `${upNext.protocol.dose} ${upNext.protocol.unit} · ${upNext.isOverdue ? `${Math.round(Math.abs(upNext.daysUntil))}d overdue` : format(upNext.nextDue, 'EEEE, MMM d · HH:mm')}`
              : latestBp
                ? `Latest blood pressure · ${format(parseISO(latestBp.measuredAt), 'MMM d, HH:mm')}`
                : 'Add a compound to see your schedule here.'
          }
          onAction={
            upNext
              ? () => onOpenQuickLog('injection', {
                  compoundId: upNext.protocol.compoundId,
                  dose: upNext.protocol.dose,
                  unit: upNext.protocol.unit,
                  protocolId: upNext.protocol.id,
                  scheduledAt: upNext.nextDue.toISOString(),
                })
              : undefined
          }
          actionLabel="Log this dose"
          secondary={
            upNext && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => skipScheduledDose(upNext.protocol.id!, upNext.nextDue.toISOString())}
              >
                Skip this dose
              </Button>
            )
          }
        />

        {/* ── 2. Site rotation — promoted right under Up next ── */}
        {injections.length > 0 && (
          <PanelCard className="md:col-span-2 xl:col-span-3" title="Site rotation" subtitle="Red = used recently">
            <SiteRotation injections={injections} compounds={compounds} />
          </PanelCard>
        )}

        {/* ── 3. Active levels — past-only stacked chart of what you injected ── */}
        {injections.length > 0 && (
          <div className="md:col-span-2 xl:col-span-6">
            <Suspense fallback={null}>
              <ActiveLevelsCard compounds={compounds} injections={injections} />
            </Suspense>
          </div>
        )}

        {/* ── 4. Recent doses — full-width on desktop, shadcn Table for clean column alignment ── */}
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

        {/* ── 4. Lab flags — only when there are flags ── */}
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
            <div className="flex flex-col">
              {labFlags.slice(0, 6).map((result, i) => (
                <div key={result.id} className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t' : ''}`}>
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{result.marker}</p>
                    <p className="truncate text-xs text-muted-foreground">{result.rawValue} {result.unit ?? ''} · ref {result.low ?? '?'}–{result.high ?? '?'}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-destructive/12 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
                    {labStatusLabel(result)}
                  </span>
                </div>
              ))}
            </div>
          </PanelCard>
        )}
      </DashGrid>
    </div>
  )
}

function labStatusLabel(r: LabResult) {
  if (r.status?.toLowerCase().includes('high')) return 'High'
  if (r.status?.toLowerCase().includes('low')) return 'Low'
  if (r.value !== undefined && r.high !== undefined && r.value > r.high) return 'High'
  if (r.value !== undefined && r.low !== undefined && r.value < r.low) return 'Low'
  return 'Flag'
}
