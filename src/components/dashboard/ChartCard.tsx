import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('flex flex-col rounded-xl border border-border bg-card p-6', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-5 tracking-[-0.006em] text-foreground">{title}</h3>
          {subtitle && <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {hero && (
        <div className="mt-3">
          <p className="text-2xl font-semibold tabular-nums leading-none">{hero}</p>
          {heroSub && <p className="mt-1.5 text-xs text-muted-foreground">{heroSub}</p>}
        </div>
      )}
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </motion.div>
  )
}
