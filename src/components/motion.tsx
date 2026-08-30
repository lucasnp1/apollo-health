import { motion, useReducedMotion, type Transition } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

// One spring shared across the app so motion feels like a single system —
// fast, physical, purposeful. (transitions.dev ethos, built on our `motion` dep.)
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }

// Entrance props for a motion element; returns nothing when the viewer prefers
// reduced motion, so callers get a static element. `delay` staggers siblings.
export function revealProps(reduce: boolean, delay = 0, y = 10) {
  return reduce
    ? {}
    : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } }
}

// Hover-lift + press preset for interactive surfaces (launch cards, buttons).
// Spread onto a motion.* element. No-op visual weight; the spring carries it.
export const lift = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.98 },
  transition: spring,
}

/** Rise + fade wrapper. Skips motion under prefers-reduced-motion. */
export function Reveal({ children, delay = 0, y = 10, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div className={className} {...revealProps(reduce, delay, y)}>
      {children}
    </motion.div>
  )
}

/** Count-up to `value` on change (easeOutCubic). Static under reduced motion. */
export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const reduce = useReducedMotion() ?? false
  const [display, setDisplay] = useState(value)
  const from = useRef(value)

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
