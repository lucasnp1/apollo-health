import { useMemo } from 'react'
import { Brain } from 'lucide-react'
import type { Symptom } from '../lib/db'
import { ALL_SYMPTOMS, chipTone } from '../lib/symptoms'
import { PanelCard, PanelEmpty } from './dashboard/PanelCard'

const DAY = 86_400_000

// A plain "how has the last week been" digest: how many good vs watch signals
// you logged, and exactly which symptoms they were — far more useful than a
// wall of tiny sparklines.
export function SymptomSummary({ symptoms, className }: { symptoms: Symptom[]; className?: string }) {
  const digest = useMemo(() => {
    const cutoff = Date.now() - 7 * DAY
    const recent = symptoms.filter((s) => new Date(s.recordedAt).getTime() >= cutoff)

    let goodCount = 0
    let watchCount = 0
    for (const s of recent) {
      for (const def of ALL_SYMPTOMS) {
        const v = s[def.key]
        if (typeof v !== 'number') continue
        const t = chipTone(v, def.direction)
        if (t === 'good') goodCount += 1
        else if (t === 'bad' || t === 'warn') watchCount += 1
      }
    }

    // Per-symptom average + spikes → which symptoms land in each bucket.
    const per = ALL_SYMPTOMS.map((def) => {
      const vals: number[] = []
      for (const s of recent) { const v = s[def.key]; if (typeof v === 'number') vals.push(v) }
      if (vals.length === 0) return null
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      return { def, avg, vals }
    }).filter(Boolean) as Array<{ def: (typeof ALL_SYMPTOMS)[number]; avg: number; vals: number[] }>

    const good = per.filter((x) => x.def.direction === 'positive' && x.avg >= 3.5)
    // Watch: a side-effect that's present on average OR spiked at least once,
    // or a positive that ran low.
    const watch = per.filter((x) =>
      x.def.direction === 'negative'
        ? x.avg >= 3.5 || x.vals.some((v) => v >= 4)
        : x.avg <= 2.5,
    )

    return { checkIns: recent.length, goodCount, watchCount, good, watch }
  }, [symptoms])

  return (
    <PanelCard className={className} title="How you've been" subtitle={`Last 7 days · ${digest.checkIns} check-in${digest.checkIns === 1 ? '' : 's'}`}>
      {digest.checkIns === 0 ? (
        <PanelEmpty icon={Brain} title="No check-ins this week" detail="Add 'How do you feel?' when logging an injection to build this." />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Headline counts */}
          <div className="flex gap-6">
            <div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{digest.goodCount}</p>
              <p className="text-xs text-muted-foreground">good signals</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-destructive">{digest.watchCount}</p>
              <p className="text-xs text-muted-foreground">to watch</p>
            </div>
          </div>

          {/* Which symptoms */}
          {digest.good.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Feeling good
              </p>
              <div className="flex flex-wrap gap-2">
                {digest.good.map((x) => (
                  <span key={x.def.key as string} className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {x.def.label}<small className="tabular-nums opacity-70">{x.avg.toFixed(1)}</small>
                  </span>
                ))}
              </div>
            </div>
          )}

          {digest.watch.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" /> To watch
              </p>
              <div className="flex flex-wrap gap-2">
                {digest.watch.map((x) => (
                  <span key={x.def.key as string} className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/8 px-3 py-1 text-sm font-medium text-destructive">
                    {x.def.label}<small className="tabular-nums opacity-70">{x.avg.toFixed(1)}</small>
                  </span>
                ))}
              </div>
            </div>
          )}

          {digest.good.length === 0 && digest.watch.length === 0 && (
            <p className="text-sm text-muted-foreground">Mostly steady — nothing notable stood out this week.</p>
          )}
        </div>
      )}
    </PanelCard>
  )
}
