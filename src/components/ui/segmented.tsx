import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Segmented control with a sliding active pill.
 * Replaces the copy of this that lived in AddInjection / ActiveLevels / Timeline.
 * Keeps keyboard/focus behaviour of plain buttons.
 *
 * The pill is one absolutely positioned span moved with a CSS transform, sized
 * from the active button's box. That used to be a shared-layout animation from
 * an animation library, which meant shipping that library on every page.
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
  const track = useRef<HTMLDivElement>(null)
  // `slide` is false for the first placement so the pill appears where it
  // belongs instead of flying in from the left.
  const [box, setBox] = useState<{ x: number; w: number; slide: boolean } | null>(null)

  const index = options.findIndex((o) => o.value === value)

  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    const measure = () => {
      const active = el.querySelector<HTMLElement>('[data-active="1"]')
      if (!active) { setBox(null); return }
      const x = active.offsetLeft - el.clientLeft
      const w = active.offsetWidth
      setBox((prev) => (prev && prev.x === x && prev.w === w ? prev : { x, w, slide: prev !== null }))
    }
    measure()
    // Widths change with the container (flex-1 options) and with label text.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [index, options.length])

  return (
    <div ref={track} className={cn('relative inline-flex rounded-[var(--radius-md)] bg-muted p-1', className)}>
      {box && (
        <span
          aria-hidden
          className="seg-pill"
          data-first={box.slide ? '0' : '1'}
          style={{ '--seg-x': `${box.x}px`, '--seg-w': `${box.w}px` } as CSSProperties}
        />
      )}
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            data-active={active ? '1' : '0'}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 rounded-[calc(var(--radius-md)-0.25rem)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'flex-1 px-3 py-2 text-sm',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
