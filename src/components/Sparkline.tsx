// Tiny inline SVG sparkline — no chart library overhead.
export function Sparkline({
  values,
  width = 100,
  height = 32,
  stroke = 'var(--accent)',
  fill = 'rgba(94,234,212,0.12)',
}: {
  values: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
}) {
  if (values.length < 2) {
    return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  const points = values.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y] as const
  })
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${path} L ${width} ${height} L 0 ${height} Z`
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={fill} />
      <path d={path} stroke={stroke} strokeWidth={1.5} fill="none" />
    </svg>
  )
}
