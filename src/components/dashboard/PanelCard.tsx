import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Generic dashboard card for tables / lists / forms. Horizon anatomy:
 * rounded-2xl, p-5, header row with bold title + optional action slot.
 */
export function PanelCard({
  title,
  subtitle,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('rounded-2xl border bg-card p-5', className)}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="font-display text-xl font-semibold leading-tight">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </motion.div>
  )
}

/** Flat empty state for panel interiors. */
export function PanelEmpty({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: LucideIcon
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="max-w-xs text-xs text-muted-foreground">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
