// Every injection site the app knows, per route, in body order: regions top
// to bottom, left before right. `quick` sites are the rotation list on the
// logger; the rest are in the "Other site" selector under the same regions.
// Stored as the plain `site` string on each injection.

export type Route = 'IM' | 'SubQ'
export type Side = 'L' | 'R'

export type CatalogSite = {
  site: string
  /** Friendly name without the side: "Rear delt". */
  muscle: string
  side?: Side
  /** Adjacency group: a recent shot anywhere in it flags its neighbours. */
  group: string
  quick?: boolean
  /** A site the user typed, not one from this catalog. */
  custom?: boolean
}

export type Region = { label: string; sites: CatalogSite[] }

const pair = (name: string, muscle: string, group: string, quick = false): CatalogSite[] =>
  (['L', 'R'] as const).map((side) => ({ site: `${name} ${side}`, muscle, side, group: `${group}-${side}`, ...(quick && { quick }) }))

export const REGIONS: Record<Route, Region[]> = {
  IM: [
    // The three delt heads on one arm share a group: side-delt L today and
    // rear-delt L tomorrow is the same muscle twice.
    { label: 'Shoulders', sites: [...pair('Rear Deltoid', 'Rear delt', 'delt', true), ...pair('Side Deltoid', 'Side delt', 'delt', true), ...pair('Front Deltoid', 'Front delt', 'delt', true)] },
    { label: 'Chest', sites: pair('Pectoral', 'Pec', 'pec') },
    { label: 'Arms', sites: [...pair('Tricep', 'Tricep', 'tricep'), ...pair('Forearm', 'Forearm', 'forearm')] },
    { label: 'Back', sites: pair('Lats', 'Lats', 'lat', true) },
    { label: 'Glutes', sites: [...pair('Ventrogluteal', 'Ventrogluteal (upper glute)', 'glute', true), ...pair('Dorsogluteal', 'Dorsogluteal', 'glute')] },
    { label: 'Thighs', sites: [...pair('Vastus Lateralis', 'Vastus lateralis (quad)', 'vl', true), ...pair('Rectus Femoris', 'Rectus femoris', 'rf')] },
  ],
  SubQ: [
    { label: 'Arms', sites: pair('Upper Arm', 'Upper arm', 'arm') },
    { label: 'Belly', sites: [...pair('Abdomen', 'Abdomen', 'abd', true), ...pair('Love Handle', 'Love handles', 'abd', true), { site: 'Navel (SubQ)', muscle: 'Around the navel', group: 'navel' }] },
    { label: 'Lower back', sites: pair('Lower Back', 'Lower back', 'lback') },
    // Same group as the IM glute sites: older SubQ glute shots were logged as
    // Ventrogluteal/Dorsogluteal, and groups are only ever compared within a route.
    { label: 'Glutes', sites: pair('Glute SubQ', 'Glute', 'glute', true) },
    { label: 'Thighs', sites: [...pair('Inner Thigh', 'Inner thigh', 'ithigh', true), ...pair('Outer Thigh', 'Outer thigh', 'othigh', true)] },
  ],
}

// Names logged before the catalog settled. Known, so never shown as custom,
// but no longer offered: "Deltoid" predates splitting the three heads.
const LEGACY: CatalogSite[] = pair('Deltoid', 'Deltoid', 'delt')

// Other spellings of catalog sites found in real history. "Upper Thigh" was
// the only inner-thigh option before Inner Thigh existed.
const ALIASES: Record<string, string> = {
  'lat l': 'Lats L',
  'lat r': 'Lats R',
  'upper thigh l': 'Inner Thigh L',
  'upper thigh r': 'Inner Thigh R',
  'love handles l': 'Love Handle L',
  'love handles r': 'Love Handle R',
}

const KNOWN = new Map(
  [...REGIONS.IM, ...REGIONS.SubQ].flatMap((r) => r.sites).concat(LEGACY).map((s) => [s.site.toLowerCase(), s]),
)

/** One spelling per spot: "Rear deltoid R", "rear Deltoid r" and "Lat R" read as their catalog site. */
export function canonicalSite(raw: string): string {
  const k = raw.trim().toLowerCase()
  return KNOWN.get(k)?.site ?? ALIASES[k] ?? raw.trim()
}

export const isCustomSite = (site: string) => !KNOWN.has(canonicalSite(site).toLowerCase())

/** The rotation list for a route, in body order. */
export const quickSites = (route: Route): CatalogSite[] => REGIONS[route].flatMap((r) => r.sites).filter((s) => s.quick)

/** Adjacency group for any logged site, catalog or typed. */
export function groupOf(site: string): string | null {
  return KNOWN.get(canonicalSite(site).toLowerCase())?.group ?? siteGroup(site)
}

/** "Rear delt, right" for catalog sites, the typed text for anything else. */
export function siteLabel(site: string): string {
  const s = KNOWN.get(canonicalSite(site).toLowerCase())
  return s ? `${s.muscle}${s.side ? `, ${s.side === 'L' ? 'left' : 'right'}` : ''}` : site.trim()
}

/** A typed site as a list row, marked custom. */
export function customSite(site: string): CatalogSite {
  const s = site.trim()
  const side: Side | undefined = /(\bR|\bright)\s*$/i.test(s) ? 'R' : /(\bL|\bleft)\s*$/i.test(s) ? 'L' : undefined
  return { site: s, muscle: s, side, group: siteGroup(s) ?? `custom:${s.toLowerCase()}`, custom: true }
}

// Best guess at an adjacency group from free text, for typed sites.
export function siteGroup(site: string): string | null {
  const s = site.trim().toLowerCase()
  const side = s.endsWith(' l') || s.includes('left') ? 'L'
    : s.endsWith(' r') || s.includes('right') ? 'R'
    : null
  if (!side) return null
  if (s.includes('deltoid') || s.includes('delt')) return `delt-${side}`
  if (s.includes('vastus') || s.includes('quad') || (s.includes('lateral') && s.includes('thigh'))) return `vl-${side}`
  if (/\blat(s|issimus)?\b/.test(s)) return `lat-${side}`
  if (s.includes('abdomen') || s.includes('love handle')) return `abd-${side}`
  if (s.includes('glute')) return `glute-${side}`
  if (s.includes('thigh')) return s.includes('outer') ? `othigh-${side}` : `ithigh-${side}`
  return null
}
