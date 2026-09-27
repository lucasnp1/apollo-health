// Which markers have a guide page at /guides/<slug>.
//
// scripts/build-guides.mjs generates one page per MARKER_COPY key in
// labCopy.ts, with underscores turned into dashes. That file is ~90KB of prose
// and is NOT in the client bundle, so the list is mirrored here instead. The
// build script asserts the two agree and fails if they drift, which is the
// only thing keeping this honest.
const GUIDE_SLUGS = new Set([
  'alt',
  'apob',
  'ast',
  'cortisol',
  'creatine-kinase',
  'creatinine',
  'crp',
  'cystatin-c',
  'dht',
  'egfr',
  'estradiol',
  'ferritin',
  'free-t3',
  'free-t4',
  'free-testosterone',
  'fsh',
  'ggt',
  'glucose',
  'hba1c',
  'hdl',
  'hematocrit',
  'hemoglobin',
  'homocysteine',
  'igf1',
  'insulin',
  'ldl',
  'lh',
  'non-hdl',
  'prolactin',
  'psa',
  'rbc',
  'shbg',
  'tc-hdl-ratio',
  'total-cholesterol',
  'total-testosterone',
  'triglycerides',
  'tsh',
  'vitamin-b12',
  'vitamin-d',
])

/** Link to a marker's guide, or undefined when no page exists for it. */
export function guideUrl(markerKey: string | undefined, ref = 'read'): string | undefined {
  if (!markerKey) return undefined
  const slug = markerKey.replace(/_/g, '-')
  return GUIDE_SLUGS.has(slug) ? `/guides/${slug}?ref=${ref}` : undefined
}

export const GUIDE_COUNT = GUIDE_SLUGS.size
