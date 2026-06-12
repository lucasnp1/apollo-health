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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-3xl border bg-card p-6 transition-shadow duration-300 hover:glow-primary',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          {Icon && <Icon className="size-5" />}
          {eyebrow && <span className="text-[11px] font-semibold uppercase tracking-wider">{eyebrow}</span>}
        </div>
        {onAction && (
          <motion.button
            type="button"
            aria-label={actionLabel ?? 'Open'}
            title={actionLabel}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
            whileHover={{ scale: 1.1, boxShadow: '0 0 18px oklch(0.845 0.118 90 / 55%)' }}
            whileTap={{ scale: 0.95 }}
            onClick={onAction}
          >
            <ArrowUpRight className="size-5" />
          </motion.button>
        )}
      </div>

      <motion.p
        className="mt-4 font-display text-4xl font-semibold leading-[1.05] text-gradient-gold"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45 }}
      >
        {title}
      </motion.p>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      {body && <div className="mt-4 flex-1 text-sm">{body}</div>}
      {secondary && <div className="mt-4">{secondary}</div>}
    </motion.div>
  )
}
