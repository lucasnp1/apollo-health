import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Horizon-style dashboard grid. Children opt into width with
 * `md:col-span-*` / `xl:col-span-*` on a 6-track desktop grid:
 *   xl:col-span-2 → third, xl:col-span-3 → half, xl:col-span-6 → full.
 */
export function DashGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6', className)}>
      {children}
    </div>
  )
}

/**
 * Top KPI row — auto-fits as many cards as the viewport can hold, with a
 * sensible minimum so phones get 2-up and desktops get 4–6-up regardless of
 * how many StatCards a view chooses to render. Removes the "4 cards in a
 * 6-track grid leaves a gap" awkwardness.
 */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('grid gap-5 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]', className)}
    >
      {children}
    </div>
  )
}
