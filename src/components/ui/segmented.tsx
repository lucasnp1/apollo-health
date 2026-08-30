import { useId, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Segmented control with a spring-sliding active pill (shared-layout motion).
 * Replaces the copy of this that lived in AddInjection / ActiveLevels / Timeline.
 * Keeps keyboard/focus behaviour of plain buttons.
 */
export function Segmented<T extends string>({
  value, options, onChange, size = 'md', className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  const groupId = useId()
  const reduce = useReducedMotion() ?? false
  return (
    <div className={cn('inline-flex rounded-[var(--radius-md)] bg-muted p-1', className)}>
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-[calc(var(--radius-md)-0.25rem)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'flex-1 px-3 py-2 text-sm',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={reduce ? undefined : `seg-${groupId}`}
                className="absolute inset-0 rounded-[calc(var(--radius-md)-0.25rem)] bg-background shadow-[var(--shadow-card)]"
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
