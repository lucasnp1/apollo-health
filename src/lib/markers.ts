// Canonical marker mapping — collapses lab-name variants to a stable key.
// Add aliases freely; comparison is case-insensitive substring.

export type MarkerMeta = {
  key: string
  label: string
  unit?: string
  // Curated "optimal" range for men on TRT, when meaningful. Not medical advice.
  optimal?: { low?: number; high?: number; note?: string }
}

const CATALOG: Array<MarkerMeta & { aliases: string[] }> = [
  {
    key: 'total_testosterone',
    label: 'Total Testosterone',
    unit: 'ng/dL',
    aliases: ['total testosterone', 'testosterone, total', 'testosterona total'],
    optimal: { low: 700, high: 1100, note: 'Mid-to-upper reference for men on TRT, draw-time dependent.' },
  },
  {
    key: 'free_testosterone',
    label: 'Free Testosterone',
    unit: 'pg/mL',
    aliases: ['free testosterone', 'testosterone, free'],
    optimal: { low: 15, high: 25 },
  },
  {
    key: 'estradiol',
    label: 'Estradiol',
    unit: 'pg/mL',
    aliases: ['estradiol', 'oestradiol', 'e2', 'estradiol sensitive'],
    optimal: { low: 20, high: 40, note: 'Sensitive assay. LC-MS/MS preferred.' },
  },
  {
    key: 'shbg',
    label: 'SHBG',
    unit: 'nmol/L',
    aliases: ['shbg', 'sex hormone binding globulin', 'sex-hormone binding globulin'],
    optimal: { low: 20, high: 50 },
  },
  {
    key: 'prolactin',
    label: 'Prolactin',
    unit: 'ng/mL',
    aliases: ['prolactin'],
    optimal: { high: 15 },
  },
  {
    key: 'progesterone',
    label: 'Progesterone',
    unit: 'ng/mL',
    aliases: ['progesterone'],
  },
  {
    key: 'lh',
    label: 'LH',
    unit: 'mIU/mL',
    aliases: ['lh', 'luteinizing hormone'],
  },
  {
    key: 'fsh',
    label: 'FSH',
    unit: 'mIU/mL',
    aliases: ['fsh', 'follicle stimulating hormone'],
  },
  {
    key: 'hematocrit',
    label: 'Hematocrit',
    unit: '%',
    aliases: ['hematocrit', 'haematocrit', 'hct'],
    optimal: { high: 52, note: 'Above 52% raises hyperviscosity / cardiovascular concern in TRT context.' },
  },
  {
    key: 'hemoglobin',
    label: 'Hemoglobin',
    unit: 'g/dL',
    aliases: ['hemoglobin', 'haemoglobin', 'hgb'],
    optimal: { high: 17.5 },
  },
  {
    key: 'rbc',
    label: 'Red Blood Cells',
    unit: 'M/uL',
    aliases: ['red blood cell', 'rbc'],
  },
  {
    key: 'ferritin',
    label: 'Ferritin',
    unit: 'ng/mL',
    aliases: ['ferritin'],
    optimal: { low: 60, high: 250 },
  },
  {
    key: 'tsh',
    label: 'TSH',
    unit: 'mIU/L',
    aliases: ['tsh', 'thyroid stimulating'],
    optimal: { low: 0.5, high: 2.5 },
  },
  {
    key: 'free_t4',
    label: 'Free T4',
    unit: 'ng/dL',
    aliases: ['free t4', 't4 livre'],
  },
  {
    key: 'free_t3',
    label: 'Free T3',
    unit: 'pg/mL',
    aliases: ['free t3', 't3 livre'],
  },
  {
    key: 'creatinine',
    label: 'Creatinine',
    unit: 'mg/dL',
    aliases: ['creatinine', 'creatinina'],
  },
  {
    key: 'egfr',
    label: 'eGFR',
    unit: 'mL/min/1.73',
    aliases: ['egfr', 'gfr'],
    optimal: { low: 90 },
  },
  {
    key: 'urea',
    label: 'Urea / BUN',
    unit: 'mg/dL',
    aliases: ['urea', 'bun', 'blood urea'],
  },
  {
    key: 'alt',
    label: 'ALT',
    unit: 'U/L',
    aliases: ['alt', 'alanine'],
    optimal: { high: 40 },
  },
  {
    key: 'ast',
    label: 'AST',
    unit: 'U/L',
    aliases: ['ast', 'aspartate'],
    optimal: { high: 40 },
  },
  {
    key: 'ggt',
    label: 'GGT',
    unit: 'U/L',
    aliases: ['ggt', 'gamma-gt', 'gamma gt'],
  },
  {
    key: 'hdl',
    label: 'HDL',
    unit: 'mg/dL',
    aliases: ['hdl'],
    optimal: { low: 50 },
  },
  {
    key: 'ldl',
    label: 'LDL',
    unit: 'mg/dL',
    aliases: ['ldl'],
    optimal: { high: 100 },
  },
  {
    key: 'triglycerides',
    label: 'Triglycerides',
    unit: 'mg/dL',
    aliases: ['triglycerides', 'triglicerideos'],
    optimal: { high: 100 },
  },
  {
    key: 'total_cholesterol',
    label: 'Total Cholesterol',
    unit: 'mg/dL',
    aliases: ['total cholesterol', 'cholesterol total'],
    optimal: { high: 200 },
  },
  {
    key: 'glucose',
    label: 'Fasting Glucose',
    unit: 'mg/dL',
    aliases: ['glucose', 'glicose'],
    optimal: { low: 70, high: 99 },
  },
  {
    key: 'hba1c',
    label: 'HbA1c',
    unit: '%',
    aliases: ['hba1c', 'hemoglobin a1c', 'glycated'],
    optimal: { high: 5.4 },
  },
  {
    key: 'insulin',
    label: 'Insulin',
    unit: 'µIU/mL',
    aliases: ['insulin', 'insulina'],
    optimal: { high: 8 },
  },
  {
    key: 'igf1',
    label: 'IGF-1',
    unit: 'ng/mL',
    aliases: ['igf-1', 'igf 1', 'igf1', 'insulin-like growth factor'],
    optimal: { low: 150, high: 250 },
  },
  {
    key: 'psa',
    label: 'PSA',
    unit: 'ng/mL',
    aliases: ['psa', 'prostate specific'],
    optimal: { high: 2.5 },
  },
  {
    key: 'vitamin_d',
    label: 'Vitamin D (25-OH)',
    unit: 'ng/mL',
    aliases: ['vitamin d', '25-oh', '25 hydroxy'],
    optimal: { low: 40, high: 80 },
  },
  {
    key: 'crp',
    label: 'hs-CRP',
    unit: 'mg/L',
    aliases: ['crp', 'c-reactive', 'c reactive'],
    optimal: { high: 1 },
  },
  {
    key: 'cortisol',
    label: 'Cortisol AM',
    unit: 'µg/dL',
    aliases: ['cortisol'],
  },
]

export function canonicalize(raw: string): MarkerMeta | undefined {
  const needle = raw.toLowerCase().trim()
  for (const entry of CATALOG) {
    if (entry.aliases.some((alias) => needle.includes(alias))) {
      const { aliases: _aliases, ...meta } = entry
      void _aliases
      return meta
    }
  }
  return undefined
}

export function metaForKey(key: string): MarkerMeta | undefined {
  const found = CATALOG.find((entry) => entry.key === key)
  if (!found) return undefined
  const { aliases: _aliases, ...meta } = found
  void _aliases
  return meta
}

export function allMarkerMeta(): MarkerMeta[] {
  return CATALOG.map(({ aliases: _aliases, ...meta }) => {
    void _aliases
    return meta
  })
}
