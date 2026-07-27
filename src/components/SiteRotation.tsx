import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { TriangleAlert, X } from 'lucide-react'
import { db, type Compound, type InjectionLog } from '../lib/db'
import { mlFromDose, parseConcentrationMgPerMl } from '../lib/vials'
import { pickActiveVial } from '../lib/injections'
import { IM_SITES, SUBQ_SITES } from '../lib/sites'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RouteGroup = 'IM' | 'SubQ' | 'Other'
type Kind = 'hot' | 'warm' | 'rested' | 'available'
type BodyView = 'front' | 'back'

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

// ── Body silhouette ─────────────────────────────────────────────────────────
// One continuous half-outline (head-top → right side → crotch). Filled with Z
// (the implicit close is the vertical centre seam) and mirrored for the left
// half; stroked without Z so only the outer contour is drawn, no centre line.
const CX = 170
const MIRROR = `translate(${CX * 2},0) scale(-1,1)`
const BODY_HALF =
  'M170,38 Q193,42 199,64 Q198,85 184,98 Q182,101 201,108 Q215,115 221,127 ' +
  'Q225,139 224,153 Q221,205 213,256 Q217,279 209,290 Q202,293 197,285 ' +
  'Q195,276 197,268 Q203,232 205,192 Q206,174 205,160 Q191,176 189,206 ' +
  'Q188,228 201,240 Q207,248 205,258 Q205,280 204,300 Q201,330 199,357 ' +
  'Q202,376 201,395 Q196,415 190,432 Q189,441 192,450 L174,450 Q173,441 176,432 ' +
  'Q174,415 175,395 Q175,376 176,357 Q177,330 177,300 Q173,278 170,260'

// Where each anatomical region sits on the silhouette. `dx` is distance from the
// centre line; the L/R side of a site places it left (CX-dx) or right (CX+dx).
const ZONES: Record<string, { view: BodyView; dx: number; y: number }> = {
  // front
  Deltoid: { view: 'front', dx: 48, y: 127 },
  Pectoral: { view: 'front', dx: 22, y: 150 },
  Forearm: { view: 'front', dx: 34, y: 250 },
  Abdomen: { view: 'front', dx: 20, y: 186 },
  'Love Handle': { view: 'front', dx: 24, y: 208 },
  'Navel (SubQ)': { view: 'front', dx: 0, y: 204 },
  'Rectus Femoris': { view: 'front', dx: 9, y: 296 },
  'Vastus Lateralis': { view: 'front', dx: 30, y: 300 },
  'Upper Thigh': { view: 'front', dx: 15, y: 276 },
  'Outer Thigh': { view: 'front', dx: 32, y: 288 },
  // back
  Lat: { view: 'back', dx: 32, y: 176 },
  Tricep: { view: 'back', dx: 44, y: 172 },
  'Upper Arm': { view: 'back', dx: 46, y: 150 },
  Ventrogluteal: { view: 'back', dx: 32, y: 246 },
  Dorsogluteal: { view: 'back', dx: 17, y: 258 },
  'Glute SubQ': { view: 'back', dx: 24, y: 270 },
  'Lower Back': { view: 'back', dx: 16, y: 214 },
}

const STANDARD_SITES: { site: string; route: RouteGroup }[] = [
  ...IM_SITES.flatMap((g) => g.sites.map((site) => ({ site, route: 'IM' as RouteGroup }))),
  ...SUBQ_SITES.flatMap((g) => g.sites.map((site) => ({ site, route: 'SubQ' as RouteGroup }))),
]
const STANDARD_SET = new Set(STANDARD_SITES.map((s) => s.site))

const FILL: Record<Kind, string> = {
  hot: 'fill-red-500', warm: 'fill-amber-500', rested: 'fill-emerald-500', available: '',
}

function routeOf(inj: InjectionLog): RouteGroup {
  return inj.route === 'SubQ' ? 'SubQ' : inj.route === 'IM' || !inj.route ? 'IM' : 'Other'
}

// Region + side from a site name, e.g. "Ventrogluteal R" → { region: "Ventrogluteal", side: "R" }.
function splitSite(site: string): { region: string; side: 'L' | 'R' | null } {
  const m = site.match(/^(.*?)\s+([LR])$/)
  return m ? { region: m[1], side: m[2] as 'L' | 'R' } : { region: site, side: null }
}

function recencyKind(daysAgo: number): Kind {
  if (!Number.isFinite(daysAgo)) return 'rested'
  if (daysAgo < 2) return 'hot'
  if (daysAgo < 7) return 'warm'
  return 'rested'
}

function volLabel(b: SiteBucket): string {
  if (b.totalMl !== undefined && b.totalMl > 0) return `${b.totalMl.toFixed(b.totalMl < 10 ? 1 : 0)} mL`
  return `${b.count}×`
}

