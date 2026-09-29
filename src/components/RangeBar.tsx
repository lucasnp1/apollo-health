// Horizontal range bar showing where a value sits against its lab range.
// One-sided ranges work too: a missing low pads from 0, a missing high pads
// from low × 2, and the band runs to that edge. Optional ghost dot for the
// previous value (in the same unit).
export function RangeBar({
  value,
  previous,
  low,
  high,
  className,
}: {
  value?: number
  previous?: number
  low?: number
  high?: number
  className?: string
}) {
  const lo = low ?? 0
  const hi = high ?? (low !== undefined ? low * 2 : undefined)
  if (value === undefined || hi === undefined || hi <= lo) return null
  const pad = (hi - lo) * 0.25 // visual headroom outside the band
  const min = low === undefined ? 0 : Math.max(0, lo - pad)
  const max = high === undefined ? hi : hi + pad
  const at = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
  const label = low !== undefined && high !== undefined ? `${low} to ${high}` : high !== undefined ? `under ${high}` : `over ${low}`

  return (
    <div className={['range-bar', className].filter(Boolean).join(' ')} role="img" aria-label={`Value ${value}, lab range ${label}`}>
      <div className="range-bar-fill" style={{ left: `${at(lo)}%`, right: `${100 - at(hi)}%` }} />
      {previous !== undefined && <span className="range-bar-ghost" style={{ left: `${at(previous)}%` }} />}
      <span className="range-bar-mark" style={{ left: `${at(value)}%` }} />
    </div>
  )
}
