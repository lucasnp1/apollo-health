import { useMemo } from 'react'
import { Brain } from 'lucide-react'
import type { Symptom } from '../lib/db'
import { ALL_SYMPTOMS, chipTone, type Direction } from '../lib/symptoms'
import { PanelCard, PanelEmpty } from './dashboard/PanelCard'
import { cn } from '@/lib/utils'

const TONE_TEXT: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
}

// One symptom's mini trend. Values are 1-5; y inverts so 5 sits at the top.
function Spark({ label, values, direction }: { label: string; values: number[]; direction: Direction }) {
  const latest = values[values.length - 1]
  const tone = chipTone(latest, direction)
  const W = 100
  const H = 30
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? W : (i / (values.length - 1)) * W
    const y = H - ((v - 1) / 4) * (H - 4) - 2
    return [x, y] as const
  })
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]

  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border border-border p-3', TONE_TEXT[tone])}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{latest}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={lx} cy={ly} r={2} fill="currentColor" />
      </svg>
    </div>
  )
}

export function SymptomTrends({ symptoms, className }: { symptoms: Symptom[]; className?: string }) {
  // Build a chronological (oldest→newest) value series per symptom, last 24.
  const series = useMemo(() => {
    const asc = symptoms.slice().sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    return ALL_SYMPTOMS.map((def) => {
      const values: number[] = []
      for (const s of asc) {
        const v = s[def.key]
        if (typeof v === 'number') values.push(v)
      }
      return { def, values: values.slice(-24) }
    }).filter((s) => s.values.length >= 2)
  }, [symptoms])

  return (
    <PanelCard className={className} title="Symptoms over time" subtitle="Each check-in you log with an injection · newest on the right">
      {series.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {series.map((s) => (
            <Spark key={s.def.key as string} label={s.def.label} values={s.values} direction={s.def.direction} />
          ))}
        </div>
      ) : (
        <PanelEmpty icon={Brain} title="No check-ins yet" detail="Add 'How do you feel?' when logging an injection to build these trends." />
      )}
    </PanelCard>
  )
}
