import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  detail,
  tone,
  spark,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: 'good' | 'warn' | 'bad'
  spark?: ReactNode
}) {
  return (
    <div className={tone ? `stat ${tone}` : 'stat'}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {spark}
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  )
}
