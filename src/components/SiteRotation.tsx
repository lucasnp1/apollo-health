import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { TriangleAlert, X } from 'lucide-react'
import { db, type Compound, type InjectionLog } from '../lib/db'
import { mlFromDose, parseConcentrationMgPerMl } from '../lib/vials'
import { pickActiveVial } from '../lib/injections'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RouteGroup = 'IM' | 'SubQ' | 'Other'

const DAY = 86_400_000
const WINDOW_DAYS = 60 // volume/count totals cover the last 2 months

type SiteBucket = {
  site: string
  route: RouteGroup
  region: string
  side: 'L' | 'R' | null
  lastMs: number
  daysAgo: number
  count: number          // injections in window
  totalMl?: number       // undefined if any injection's volume couldn't be resolved
  injections: InjectionLog[]
}

const ROUTE_LABEL: Record<RouteGroup, string> = {
  IM: 'Intramuscular', SubQ: 'Subcutaneous', Other: 'Other',
}
const ROUTE_TEXT: Record<RouteGroup, string> = {
  IM: 'text-amber-700 dark:text-amber-400',
  SubQ: 'text-blue-600 dark:text-blue-400',
  Other: 'text-muted-foreground',
}
const ROUTE_DOT: Record<RouteGroup, string> = {
  IM: 'bg-amber-500',
  SubQ: 'bg-blue-500',
  Other: 'bg-muted-foreground',
}

function routeOf(inj: InjectionLog): RouteGroup {
  return inj.route === 'SubQ' ? 'SubQ' : inj.route === 'IM' || !inj.route ? 'IM' : 'Other'
}

// Region + side from a site name, e.g. "Ventrogluteal R" → { region: "Ventrogluteal", side: "R" }.
function splitSite(site: string): { region: string; side: 'L' | 'R' | null } {
  const m = site.match(/^(.*?)\s+([LR])$/)
  return m ? { region: m[1], side: m[2] as 'L' | 'R' } : { region: site, side: null }
}

function volLabel(b: SiteBucket): string {
  if (b.totalMl !== undefined && b.totalMl > 0) return `${b.totalMl.toFixed(b.totalMl < 10 ? 1 : 0)} mL`
  return `${b.count}×`
}

