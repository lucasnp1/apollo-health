import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// One Card per section — the single structural primitive for every view.
// Header carries an optional uppercase eyebrow + serif title + a right-aligned
// action slot; content sits directly inside (no nested boxes). This kills the
// old "white card with more cards inside" pattern.
export function SectionCard({
  eyebrow,
  title,
  action,
  children,
  className,
  contentClassName,
  bare = false,
}: {
  eyebrow?: ReactNode
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  /** Drop the default content padding-top (e.g. when content is a full-bleed chart). */
  bare?: boolean
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      {(title || eyebrow || action) && (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-5 pt-5 pb-4">
          <div className="min-w-0 space-y-0.5">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </p>
            )}
            {title && <h3 className="font-display text-lg font-semibold leading-tight">{title}</h3>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
        </CardHeader>
      )}
      <CardContent className={cn('px-5 pb-5', !title && !eyebrow && !action && 'pt-5', bare && 'p-0', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}

// Page-level responsive grid. Children opt into width with `md:col-span-*`
// on a 12-track grid; defaults to full width on mobile.
export function PageGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-12', className)}>{children}</div>
}

// Simple, flat empty state — centered icon + text, no dashed inner box.
export function EmptyHint({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="max-w-xs text-xs text-muted-foreground">{detail}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
