import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { revealProps } from '../motion'

export type StatTone = 'primary' | 'good' | 'bad' | 'info' | 'neutral'

// Horizon MiniStatistics anatomy: icon in a tinted circle on the left,
// muted label + bold value on the right.
// Restrained, mostly-monochrome icon chips — colour only for good/bad/info,
// and even then a faint tint. Keeps the field calm (Things-3).
const TONE_CIRCLE: Record<StatTone, string> = {
  primary: 'bg-muted text-muted-foreground',
  neutral: 'bg-muted text-muted-foreground',
  good:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  bad:     'bg-destructive/10 text-destructive',
  info:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}

// The big number is always ink; status colour lives in the sub line, not here.
const TONE_VALUE: Record<StatTone, string> = {
  primary: 'text-foreground',
  good:    'text-foreground',
  bad:     'text-foreground',
  info:    'text-foreground',
  neutral: 'text-foreground',
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'neutral',
  colorValue = false,
  className,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  /** Optional small line under the value (delta, context). */
  sub?: ReactNode
  tone?: StatTone
  /** Tint the value itself (not just the icon) with the tone color. */
  colorValue?: boolean
  className?: string
}) {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div
      {...revealProps(reduce)}
      className={cn('flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-card)] md:gap-4', className)}
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg md:size-10', TONE_CIRCLE[tone])}>
        <Icon className="size-4 md:size-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('truncate text-lg font-semibold tabular-nums leading-tight md:text-xl', colorValue ? TONE_VALUE[tone] : 'text-foreground')}>
          {value}
        </p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </motion.div>
  )
}
