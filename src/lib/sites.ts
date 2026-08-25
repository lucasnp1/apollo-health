// All known SubQ and IM injection sites used in TRT / performance contexts.
// Grouped by route for display, but stored as flat strings in the DB.

export type SiteGroup = {
  label: string
  sites: string[]
}

export const IM_SITES: SiteGroup[] = [
  {
    label: 'Glute (IM)',
    sites: ['Ventrogluteal L', 'Ventrogluteal R', 'Dorsogluteal L', 'Dorsogluteal R'],
  },
  {
    label: 'Quad (IM)',
    sites: ['Vastus Lateralis L', 'Vastus Lateralis R', 'Rectus Femoris L', 'Rectus Femoris R'],
  },
  {
    label: 'Upper body (IM)',
    sites: ['Deltoid L', 'Deltoid R', 'Pectoral L', 'Pectoral R', 'Lat L', 'Lat R', 'Tricep L', 'Tricep R'],
  },
  {
    label: 'Other IM',
    sites: ['Forearm L', 'Forearm R'],
  },
]

export const SUBQ_SITES: SiteGroup[] = [
  {
    label: 'Abdomen (SubQ)',
    sites: ['Abdomen L', 'Abdomen R', 'Love Handle L', 'Love Handle R', 'Navel (SubQ)'],
  },
  {
    label: 'Legs (SubQ)',
    sites: ['Upper Thigh L', 'Upper Thigh R', 'Outer Thigh L', 'Outer Thigh R'],
  },
  {
    label: 'Upper body (SubQ)',
    sites: ['Upper Arm L', 'Upper Arm R', 'Glute SubQ L', 'Glute SubQ R', 'Lower Back L', 'Lower Back R'],
  },
]

// Flat ordered list — used for the datalist options.
export const ALL_SITES: string[] = [
  ...IM_SITES.flatMap((g) => g.sites),
  ...SUBQ_SITES.flatMap((g) => g.sites),
]

// Most common starting choices surfaced first in quick-log.
export const COMMON_SITES = [
  'Ventrogluteal L',
  'Ventrogluteal R',
  'Vastus Lateralis L',
  'Vastus Lateralis R',
  'Deltoid L',
  'Deltoid R',
  'Abdomen L',
  'Abdomen R',
]

// ── Quick-log rotation sites ────────────────────────────────────────────────
// The curated top-to-bottom list shown on the Add Injection page. Each site
// carries an adjacency `group`: the three deltoid heads on one arm share a
// group, so a recent shot to any of them flags the whole deltoid on that side
// (you shouldn't hit side-delt-L today and rear-delt-L tomorrow).

export type QuickSite = { site: string; muscle: string; side: 'L' | 'R'; group: string }

export const IM_QUICK_SITES: QuickSite[] = [
  { site: 'Front Deltoid L',    muscle: 'Front deltoid',    side: 'L', group: 'delt-L' },
  { site: 'Front Deltoid R',    muscle: 'Front deltoid',    side: 'R', group: 'delt-R' },
  { site: 'Rear Deltoid L',     muscle: 'Rear deltoid',     side: 'L', group: 'delt-L' },
  { site: 'Rear Deltoid R',     muscle: 'Rear deltoid',     side: 'R', group: 'delt-R' },
  { site: 'Side Deltoid L',     muscle: 'Side deltoid',     side: 'L', group: 'delt-L' },
  { site: 'Side Deltoid R',     muscle: 'Side deltoid',     side: 'R', group: 'delt-R' },
  { site: 'Lats L',             muscle: 'Lats',             side: 'L', group: 'lat-L' },
  { site: 'Lats R',             muscle: 'Lats',             side: 'R', group: 'lat-R' },
  { site: 'Vastus Lateralis L', muscle: 'Vastus lateralis', side: 'L', group: 'vl-L' },
  { site: 'Vastus Lateralis R', muscle: 'Vastus lateralis', side: 'R', group: 'vl-R' },
]

export const SUBQ_QUICK_SITES: QuickSite[] = [
  { site: 'Abdomen L',    muscle: 'Abdomen',      side: 'L', group: 'abd-L' },
  { site: 'Abdomen R',    muscle: 'Abdomen',      side: 'R', group: 'abd-R' },
  { site: 'Glute SubQ L', muscle: 'Glute (SubQ)', side: 'L', group: 'glute-L' },
  { site: 'Glute SubQ R', muscle: 'Glute (SubQ)', side: 'R', group: 'glute-R' },
]

// Map any logged site string (new or legacy, e.g. "Deltoid L") to an adjacency
// group so recency can be scored per muscle-region-per-side, not per exact spot.
export function siteGroup(site: string): string | null {
  const s = site.trim().toLowerCase()
  const side = s.endsWith(' l') || s.includes('left') ? 'L'
    : s.endsWith(' r') || s.includes('right') ? 'R'
    : null
  if (!side) return null
  if (s.includes('deltoid')) return `delt-${side}`
  if (s.includes('vastus')) return `vl-${side}`
  if (s.includes('lat')) return `lat-${side}`
  if (s.includes('abdomen') || s.includes('love handle') || s.includes('navel')) return `abd-${side}`
  if (s.includes('glute')) return `glute-${side}`
  if (s.includes('thigh')) return `thigh-${side}`
  return null
}
