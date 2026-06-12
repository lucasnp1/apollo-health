import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatTone = 'primary' | 'good' | 'bad' | 'info' | 'neutral'

// Horizon MiniStatistics anatomy: icon in a tinted circle on the left,
// muted label + bold value on the right.
const TONE_CIRCLE: Record<StatTone, string> = {
  primary: 'bg-primary/15 text-primary',
  good:    'bg-emerald-500/15 text-emerald-500',
  bad:     'bg-destructive/15 text-destructive',
  info:    'bg-blue-500/15 text-blue-400',
  neutral: 'bg-secondary text-muted-foreground',
}

const TONE_VALUE: Record<StatTone, string> = {
  primary: 'text-foreground',
  good:    'text-emerald-500',
  bad:     'text-destructive',
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className={cn('flex items-center gap-3 rounded-2xl border bg-card px-4 py-4 md:gap-4 md:px-5', className)}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-full md:size-12', TONE_CIRCLE[tone])}>
        <Icon className="size-4 md:size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('truncate font-mono text-lg font-semibold tabular-nums leading-tight md:text-xl', colorValue ? TONE_VALUE[tone] : 'text-foreground')}>
          {value}
        </p>
        {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </motion.div>
  )
}
