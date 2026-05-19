// Horizontal range bar showing where the user's value sits within a low–high band.
// Optional ghost dot for the previous value.
export function RangeBar({
  value,
  previous,
  low,
  high,
}: {
  value?: number
  previous?: number
  low?: number
  high?: number
}) {
  if (value === undefined || low === undefined || high === undefined || high <= low) {
    return <div className="range-bar" />
  }
  const span = high - low
  const padded = span * 0.25 // visual headroom outside the reference band
  const min = low - padded
  const max = high + padded
  const pos = ((value - min) / (max - min)) * 100
  const ghost = previous !== undefined ? ((previous - min) / (max - min)) * 100 : undefined

  return (
    <div className="range-bar" role="img" aria-label={`Value ${value}, reference ${low} to ${high}`}>
      <div className="range-bar-fill" />
      {ghost !== undefined && (
        <span className="range-bar-ghost" style={{ left: `${Math.max(0, Math.min(100, ghost))}%` }} />
      )}
      <span className="range-bar-mark" style={{ left: `${Math.max(0, Math.min(100, pos))}%` }} />
    </div>
  )
}
