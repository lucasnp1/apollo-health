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
