/**
 * LabAnalysis UI: the written summary card and the panel-by-panel analysis
 * list on the Lab results page. The reading itself lives in lib/labFindings.
 */

import { useState } from 'react'
import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import { PanelCard } from './dashboard/PanelCard'
import { FeedChip, FeedList, FeedRow, type FeedFact, type FeedStatus, type FeedTone } from './FeedList'
import { summarize, type Finding, type MarkerVal, type Status } from '../lib/labFindings'
import { cn } from '@/lib/utils'

// ── UI ─────────────────────────────────────────────────────────────────────
const STATUS_CHIP: Record<Status, FeedStatus> = {
  bad: { label: 'Action', tone: 'bad', icon: TriangleAlert },
  warn: { label: 'Watch', tone: 'warn', icon: Clock },
  good: { label: 'Good', tone: 'good', icon: CircleCheck },
  none: { label: 'No data', tone: 'neutral' },
}
const STATUS_TONE: Record<Status, FeedTone> = { bad: 'bad', warn: 'warn', good: 'good', none: 'neutral' }

function markerFacts(markers: MarkerVal[]): FeedFact[] {
  return markers.map((m) => {
    const t = m.trend
    const glyph = t ? (t.dir === 'flat' ? ' ≈' : ` ${t.dir === 'up' ? '▲' : '▼'}${Math.abs(t.pct).toFixed(0)}%`) : ''
    return { text: `${m.label} ${m.display}${glyph}`, tone: m.status === 'none' ? undefined : STATUS_TONE[m.status] }
  })
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('feed-facts rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-foreground/80', className)}>
      <span className="font-semibold text-primary">Not medical advice.</span> Apollo reads your numbers the way an experienced TRT user would and lists what people usually do about them. Check anything you act on with your doctor.
    </p>
  )
}

export type LabStats = { markers: number; inRange: number; outOfRange: number; lastTest?: string }

export function LabSummaryCard({ stats, findings, subtitle }: { stats: LabStats; findings: Finding[] | null; subtitle?: string }) {
  const paragraphs = findings ? summarize(findings) : []
  const cells = [
    { label: 'Markers', value: stats.markers, tone: 'neutral' as FeedTone },
    { label: 'In range', value: stats.inRange, tone: 'good' as FeedTone },
    { label: 'Out of range', value: stats.outOfRange, tone: stats.outOfRange > 0 ? 'bad' as FeedTone : 'neutral' as FeedTone },
    { label: 'Last test', value: stats.lastTest ?? '—', tone: 'neutral' as FeedTone },
  ]
  return (
    <PanelCard title="Your bloods, read" subtitle={subtitle ?? 'Latest results'}>
      <Disclaimer />
      {paragraphs.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {paragraphs.map((p, i) => (
            <p key={i} className={cn('feed-note text-foreground/90', i === 0 && 'text-[15px] font-medium text-foreground')}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="feed-note mt-4 text-muted-foreground">
          {findings ? 'Add a panel with reference ranges and Apollo will write it up here.' : 'Pro reads the panels together and writes up what they mean.'}
        </p>
      )}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-muted/50 px-2.5 py-2">
            <p className="feed-facts truncate text-muted-foreground">{c.label}</p>
            <p className={cn('mt-0.5 text-lg font-semibold tabular-nums leading-tight', c.tone === 'bad' && 'text-destructive', c.tone === 'good' && 'text-emerald-700 dark:text-emerald-400')}>{c.value}</p>
          </div>
        ))}
      </div>
    </PanelCard>
  )
}

function FindingDetail({ f }: { f: Finding }) {
  return (
    <div className="-mt-1 flex flex-col gap-3 pb-3 pl-14 pr-2">
      {f.causes.length > 0 && (
        <div>
          <p className="eyebrow">Probable causes on a protocol</p>
          <ul className="feed-note mt-1.5 list-disc space-y-1 pl-4 text-foreground/85 marker:text-muted-foreground/60">
            {f.causes.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {f.practices.length > 0 && (
        <div className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2.5">
          <p className="eyebrow text-primary">What people usually do · not a recommendation</p>
          <ul className="feed-note mt-1.5 list-disc space-y-1 pl-4 text-foreground/85 marker:text-primary/60">
            {f.practices.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
      <p className="feed-facts text-muted-foreground">
        {f.since
          ? `Arrows compare with your test from ${new Date(f.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}. `
          : 'One test so far; arrows appear once there is a previous one to compare with. '}
        Thresholds are TRT-aware, not the lab's generic range.
      </p>
    </div>
  )
}

export function LabAnalysisCard({ findings }: { findings: Finding[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (findings.length === 0) return null
  const actionCount = findings.filter((f) => f.status === 'bad').length
  const watchCount = findings.filter((f) => f.status === 'warn').length

  return (
    <PanelCard
      title="Analysis"
      subtitle="What the numbers mean together"
      action={
        <span className="flex gap-1.5">
          {actionCount > 0 && <FeedChip status={{ label: `${actionCount} action`, tone: 'bad' }} />}
          {watchCount > 0 && <FeedChip status={{ label: `${watchCount} watch`, tone: 'warn' }} />}
        </span>
      }
    >
      <FeedList>
        {findings.map((f) => (
          <FeedRow
            key={f.id}
            icon={f.icon}
            iconTone={STATUS_TONE[f.status]}
            title={f.label}
            sub={f.headline}
            status={STATUS_CHIP[f.status]}
            note={f.story || undefined}
            facts={markerFacts(f.markers)}
            expanded={open === f.id}
            onClick={() => setOpen(open === f.id ? null : f.id)}
          >
            {open === f.id && <FindingDetail f={f} />}
          </FeedRow>
        ))}
      </FeedList>
      <p className="feed-facts mt-3 text-muted-foreground">
        Tap a panel for the probable causes and what people usually do. It is a second opinion for your own reading, not medical advice.
      </p>
    </PanelCard>
  )
}
