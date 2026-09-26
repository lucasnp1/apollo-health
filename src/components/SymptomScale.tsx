// The 0-5 rating row used by both check-in paths: the panel inside a logged
// injection, and the standalone check-in on the home page.

import { chipTone, type SymptomDef } from '../lib/symptoms'
import { cn } from '@/lib/utils'

const SCALE_TONE: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'border-emerald-500 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warn: 'border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-400',
  bad: 'border-destructive bg-destructive/12 text-destructive',
  neutral: 'border-foreground bg-accent text-foreground',
}

export function SymptomScale({ def, value, onChange }: { def: SymptomDef; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div className="grid grid-cols-[minmax(120px,1.5fr)_auto] items-center gap-4 py-1.5 max-md:grid-cols-1 max-md:gap-1">
      <span className="text-sm">{def.label}</span>
      <div className="flex gap-1 max-md:w-full" role="radiogroup" aria-label={def.label}>
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const selected = value === n
          const tone = selected ? chipTone(n, def.direction) : 'neutral'
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(
                'size-8 rounded-md border text-[13px] tabular-nums transition-colors max-md:flex-1',
                selected ? `font-semibold ${SCALE_TONE[tone]}` : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              // Tap the selected value again to clear it — leaving it blank means "fine".
              onClick={() => onChange(selected ? undefined : n)}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

