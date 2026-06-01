import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { X } from 'lucide-react'
import type { Compound, InjectionLog } from '../lib/db'

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
const ROUTE_COLOR: Record<RouteGroup, string> = {
  IM: 'var(--accent)', SubQ: 'var(--info, #3b82f6)', Other: 'var(--ink-mute)',
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

  const imSites    = siteEntries.filter(e => e.route === 'IM')
  const subqSites  = siteEntries.filter(e => e.route === 'SubQ')
  const otherSites = siteEntries.filter(e => e.route === 'Other')
  const selectedEntry = selectedSite ? siteEntries.find(e => e.site + '||' + e.route === selectedSite) : null

  if (siteEntries.length === 0) {
    return (
      <>
        <div className="panel-header">
          <div><span className="section-label">Rotation</span><h3>Site history</h3></div>
        </div>
        <p className="panel-note">Log injections to track site rotation.</p>
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
            <button
              key={`${entry.site}-${entry.route}`}
              type="button"
              className={`body-cell ${recencyClass(entry.daysAgo)}`}
              onClick={() => setSelectedSite(
                selectedSite === entry.site + '||' + entry.route ? null : entry.site + '||' + entry.route
              )}
            >
              {entry.site}
              <small>{daysLabel(entry.daysAgo)}</small>
            </button>
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

      {/* Injection detail panel */}
      {selectedEntry && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
              {selectedEntry.site} · last {selectedEntry.injections.length} injection{selectedEntry.injections.length !== 1 ? 's' : ''}
            </span>
            <button type="button" className="icon-button" style={{ width: 24, height: 24 }} onClick={() => setSelectedSite(null)} aria-label="Close">
              <X size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selectedEntry.injections.slice(0, 5).map(inj => {
              const compound = compoundMap.get(inj.compoundId)
              return (
                <div key={inj.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-mute)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {format(parseISO(inj.takenAt), 'MMM d')}
                  </span>
                  <span style={{ fontWeight: 600, color: compound?.color ?? 'var(--accent)', whiteSpace: 'nowrap' }}>
                    {compound?.name ?? '—'}
                  </span>
                  <span style={{ color: 'var(--ink-dim)', whiteSpace: 'nowrap' }}>
                    {inj.dose} {inj.unit}
                  </span>
                  {inj.route && (
                    <span style={{ color: 'var(--ink-mute)', fontSize: 10 }}>{inj.route}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="panel-note" style={{ marginTop: 6 }}>
        Red = used recently. Tap a site for details.
      </p>
    </>
  )
}
