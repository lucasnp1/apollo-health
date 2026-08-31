import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { revealProps } from '../motion'

/**
 * Chart container card — Horizon's "This month" pattern: header row with
 * title/subtitle + control slot, optional hero number block, then the
 * chart itself.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  hero,
  heroSub,
  children,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  /** Big headline number (e.g. latest BP, current release level). */
  hero?: ReactNode
  heroSub?: ReactNode
  children: ReactNode
  className?: string
}) {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div
      {...revealProps(reduce)}
      className={cn('flex flex-col rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]', className)}
    >
      {/* On mobile the control drops to its own row so it can never squeeze the
          title into a wrap; from sm up it sits inline on the right. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-5 tracking-[-0.01em] text-foreground">{title}</h3>
          {subtitle && <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {hero && (
        <div className="mt-3">
          <p className="font-mono text-2xl font-semibold tabular-nums leading-none">{hero}</p>
          {heroSub && <p className="mt-1.5 text-xs text-muted-foreground">{heroSub}</p>}
        </div>
      )}
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </motion.div>
  )
}
