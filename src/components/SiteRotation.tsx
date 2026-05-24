import { useMemo, useState } from 'react'
import type { InjectionLog } from '../lib/db'

export function SiteRotation({ injections, recentSites }: { injections: InjectionLog[]; recentSites: string[] }) {
  const [now] = useState(() => Date.now())
  const lastUseBySite = useMemo(() => {
    const map = new Map<string, number>()
    for (const inj of injections) {
      if (!inj.site) continue
      const t = new Date(inj.takenAt).getTime()
      const cur = map.get(inj.site)
      if (cur === undefined || t > cur) map.set(inj.site, t)
    }
    return map
  }, [injections])

  function tone(site: string) {
    const t = lastUseBySite.get(site)
    if (!t) return ''
    const days = (now - t) / (1000 * 60 * 60 * 24)
    if (days < 1.5) return 'recent-1'
    if (days < 3.5) return 'recent-3'
    if (days < 7) return 'recent-7'
    return ''
  }

  function daysAgo(site: string): string | null {
    const t = lastUseBySite.get(site)
    if (!t) return null
    const days = Math.round((now - t) / (1000 * 60 * 60 * 24))
    return days === 0 ? 'today' : `${days}d`
  }

  // Only show sites that have been used
  const usedSites = [...lastUseBySite.keys()]
  const displaySites = usedSites.length > 0 ? usedSites : recentSites.slice(0, 8)

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Rotation</span>
          <h3>Site history</h3>
        </div>
      </div>
      {displaySites.length > 0 ? (
        <div className="body-diagram">
          {displaySites.map((site) => (
            <div key={site} className={`body-cell ${tone(site)}`}>
              {site}
              <small>{daysAgo(site) ?? 'never'}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-note">Log injections to track site rotation.</p>
      )}
      <p className="panel-note" style={{ marginTop: 8 }}>Red = used recently. Rotate to avoid scar tissue.</p>
    </>
  )
}