export function SiteRotation({
  injections,
  compounds,
}: {
  injections: InjectionLog[]
  compounds?: Compound[]
}) {
  const [now] = useState(() => Date.now())
  const [selectedSite, setSelectedSite] = useState<string | null>(null)
  const vials = useLiveQuery(() => db.vials.toArray(), [], [])

  const compoundMap = useMemo(
    () => new Map((compounds ?? []).map((c) => [c.id!, c])),
    [compounds],
  )

  // Resolve an injection's drawn volume (mL) using vial → active-vial → compound concentration.
  const injMl = useMemo(() => {
    const vialById = new Map((vials ?? []).map((v) => [v.id, v]))
    return (inj: InjectionLog): number | undefined => {
      if (inj.dose === undefined) return undefined
      const conc =
        (inj.vialId !== undefined ? vialById.get(inj.vialId)?.concentrationMgPerMl : undefined) ??
        (vials ? pickActiveVial(vials, inj.compoundId)?.concentrationMgPerMl : undefined) ??
        parseConcentrationMgPerMl(compoundMap.get(inj.compoundId)?.concentration)
      return mlFromDose(inj.dose, inj.unit, conc)
    }
  }, [vials, compoundMap])

  const buckets = useMemo<SiteBucket[]>(() => {
    const cutoff = now - WINDOW_DAYS * DAY
    const map = new Map<string, SiteBucket>()
    for (const inj of injections) {
      if (!inj.site) continue
      const route = routeOf(inj)
      const key = `${inj.site}||${route}`
      const { region, side } = splitSite(inj.site)
      let b = map.get(key)
      if (!b) {
        b = { site: inj.site, route, region, side, lastMs: 0, daysAgo: Infinity, count: 0, totalMl: 0, injections: [] }
        map.set(key, b)
      }
      b.injections.push(inj)
      const t = new Date(inj.takenAt).getTime()
      if (t > b.lastMs) b.lastMs = t
      if (t >= cutoff) {
        b.count += 1
        const ml = injMl(inj)
        if (ml === undefined) b.totalMl = undefined
        else if (b.totalMl !== undefined) b.totalMl += ml
      }
    }
    return [...map.values()]
      .map((b) => ({
        ...b,
        daysAgo: (now - b.lastMs) / DAY,
        injections: b.injections.sort((a, c) => c.takenAt.localeCompare(a.takenAt)),
      }))
      .sort((a, b) => b.lastMs - a.lastMs)
  }, [injections, now, injMl])

  // Overused = far above the typical bucket. Uses count in-window.
  const overusedThreshold = useMemo(() => {
    const counts = buckets.map((b) => b.count).filter((c) => c > 0).sort((a, b) => a - b)
    if (counts.length === 0) return Infinity
    const median = counts[Math.floor(counts.length / 2)]
    return Math.max(3, median * 3)
  }, [buckets])

  // Overall left/right balance (in-window). Prefer mL, fall back to count.
  const balance = useMemo(() => {
    let left = 0, right = 0
    let byVolume = true
    for (const b of buckets) {
      if (b.side === null || b.count === 0) continue
      const amount = b.totalMl
      if (amount === undefined) byVolume = false
    }
    for (const b of buckets) {
      if (b.side === null || b.count === 0) continue
      const amount = byVolume ? (b.totalMl ?? 0) : b.count
      if (b.side === 'L') left += amount
      else right += amount
    }
    const total = left + right
    if (total === 0) return null
    return { left, right, total, rightPct: right / total, byVolume }
  }, [buckets])

  function recencyClass(daysAgo: number) {
    if (daysAgo < 2) return 'border-destructive/50 bg-destructive/10 text-destructive'
    if (daysAgo < 4) return 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    if (daysAgo < 7) return 'border-amber-500/30 bg-amber-500/5'
    return 'border-border bg-secondary/50'
  }

  function daysLabel(daysAgo: number): string {
    if (!Number.isFinite(daysAgo)) return '—'
    if (daysAgo < 0.5) return 'today'
    if (daysAgo < 1.5) return '1d'
    return `${Math.round(daysAgo)}d`
  }

  const selectedBucket = selectedSite ? buckets.find((b) => `${b.site}||${b.route}` === selectedSite) : null

  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">Log injections to track site rotation.</p>
  }

  const imbalanced = balance && (balance.rightPct > 0.62 || balance.rightPct < 0.38)

  function RouteSection({ group }: { group: RouteGroup }) {
    const sites = buckets.filter((b) => b.route === group)
    if (sites.length === 0) return null
    return (
      <div>
        <div className={cn('mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider', ROUTE_TEXT[group])}>
          <span className={cn('size-1.5 rounded-full', ROUTE_DOT[group])} />
          {ROUTE_LABEL[group]}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sites.map((b) => {
            const overused = b.count >= overusedThreshold
            const key = `${b.site}||${b.route}`
            return (
              <button
                key={key}
                type="button"
                className={cn(
                  'flex items-baseline gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:brightness-95',
                  recencyClass(b.daysAgo),
                  overused && 'ring-1 ring-destructive/60',
                )}
                onClick={() => setSelectedSite(selectedSite === key ? null : key)}
              >
                {overused && <TriangleAlert className="size-3 shrink-0 text-destructive" />}
                {b.site}
                {b.count > 0 && <span className="font-mono tabular-nums opacity-90">{volLabel(b)}</span>}
                <small className="text-[10px] font-normal opacity-70">{daysLabel(b.daysAgo)}</small>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Left/right balance headline — the "you favored your right side" callout */}
      {balance && (
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className={cn(balance.rightPct < 0.38 && 'text-destructive')}>
              Left {Math.round((1 - balance.rightPct) * 100)}%
            </span>
            <span className="text-muted-foreground">Body-side balance · {WINDOW_DAYS}d</span>
            <span className={cn(balance.rightPct > 0.62 && 'text-destructive')}>
              Right {Math.round(balance.rightPct * 100)}%
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
            <div className="bg-blue-500/70" style={{ width: `${(1 - balance.rightPct) * 100}%` }} />
            <div className="bg-amber-500/70" style={{ width: `${balance.rightPct * 100}%` }} />
          </div>
          {imbalanced && (
            <p className="text-[11px] text-muted-foreground">
              {balance.rightPct > 0.62 ? 'Right' : 'Left'} side is doing most of the work — spread doses to the other side.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <RouteSection group="IM" />
        <RouteSection group="SubQ" />
        <RouteSection group="Other" />
      </div>

      {/* Selected site detail */}
      {selectedBucket && (
        <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold">
              {selectedBucket.site} · {selectedBucket.count} in {WINDOW_DAYS}d
              {selectedBucket.totalMl !== undefined && selectedBucket.totalMl > 0 ? ` · ${selectedBucket.totalMl.toFixed(1)} mL` : ''}
            </span>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => setSelectedSite(null)} aria-label="Close">
              <X className="size-3" />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {selectedBucket.injections.slice(0, 6).map((inj) => {
              const compound = compoundMap.get(inj.compoundId)
              return (
                <div key={inj.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                    {format(parseISO(inj.takenAt), 'MMM d')}
                  </span>
                  <span className="whitespace-nowrap font-semibold" style={{ color: compound?.color ?? 'inherit' }}>
                    {compound?.name ?? '—'}
                  </span>
                  <span className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
                    {inj.dose} {inj.unit}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Red = used recently · ⚠ = overused · amounts are last {WINDOW_DAYS}d. Tap a site for detail.
      </p>
    </>
  )
}
