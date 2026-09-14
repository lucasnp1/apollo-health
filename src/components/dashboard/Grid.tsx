import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Horizon-style dashboard grid. Children opt into width with
 * `md:col-span-*` / `xl:col-span-*` on a 6-track desktop grid:
 *   xl:col-span-2 → third, xl:col-span-3 → half, xl:col-span-6 → full.
 */
export function DashGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-6', className)}>
      {children}
    </div>
  )
}
