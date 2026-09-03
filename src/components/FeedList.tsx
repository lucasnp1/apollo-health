/**
 * FeedList / FeedRow: the structured list row used by the Timeline, the lab
 * marker lists and the bloods analysis. One shape everywhere: a grey circle
 * icon, a title with the time next to it, a one-line sub, a status chip on the
 * right, an optional note, then a row of small facts. Type sizes come from the
 * `feed-*` utilities in index.css so every list reads the same.
 */
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FeedTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent'
export type FeedStatus = { label: string; tone: FeedTone; icon?: LucideIcon }
export type FeedFact = string | { text: string; tone?: FeedTone }

const FEED_TONE: Record<FeedTone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  bad: 'bg-destructive/12 text-destructive',
  accent: 'bg-primary/12 text-primary',
}

const ICON_TONE: Record<FeedTone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  good: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  bad: 'bg-destructive/12 text-destructive',
  accent: 'bg-primary/12 text-primary',
}

const FACT_TONE: Record<FeedTone, string> = {
  neutral: '',
  good: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-destructive',
  accent: 'text-primary',
}

export function FeedList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('-mx-2 flex flex-col divide-y divide-border/60', className)}>{children}</ul>
}

export function FeedChip({ status, className }: { status: FeedStatus; className?: string }) {
  const Icon = status.icon
  return (
    <span className={cn('feed-chip inline-flex items-center gap-1 rounded-md px-1.5 py-1', FEED_TONE[status.tone], className)}>
      {Icon && <Icon className="size-3 shrink-0" />}
      <span className="truncate">{status.label}</span>
    </span>
  )
}

export function FeedFacts({ facts, className }: { facts: FeedFact[]; className?: string }) {
  if (facts.length === 0) return null
  return (
    <span className={cn('feed-facts flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground', className)}>
      {facts.map((f, i) => {
        const fact = typeof f === 'string' ? { text: f } : f
        return (
          <span key={i} className="inline-flex items-center gap-1 tabular-nums">
            <span className="size-1 shrink-0 rounded-full bg-muted-foreground/40" />
            <span className={fact.tone ? FACT_TONE[fact.tone] : undefined}>{fact.text}</span>
          </span>
        )
      })}
    </span>
  )
}

export function FeedRow({
  icon: Icon,
  iconTone = 'neutral',
  title,
  when,
  whenShort,
  sub,
  status,
  note,
  clampNote = false,
  facts = [],
  children,
  onClick,
  selected = false,
  expanded,
  className,
}: {
  icon: LucideIcon
  iconTone?: FeedTone
  title: ReactNode
  /** "today at 8:12 AM". Inline next to the title on wider screens, under it on phones. */
  when?: string
  /** Shorter form of `when` for the phone sub line ("Sep 1"), so the sub keeps its room. */
  whenShort?: string
  sub?: ReactNode
  status?: FeedStatus
  note?: ReactNode
  /** Cap the note at three lines (feeds), or let it run (analysis). */
  clampNote?: boolean
  facts?: FeedFact[]
  /** Extra content under the row, outside the tap target. */
  children?: ReactNode
  onClick?: () => void
  /** Row is the current selection (lab marker lists). */
  selected?: boolean
  /** Row toggles a detail block (analysis). Overrides the selected chevron. */
  expanded?: boolean
  className?: string
}) {
  const interactive = typeof onClick === 'function'
  const open = expanded !== undefined ? expanded : selected
  const body = (
    <>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-border/70', ICON_TONE[iconTone])}>
        <Icon className="size-4" />
      </span>
      <span className="block min-w-0 flex-1">
        <span className="flex min-w-0 items-start gap-2">
          <span className="block min-w-0 flex-1">
            {/* Phones get two lines before clipping; wider screens keep one. */}
            <span className="feed-title flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 text-foreground line-clamp-2 sm:line-clamp-1">{title}</span>
              {when && (
                <>
                  <span className="hidden shrink-0 font-normal text-muted-foreground/50 sm:inline">·</span>
                  <time className="feed-meta hidden shrink-0 whitespace-nowrap font-normal text-muted-foreground sm:inline">{when}</time>
                </>
              )}
            </span>
            {(when || sub) && (
              <span className={cn('feed-meta block text-muted-foreground line-clamp-2 sm:line-clamp-1', !sub && 'sm:hidden')}>
                {when && <span className="sm:hidden">{whenShort ?? when}{sub ? ' · ' : ''}</span>}
                {sub}
              </span>
            )}
          </span>
          {(status || interactive) && (
            <span className="flex shrink-0 items-center gap-1.5">
              {status && <FeedChip status={status} className="max-w-[44vw] sm:max-w-none" />}
              {interactive && (open
                ? <ChevronDown className="size-3.5 text-muted-foreground/70" aria-hidden="true" />
                : <ChevronRight className="size-3.5 text-muted-foreground/70" aria-hidden="true" />)}
            </span>
          )}
        </span>
        {note && <span className={cn('feed-note mt-1 block break-words text-foreground/85', clampNote && 'line-clamp-3')}>{note}</span>}
        {facts.length > 0 && <FeedFacts facts={facts} className="mt-1.5" />}
      </span>
    </>
  )
  const cls = cn(
    'flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors',
    interactive && 'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    selected && 'bg-accent/50 hover:bg-accent/50',
    className,
  )
  return (
    <li>
      {interactive ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={expanded === undefined ? selected : undefined}
          aria-expanded={expanded}
          className={cls}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {children}
    </li>
  )
}
