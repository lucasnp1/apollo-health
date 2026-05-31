import { useMemo, useState } from 'react'
import type { InjectionLog } from '../lib/db'

type RouteGroup = 'IM' | 'SubQ' | 'Other'

type SiteEntry = {
  site: string
  route: RouteGroup
  lastMs: number
  daysAgo: number
}

const ROUTE_LABEL: Record<RouteGroup, string> = {
  IM:    'Intramuscular',
  SubQ:  'Subcutaneous',
  Other: 'Other',
}

const ROUTE_COLOR: Record<RouteGroup, string> = {
  IM:    'var(--accent)',
  SubQ:  'var(--info, #3b82f6)',
  Other: 'var(--ink-mute)',
}

export function SiteRotation({ injections }: { injections: InjectionLog[]; recentSites?: string[] }) {
  const [now] = useState(() => Date.now())

  const siteEntries = useMemo<SiteEntry[]>(() => {
    // Track last-use per (site + route) combo
    const map = new Map<string, { lastMs: number; route: RouteGroup }>()

    for (const inj of injections) {
      if (!inj.site) continue
      const route: RouteGroup = inj.route === 'SubQ' ? 'SubQ'
        : inj.route === 'IM' || !inj.route ? 'IM'
        : 'Other'
      const key = `${inj.site}||${route}`
      const t = new Date(inj.takenAt).getTime()
      const cur = map.get(key)
      if (!cur || t > cur.lastMs) map.set(key, { lastMs: t, route })
    }

    return [...map.entries()]
      .map(([key, { lastMs, route }]) => ({
        site: key.split('||')[0],
        route,
        lastMs,
        daysAgo: (now - lastMs) / (1000 * 60 * 60 * 24),
      }))
      .sort((a, b) => b.lastMs - a.lastMs)  // most recent first
  }, [injections, now])

  function recencyClass(daysAgo: number) {
    if (daysAgo < 1.5) return 'recent-1'
    if (daysAgo < 3.5) return 'recent-3'
    if (daysAgo < 7)   return 'recent-7'
    return ''
  }

  function daysLabel(daysAgo: number): string {
    if (daysAgo < 0.5) return 'today'
    if (daysAgo < 1.5) return '1d'
    return `${Math.round(daysAgo)}d`
  }

  // Group by route
  const imSites    = siteEntries.filter(e => e.route === 'IM')
  const subqSites  = siteEntries.filter(e => e.route === 'SubQ')
  const otherSites = siteEntries.filter(e => e.route === 'Other')

  if (siteEntries.length === 0) {
    return (
      <>
        <div className="panel-header">
          <div><span className="section-label">Rotation</span><h3>Site history</h3></div>
        </div>
        <p className="panel-note">Log injections to track site rotation.</p>
        <p className="panel-note" style={{ marginTop: 4 }}>
          Red = used recently. Rotate to avoid scar tissue.
        </p>
      </>
    )
  }

  function RouteSection({ group, sites }: { group: RouteGroup; sites: SiteEntry[] }) {
    if (sites.length === 0) return null
    return (
      <div className="site-route-group">
        <div className="site-route-label" style={{ color: ROUTE_COLOR[group] }}>
          <span className="site-route-dot" style={{ background: ROUTE_COLOR[group] }} />
          {ROUTE_LABEL[group]}
        </div>
        <div className="body-diagram">
          {sites.map((entry) => (
            <div key={`${entry.site}-${entry.route}`} className={`body-cell ${recencyClass(entry.daysAgo)}`}>
              {entry.site}
              <small>{daysLabel(entry.daysAgo)}</small>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="panel-header">
        <div><span className="section-label">Rotation</span><h3>Site history</h3></div>
      </div>

      <div className="site-rotation-body">
        <RouteSection group="IM"    sites={imSites} />
        <RouteSection group="SubQ"  sites={subqSites} />
        <RouteSection group="Other" sites={otherSites} />
      </div>

      <p className="panel-note" style={{ marginTop: 8 }}>
        Red = used recently. Rotate to avoid scar tissue.
      </p>
    </>
  )
}
