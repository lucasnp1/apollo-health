import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { X } from 'lucide-react'
import type { Compound, InjectionLog } from '../lib/db'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RouteGroup = 'IM' | 'SubQ' | 'Other'

type SiteEntry = {
  site: string
  route: RouteGroup
  lastMs: number
  daysAgo: number
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

export function SiteRotation({
  injections,
  compounds,
}: {
  injections: InjectionLog[]
  recentSites?: string[]
  compounds?: Compound[]
}) {
  const [now] = useState(() => Date.now())
  const [selectedSite, setSelectedSite] = useState<string | null>(null)

  const compoundMap = useMemo(
    () => new Map((compounds ?? []).map(c => [c.id!, c])),
    [compounds],
  )

  const siteEntries = useMemo<SiteEntry[]>(() => {
    const map = new Map<string, { lastMs: number; route: RouteGroup; injections: InjectionLog[] }>()

    for (const inj of injections) {
      if (!inj.site) continue
      const route: RouteGroup = inj.route === 'SubQ' ? 'SubQ' : inj.route === 'IM' || !inj.route ? 'IM' : 'Other'
      const key = `${inj.site}||${route}`
      const t = new Date(inj.takenAt).getTime()
      const cur = map.get(key)
      if (!cur) {
        map.set(key, { lastMs: t, route, injections: [inj] })
      } else {
        if (t > cur.lastMs) cur.lastMs = t
        cur.injections.push(inj)
      }
    }

    return [...map.entries()]
      .map(([key, { lastMs, route, injections: injs }]) => ({
        site: key.split('||')[0],
        route,
        lastMs,
        daysAgo: (now - lastMs) / (1000 * 60 * 60 * 24),
        injections: injs.sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
      }))
      .sort((a, b) => b.lastMs - a.lastMs)
  }, [injections, now])

  // Recency tint — hotter = used more recently (avoid re-injecting there).
  function recencyClass(daysAgo: number) {
    if (daysAgo < 1.5) return 'border-destructive/50 bg-destructive/10 text-destructive'
    if (daysAgo < 3.5) return 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    if (daysAgo < 7)   return 'border-amber-500/30 bg-amber-500/5'
    return 'border-border bg-secondary/50'
  }

  function daysLabel(daysAgo: number): string {
    if (daysAgo < 0.5) return 'today'
    if (daysAgo < 1.5) return '1d'
    return `${Math.round(daysAgo)}d`
  }

  const imSites    = siteEntries.filter(e => e.route === 'IM')
  const subqSites  = siteEntries.filter(e => e.route === 'SubQ')
  const otherSites = siteEntries.filter(e => e.route === 'Other')
  const selectedEntry = selectedSite ? siteEntries.find(e => e.site + '||' + e.route === selectedSite) : null

  // Headerless — the parent card supplies the title.
  if (siteEntries.length === 0) {
    return <p className="text-sm text-muted-foreground">Log injections to track site rotation.</p>
  }

  function RouteSection({ group, sites }: { group: RouteGroup; sites: SiteEntry[] }) {
    if (sites.length === 0) return null
    return (
      <div>
        <div className={cn('mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider', ROUTE_TEXT[group])}>
          <span className={cn('size-1.5 rounded-full', ROUTE_DOT[group])} />
          {ROUTE_LABEL[group]}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sites.map((entry) => (
            <button
              key={`${entry.site}-${entry.route}`}
              type="button"
              className={cn(
                'flex items-baseline gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:brightness-95',
                recencyClass(entry.daysAgo),
              )}
              onClick={() => setSelectedSite(
                selectedSite === entry.site + '||' + entry.route ? null : entry.site + '||' + entry.route
              )}
            >
              {entry.site}
              <small className="text-[10px] font-normal opacity-70">{daysLabel(entry.daysAgo)}</small>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <RouteSection group="IM"    sites={imSites} />
        <RouteSection group="SubQ"  sites={subqSites} />
        <RouteSection group="Other" sites={otherSites} />
      </div>

      {/* Injection detail panel */}
      {selectedEntry && (
        <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold">
              {selectedEntry.site} · last {selectedEntry.injections.length} injection{selectedEntry.injections.length !== 1 ? 's' : ''}
            </span>
            <Button variant="ghost" size="icon" className="size-6" onClick={() => setSelectedSite(null)} aria-label="Close">
              <X className="size-3" />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {selectedEntry.injections.slice(0, 5).map(inj => {
              const compound = compoundMap.get(inj.compoundId)
              return (
                <div key={inj.id} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                    {format(parseISO(inj.takenAt), 'MMM d')}
                  </span>
                  <span className="whitespace-nowrap font-semibold" style={{ color: compound?.color ?? 'inherit' }}>
                    {compound?.name ?? '—'}
                  </span>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {inj.dose} {inj.unit}
                  </span>
                  {inj.route && (
                    <span className="text-[10px] text-muted-foreground">{inj.route}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Red = used recently. Tap a site for details.
      </p>
    </>
  )
}
