// Canonical marker mapping — collapses lab-name variants to a stable key.
// Add aliases freely; comparison is case-insensitive substring.

export type LabPanel = 'Sex Hormones' | 'Lipids' | 'Blood Count' | 'Metabolic' | 'Liver' | 'Thyroid' | 'Other'

export type MarkerMeta = {
  key: string
  label: string
  panel: LabPanel
  unit?: string
  // Curated "optimal" range for men on TRT, when meaningful. Not medical advice.
  optimal?: { low?: number; high?: number; note?: string }
}

const CATALOG: Array<MarkerMeta & { aliases: string[] }> = [
  // ── Sex Hormones ───────────────────────────────────────────────────────────
  {
    key: 'total_testosterone',
    label: 'Total Testosterone',
    panel: 'Sex Hormones',
    unit: 'ng/dL',
    aliases: ['total testosterone', 'testosterone, total', 'testosterona total'],
    optimal: { low: 700, high: 1100, note: 'Mid-to-upper reference for men on TRT, draw-time dependent.' },
  },
  {
    key: 'free_testosterone',
    label: 'Free Testosterone',
    panel: 'Sex Hormones',
    unit: 'pg/mL',
    aliases: ['free testosterone', 'testosterone, free'],
    optimal: { low: 15, high: 25 },
  },
  {
    key: 'estradiol',
    label: 'Estradiol',
    panel: 'Sex Hormones',
    unit: 'pg/mL',
    aliases: ['estradiol', 'oestradiol', 'e2', 'estradiol sensitive'],
    optimal: { low: 20, high: 40, note: 'Sensitive assay. LC-MS/MS preferred.' },
  },
  {
    key: 'shbg',
    label: 'SHBG',
    panel: 'Sex Hormones',
    unit: 'nmol/L',
    aliases: ['shbg', 'sex hormone binding globulin', 'sex-hormone binding globulin'],
    optimal: { low: 20, high: 50 },
  },
  {
    key: 'prolactin',
    label: 'Prolactin',
    panel: 'Sex Hormones',
    unit: 'ng/mL',
    aliases: ['prolactin'],
    optimal: { high: 15 },
  },
  {
    key: 'progesterone',
    label: 'Progesterone',
    panel: 'Sex Hormones',
    unit: 'ng/mL',
    aliases: ['progesterone'],
  },
  {
    key: 'lh',
    label: 'LH',
    panel: 'Sex Hormones',
    unit: 'mIU/mL',
    aliases: ['lh', 'luteinizing hormone'],
  },
  {
    key: 'fsh',
    label: 'FSH',
    panel: 'Sex Hormones',
    unit: 'mIU/mL',
    aliases: ['fsh', 'follicle stimulating hormone'],
  },
  {
    key: 'psa',
    label: 'PSA',
    panel: 'Sex Hormones',
    unit: 'ng/mL',
    aliases: ['psa', 'prostate specific'],
    optimal: { high: 2.5 },
  },
  {
    key: 'cortisol',
    label: 'Cortisol AM',
    panel: 'Sex Hormones',
    unit: 'µg/dL',
    aliases: ['cortisol'],
  },

  // ── Blood Count ────────────────────────────────────────────────────────────
  {
    key: 'hematocrit',
    label: 'Hematocrit',
    panel: 'Blood Count',
    unit: '%',
    aliases: ['hematocrit', 'haematocrit', 'hct', 'packed cell volume', 'pcv', 'haematocrit ('],
    optimal: { high: 52, note: 'Above 52% raises hyperviscosity / cardiovascular concern in TRT context.' },
  },
  {
    key: 'hemoglobin',
    label: 'Hemoglobin',
    panel: 'Blood Count',
    unit: 'g/dL',
    aliases: ['hemoglobin', 'haemoglobin', 'hgb', 'haemoglobin concentration', 'hemoglobin concentration'],
    optimal: { high: 17.5 },
  },
  {
    key: 'rbc',
    label: 'Red Blood Cells',
    panel: 'Blood Count',
    unit: 'M/uL',
    aliases: ['red blood cell', 'rbc', 'erythrocytes'],
  },
  {
    key: 'ferritin',
    label: 'Ferritin',
    panel: 'Blood Count',
    unit: 'ng/mL',
    aliases: ['ferritin'],
    optimal: { low: 60, high: 250 },
  },

  // ── Lipids ─────────────────────────────────────────────────────────────────
  {
    key: 'hdl',
    label: 'HDL',
    panel: 'Lipids',
    unit: 'mg/dL',
    aliases: ['hdl'],
    optimal: { low: 50 },
  },
  {
    key: 'ldl',
    label: 'LDL',
    panel: 'Lipids',
    unit: 'mg/dL',
    aliases: ['ldl'],
    optimal: { high: 100 },
  },
  {
    key: 'triglycerides',
    label: 'Triglycerides',
    panel: 'Lipids',
    unit: 'mg/dL',
    aliases: ['triglycerides', 'triglicerideos'],
    optimal: { high: 100 },
  },
  {
    key: 'total_cholesterol',
    label: 'Total Cholesterol',
    panel: 'Lipids',
    unit: 'mg/dL',
    aliases: ['total cholesterol', 'cholesterol total'],
    optimal: { high: 200 },
  },
  {
    key: 'non_hdl',
    label: 'Non-HDL Cholesterol',
    panel: 'Lipids',
    unit: 'mmol/L',
    aliases: ['non-hdl cholesterol', 'non hdl cholesterol', 'non hdl', 'nonhdl'],
    optimal: { high: 3.37 },
  },
  {
    key: 'tc_hdl_ratio',
    label: 'TC/HDL Ratio',
    panel: 'Lipids',
    unit: '',
    aliases: ['total cholesterol / hdl ratio', 'tc/hdl ratio', 'tc hdl ratio', 'cholesterol/hdl ratio'],
    optimal: { high: 4 },
  },

  // ── Metabolic ──────────────────────────────────────────────────────────────
  {
    key: 'glucose',
    label: 'Fasting Glucose',
    panel: 'Metabolic',
    unit: 'mg/dL',
    aliases: ['glucose', 'glicose'],
    optimal: { low: 70, high: 99 },
  },
  {
    key: 'hba1c',
    label: 'HbA1c',
    panel: 'Metabolic',
    unit: '%',
    aliases: ['hba1c', 'hemoglobin a1c', 'glycated'],
    optimal: { high: 5.4 },
  },
  {
    key: 'insulin',
    label: 'Insulin',
    panel: 'Metabolic',
    unit: 'µIU/mL',
    aliases: ['insulin', 'insulina'],
    optimal: { high: 8 },
  },
  {
    key: 'igf1',
    label: 'IGF-1',
    panel: 'Metabolic',
    unit: 'ng/mL',
    aliases: ['igf-1', 'igf 1', 'igf1', 'insulin-like growth factor'],
    optimal: { low: 150, high: 250 },
  },
  {
    key: 'creatinine',
    label: 'Creatinine',
    panel: 'Metabolic',
    unit: 'mg/dL',
    aliases: ['creatinine', 'creatinina'],
  },
  {
    key: 'egfr',
    label: 'eGFR',
    panel: 'Metabolic',
    unit: 'mL/min/1.73',
    aliases: ['egfr', 'gfr'],
    optimal: { low: 90 },
  },
  {
    key: 'urea',
    label: 'Urea / BUN',
    panel: 'Metabolic',
    unit: 'mg/dL',
    aliases: ['urea', 'bun', 'blood urea'],
  },
  {
    key: 'vitamin_d',
    label: 'Vitamin D (25-OH)',
    panel: 'Metabolic',
    unit: 'ng/mL',
    aliases: ['vitamin d', '25-oh', '25 hydroxy'],
    optimal: { low: 40, high: 80 },
  },
  {
    key: 'crp',
    label: 'hs-CRP',
    panel: 'Metabolic',
    unit: 'mg/L',
    aliases: ['crp', 'c-reactive', 'c reactive'],
    optimal: { high: 1 },
  },

  // ── Liver ──────────────────────────────────────────────────────────────────
  {
    key: 'alt',
    label: 'ALT',
    panel: 'Liver',
    unit: 'U/L',
    aliases: ['alt', 'alanine'],
    optimal: { high: 40 },
  },
  {
    key: 'ast',
    label: 'AST',
    panel: 'Liver',
    unit: 'U/L',
    aliases: ['ast', 'aspartate'],
    optimal: { high: 40 },
  },
  {
    key: 'ggt',
    label: 'GGT',
    panel: 'Liver',
    unit: 'U/L',
    aliases: ['ggt', 'gamma-gt', 'gamma gt'],
  },

  {
    key: 'creatine_kinase',
    label: 'Creatine Kinase',
    panel: 'Liver',
    unit: 'U/L',
    aliases: ['creatine kinase', 'ck', 'cpk', 'creatine phosphokinase'],
    optimal: { high: 200 },
  },

  // ── Thyroid ────────────────────────────────────────────────────────────────
  {
    key: 'tsh',
    label: 'TSH',
    panel: 'Thyroid',
    unit: 'mIU/L',
    aliases: ['tsh', 'thyroid stimulating'],
    optimal: { low: 0.5, high: 2.5 },
  },
  {
    key: 'free_t4',
    label: 'Free T4',
    panel: 'Thyroid',
    unit: 'ng/dL',
    aliases: ['free t4', 't4 livre'],
  },
  {
    key: 'free_t3',
    label: 'Free T3',
    panel: 'Thyroid',
    unit: 'pg/mL',
    aliases: ['free t3', 't3 livre'],
  },
]

