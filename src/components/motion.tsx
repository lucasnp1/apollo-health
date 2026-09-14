import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

// Motion is CSS-only. An animation library on the critical path bought us one
// mount transition per card, so the springs now live in `.reveal` / `.lift`
// (src/index.css) and reduced-motion is handled by a media query there.

function revealStyle(delay: number, y: number): CSSProperties {
  return { '--reveal-delay': `${delay}s`, '--reveal-y': `${y}px` } as CSSProperties
}

/** Rise + fade wrapper. Static under prefers-reduced-motion. */
export function Reveal({ children, delay = 0, y = 10, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <div className={className ? `reveal ${className}` : 'reveal'} style={revealStyle(delay, y)}>
      {children}
    </div>
  )
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Count-up to `value` (easeOutCubic). Static under reduced motion. Set
 *  `animateOnMount` to count up from 0 the first time it appears. */
export function AnimatedNumber({ value, decimals = 0, className, animateOnMount = false }: { value: number; decimals?: number; className?: string; animateOnMount?: boolean }) {
  const reduce = prefersReducedMotion()
  const [display, setDisplay] = useState(() => (animateOnMount && !reduce ? 0 : value))
  const from = useRef(animateOnMount && !reduce ? 0 : value)

  useEffect(() => {
    if (reduce || from.current === value) { setDisplay(value); from.current = value; return }
    const start = performance.now()
    const a = from.current
    const b = value
    from.current = value
    const dur = 500
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(a + (b - a) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduce])

  return <span className={className}>{display.toFixed(decimals)}</span>
}
