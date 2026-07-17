/**
 * HeroCard — adaptation of jatin-yadav05's showcase-card-1 for the
 * Overview hero. Rounded-3xl near-black card, motion entrance, hover
 * lift (scale 1.01) with a yellow glow, gradient serif headline, and a
 * circular primary action button (arrow, glow on hover).
 */
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function HeroCard({
  eyebrow,
  icon: Icon,
  title,
  subtitle,
  body,
  onAction,
  actionLabel,
  secondary,
  className,
}: {
  eyebrow?: string
  icon?: LucideIcon
  /** Big gradient headline — keep to 1-3 words per line. */
  title: ReactNode
  subtitle?: ReactNode
  body?: ReactNode
  onAction?: () => void
  actionLabel?: string
  /** Extra slot rendered under the body (e.g. a Skip button). */
  secondary?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-6',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          {Icon && <Icon className="size-4" />}
          {eyebrow && <span className="text-[11px] font-medium uppercase tracking-wider">{eyebrow}</span>}
        </div>
        {onAction && (
          <button
            type="button"
            aria-label={actionLabel ?? 'Open'}
            title={actionLabel}
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={onAction}
          >
            <ArrowUpRight className="size-5" />
          </button>
        )}
      </div>

      <p className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.011em] text-foreground">
        {title}
      </p>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      {body && <div className="mt-4 flex-1 text-sm">{body}</div>}
      {secondary && <div className="mt-4">{secondary}</div>}
    </motion.div>
  )
}