// Build a length-sorted alias index once. Critical: longer aliases must
// match before shorter ones so "non-hdl cholesterol" beats "hdl", and
// "free testosterone" beats "testosterone". The previous implementation
// used a `.includes()` substring check inside catalog iteration order,
// which collapsed "Non-HDL Cholesterol" into the HDL group and produced
// false "TC/HDL ratio = TC/Non-HDL" values in the composites.
type AliasIndex = { alias: string; entry: (typeof CATALOG)[number] }
let ALIAS_INDEX: AliasIndex[] | null = null
function ensureAliasIndex(): AliasIndex[] {
  if (ALIAS_INDEX) return ALIAS_INDEX
  const flat: AliasIndex[] = []
  for (const entry of CATALOG) {
    for (const alias of entry.aliases) flat.push({ alias, entry })
  }
  flat.sort((a, b) => b.alias.length - a.alias.length)
  ALIAS_INDEX = flat
  return flat
}

// Match an alias against the needle at a word boundary. Whole-word
// matching prevents "hdl" from matching inside "non-hdl cholesterol"
// and "ast" matching inside "fast" or "past".
function matchesAsWord(needle: string, alias: string): boolean {
  const i = needle.indexOf(alias)
  if (i < 0) return false
  const before = i === 0 ? '' : needle[i - 1]
  const after = i + alias.length === needle.length ? '' : needle[i + alias.length]
  const isWordChar = (c: string) => /[a-z0-9]/i.test(c)
  return !isWordChar(before) && !isWordChar(after)
}

export function canonicalize(raw: string): MarkerMeta | undefined {
  const needle = raw.toLowerCase().trim()
  if (!needle) return undefined
  for (const { alias, entry } of ensureAliasIndex()) {
    if (needle === alias || matchesAsWord(needle, alias)) {
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

export const PANEL_ORDER: LabPanel[] = [
  'Sex Hormones',
  'Lipids',
  'Blood Count',
  'Metabolic',
  'Liver',
  'Thyroid',
  'Other',
]
