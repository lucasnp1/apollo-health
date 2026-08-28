import { useEffect, useState } from 'react'

// Height (px) the on-screen keyboard currently overlaps the bottom of the
// window. Zero when no keyboard is up (and on desktop).
//
// On iOS the layout viewport does NOT shrink when the keyboard opens — only the
// visual viewport does — so a `position: fixed; bottom: 0` footer ends up behind
// the keyboard. Measuring `innerHeight - visualViewport.height - offsetTop`
// gives the keyboard's height so callers can lift the footer above it. On
// Android (where the layout viewport usually resizes) this reads ~0, which is
// correct — the footer is already above the keyboard there.
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      // Ignore sub-pixel noise and the small chrome resizes that aren't a keyboard.
      setInset(overlap > 80 ? Math.round(overlap) : 0)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