function daysLabel(daysAgo: number): string {
  if (!Number.isFinite(daysAgo)) return '—'
  if (daysAgo < 0.5) return 'today'
  if (daysAgo < 1.5) return '1d ago'
  return `${Math.round(daysAgo)}d ago`
}

type PlacedZone = {
  site: string
  route: RouteGroup
  x: number
  y: number
  view: BodyView
  kind: Kind
  overused: boolean
  bucket?: SiteBucket
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
  const [activeRoute, setActiveRoute] = useState<'IM' | 'SubQ'>(() => {
    // Open on the route of the most recent injection so the tab matches what
    // the user actually does.
    let best = -Infinity
    let r: 'IM' | 'SubQ' = 'IM'
    for (const inj of injections) {
      const rr = routeOf(inj)
      if (rr !== 'IM' && rr !== 'SubQ') continue
      const t = new Date(inj.takenAt).getTime()
      if (t > best) {
        best = t
        r = rr
      }
    }
    return r
  })
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
    const counts = buckets
      .filter((b) => b.route === activeRoute)
      .map((b) => b.count)
      .filter((c) => c > 0)
      .sort((a, b) => a - b)
    if (counts.length === 0) return Infinity
    const median = counts[Math.floor(counts.length / 2)]
    return Math.max(3, median * 3)
  }, [buckets, activeRoute])

  // Most recent bucket per site string (a site logged both IM + SubQ is rare;
  // show whichever was hit last).
  const bucketBySite = useMemo(() => {
    const m = new Map<string, SiteBucket>()
    for (const b of buckets) {
      const ex = m.get(b.site)
      if (!ex || b.lastMs > ex.lastMs) m.set(b.site, b)
    }
    return m
  }, [buckets])

  const routeCounts = useMemo(
    () => ({
      IM: buckets.filter((b) => b.route === 'IM').length,
      SubQ: buckets.filter((b) => b.route === 'SubQ').length,
    }),
    [buckets],
  )

  // Every standard site placed on the body: coloured by recency if used, a faint
  // "available" anchor if never touched. `route` is the site's canonical route
  // (from the IM/SubQ site lists) so the active tab filters cleanly.
  const placed = useMemo<PlacedZone[]>(() => {
    const out: PlacedZone[] = []
    for (const { site, route } of STANDARD_SITES) {
      const { region, side } = splitSite(site)
      const pos = ZONES[region]
      if (!pos) continue
      const x = pos.dx === 0 ? CX : side === 'R' ? CX + pos.dx : CX - pos.dx
      const b = bucketBySite.get(site)
      out.push({
        site,
        route,
        x,
        y: pos.y,
        view: pos.view,
        kind: b ? recencyKind(b.daysAgo) : 'available',
        overused: b ? b.count >= overusedThreshold : false,
        bucket: b,
      })
    }
    return out
  }, [bucketBySite, overusedThreshold])

  // Used sites we can't place on the body (free-text / custom) — shown as chips.
  const customUsed = useMemo(
    () =>
      buckets
        .filter((b) => !STANDARD_SET.has(b.site) && b.route === activeRoute)
        .sort((a, b) => a.daysAgo - b.daysAgo),
    [buckets, activeRoute],
  )

  // Overall left/right balance (in-window). Prefer mL, fall back to count.
  const balance = useMemo(() => {
    const rel = buckets.filter((b) => b.route === activeRoute)
    let byVolume = true
    for (const b of rel) {
      if (b.side === null || b.count === 0) continue
      if (b.totalMl === undefined) byVolume = false
    }
    let left = 0, right = 0
    for (const b of rel) {
      if (b.side === null || b.count === 0) continue
      const amount = byVolume ? (b.totalMl ?? 0) : b.count
      if (b.side === 'L') left += amount
      else right += amount
    }
    const total = left + right
    if (total === 0) return null
    return { left, right, total, rightPct: right / total, byVolume }
  }, [buckets, activeRoute])

  const selectedBucket = selectedSite ? bucketBySite.get(selectedSite) ?? null : null
  const imbalanced = balance && (balance.rightPct > 0.62 || balance.rightPct < 0.38)
  const routeHasData = routeCounts[activeRoute] > 0

  function renderBody(view: BodyView) {
    const zones = placed.filter((z) => z.view === view && z.route === activeRoute)
    return (
      <>
        {/* silhouette fill (both halves, seamless) */}
        <g style={{ fill: 'var(--muted-foreground)', fillOpacity: 0.12 }}>
          <path d={`${BODY_HALF} Z`} />
          <path d={`${BODY_HALF} Z`} transform={MIRROR} />
        </g>
        {/* silhouette contour (open, no centre seam) */}
        <g
          fill="none"
          style={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.55 }}
          strokeWidth={1.1}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d={BODY_HALF} />
          <path d={BODY_HALF} transform={MIRROR} />
        </g>

        {/* available anchors — sites you've never used */}
        {zones
          .filter((z) => z.kind === 'available')
          .map((z) => (
            <circle
              key={z.site}
              cx={z.x}
              cy={z.y}
              r={3.5}
              style={{ fill: 'var(--muted-foreground)', fillOpacity: 0.32 }}
            />
          ))}

        {/* used zones — coloured by recency */}
        {zones
          .filter((z) => z.kind !== 'available')
          .map((z) => {
            const selected = z.site === selectedSite
            return (
              <g
                key={z.site}
                role="button"
                tabIndex={0}
                aria-label={`${z.site}, ${daysLabel(z.bucket!.daysAgo)}${z.overused ? ', overused' : ''}`}
                className="cursor-pointer outline-none"
                onClick={() => setSelectedSite(selected ? null : z.site)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedSite(selected ? null : z.site)
                  }
                }}
              >
                {/* generous touch target */}
                <circle cx={z.x} cy={z.y} r={15} fill="transparent" />
                {z.overused && (
                  <ellipse
                    cx={z.x}
                    cy={z.y}
                    rx={13}
                    ry={12}
                    fill="none"
                    className="stroke-red-500"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    opacity={0.85}
                  />
                )}
                {selected && (
                  <ellipse
                    cx={z.x}
                    cy={z.y}
                    rx={12.5}
                    ry={11.5}
                    fill="none"
                    style={{ stroke: 'var(--foreground)' }}
                    strokeWidth={1.5}
                  />
                )}
                <ellipse
                  cx={z.x}
                  cy={z.y}
                  rx={9}
                  ry={8}
                  className={FILL[z.kind]}
                  style={{ stroke: 'var(--card)' }}
                  strokeWidth={1.5}
                />
              </g>
            )
          })}
      </>
    )
  }

  return (
    <>
      {/* Route tabs — IM and SubQ never share a body */}
      <div className="mb-3 flex justify-center">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {(['IM', 'SubQ'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setActiveRoute(r)
                setSelectedSite(null)
              }}
              aria-pressed={activeRoute === r}
              className={cn(
                'rounded-md px-3.5 py-1.5 font-medium transition-colors',
                activeRoute === r
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r === 'IM' ? 'Intramuscular' : 'Subcutaneous'}
              {routeCounts[r] > 0 && (
                <span className="ml-1.5 tabular-nums opacity-60">{routeCounts[r]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Left/right balance headline — the "you favoured your right side" callout */}
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

      {/* The body map */}
      <div className="flex justify-center">
        <svg
          viewBox="100 24 440 484"
          className="h-[360px] w-auto max-w-full"
          role="img"
          aria-label="Injection sites over the last 60 days, front and back, coloured by how recently each was used"
        >
          <g>{renderBody('front')}</g>
          <g transform="translate(300,0)">{renderBody('back')}</g>
          <text x={CX} y={476} textAnchor="middle" style={{ fill: 'var(--muted-foreground)' }} fontSize={12} fontWeight={500}>
            Front
          </text>
          <text x={CX + 300} y={476} textAnchor="middle" style={{ fill: 'var(--muted-foreground)' }} fontSize={12} fontWeight={500}>
            Back
          </text>
        </svg>
      </div>

      {!routeHasData && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          No {activeRoute === 'IM' ? 'intramuscular' : 'subcutaneous'} sites logged yet — every site is open.
        </p>
      )}

      {/* Selected site detail — right under the body it was tapped on */}
      {selectedBucket && (
        <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              {selectedBucket.count >= overusedThreshold && (
                <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
              )}
              {selectedBucket.site} · {selectedBucket.count} in {WINDOW_DAYS}d
              {selectedBucket.totalMl !== undefined && selectedBucket.totalMl > 0
                ? ` · ${volLabel(selectedBucket)}`
                : ''}
              {' · '}
              <span className="font-normal text-muted-foreground">last {daysLabel(selectedBucket.daysAgo)}</span>
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

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500" /> Rested — inject here
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-amber-500" /> 3–6d
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" /> ≤2d — resting
        </span>
      </div>

      {/* Custom / unmappable sites */}
      {customUsed.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Other sites</div>
          <div className="flex flex-wrap gap-1.5">
            {customUsed.map((b) => {
              const kind = recencyKind(b.daysAgo)
              const dot = kind === 'hot' ? 'bg-red-500' : kind === 'warm' ? 'bg-amber-500' : 'bg-emerald-500'
              const selected = selectedSite === b.site
              return (
                <button
                  key={`${b.site}||${b.route}`}
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent',
                    selected && 'ring-1 ring-foreground/40',
                  )}
                  onClick={() => setSelectedSite(selected ? null : b.site)}
                >
                  <span className={cn('size-2 rounded-full', dot)} />
                  {b.site}
                  <small className="text-[10px] font-normal text-muted-foreground">{daysLabel(b.daysAgo)}</small>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Green = rested (7d+) · amber 3–6d · red ≤2d. Tap a zone for detail.
      </p>
    </>
  )
}
