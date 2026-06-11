// Known lab markers — each row is [canonical, ...aliases]. Aliases sit
// alongside the canonical name and match alternative spellings (US vs UK)
// plus common shorthand. The FIRST entry is what gets stored on the
// imported row.
//
// We deliberately keep both bare canonical names ("HDL") and the longer
// form ("HDL Cholesterol") as separate aliases. Longer matches get
// preferred during extraction so "Total Cholesterol" never gets eaten by
// "Cholesterol" alone.
//
// Adding a marker = adding a new row here. Be generous with aliases —
// most "I uploaded a PDF and nothing showed up" tickets come from markers
// that exist in the PDF under a name we don't recognise.
const MARKER_VARIANTS: Array<[canonical: string, ...aliases: string[]]> = [
  // ── Hormones ────────────────────────────────────────────────────────
  ['Total Testosterone', 'Testosterone Total', 'Testosterone, Total', 'Total Testosterone Serum'],
  ['Free Testosterone', 'Testosterone Free', 'Testosterone, Free', 'Calculated Free Testosterone'],
  ['Testosterone'],
  ['Bioavailable Testosterone'],
  ['Estradiol', 'Oestradiol', 'E2'],
  ['Estrone'],
  ['SHBG', 'Sex Hormone Binding Globulin'],
  ['DHEA', 'DHEA-S', 'DHEAS', 'Dehydroepiandrosterone'],
  ['DHT', 'Dihydrotestosterone'],
  ['Progesterone'],
  ['Prolactin'],
  ['LH', 'Luteinizing Hormone', 'Luteinising Hormone'],
  ['FSH', 'Follicle Stimulating Hormone'],
  ['Cortisol'],

  // ── Thyroid ─────────────────────────────────────────────────────────
  ['TSH', 'Thyroid Stimulating Hormone'],
  ['Free T3', 'FT3', 'T3 Free'],
  ['Free T4', 'FT4', 'T4 Free'],
  ['T3', 'Triiodothyronine'],
  ['T4', 'Thyroxine'],
  ['Anti-TPO', 'TPO Antibodies', 'Thyroid Peroxidase'],
  ['Anti-Thyroglobulin', 'Thyroglobulin Antibodies'],

  // ── Lipids ──────────────────────────────────────────────────────────
  ['Total Cholesterol', 'Cholesterol Total'],
  ['HDL Cholesterol', 'HDL-C', 'High-Density Lipoprotein', 'HDL'],
  ['LDL Cholesterol', 'LDL-C', 'Low-Density Lipoprotein', 'LDL'],
  ['VLDL Cholesterol', 'VLDL'],
  ['Non-HDL Cholesterol', 'Non HDL Cholesterol', 'Non-HDL'],
  ['Triglycerides', 'TG'],
  ['ApoB', 'Apolipoprotein B', 'Apo B'],
  ['ApoA1', 'Apolipoprotein A1', 'Apo A1'],
  ['Lp(a)', 'Lipoprotein(a)', 'Lipoprotein A'],
  ['Cholesterol/HDL Ratio', 'Total Cholesterol : HDL', 'TC/HDL Ratio'],

  // ── Complete Blood Count + differentials ────────────────────────────
  ['Hemoglobin', 'Haemoglobin', 'Hgb', 'Hb'],
  ['Hematocrit', 'Haematocrit', 'HCT', 'Hct'],
  ['MCV', 'Mean Cell Volume', 'Mean Corpuscular Volume', 'Red Blood Cell Mean Cell Volume'],
  ['MCH', 'Mean Cell Haemoglobin', 'Mean Cell Hemoglobin', 'Mean Corpuscular Haemoglobin', 'Mean Corpuscular Hemoglobin'],
  ['MCHC', 'Mean Cell Haemoglobin Concentration', 'Mean Cell Hemoglobin Concentration'],
  ['RDW', 'Red Cell Distribution Width'],
  ['Red Blood Cell Count', 'RBC Count', 'RBC', 'Erythrocytes'],
  ['White Blood Cell Count', 'WBC Count', 'WBC', 'Leukocytes'],
  ['Platelet Count', 'Platelets', 'PLT'],
  ['MPV', 'Mean Platelet Volume'],
  ['Neutrophil Count', 'Neutrophils', 'Neutrophil'],
  ['Lymphocyte Count', 'Lymphocytes', 'Lymphocyte'],
  ['Monocyte Count', 'Monocytes', 'Monocyte'],
  ['Eosinophil Count', 'Eosinophils', 'Eosinophil'],
  ['Basophil Count', 'Basophils', 'Basophil'],
  ['ESR', 'Erythrocyte Sedimentation Rate'],

  // ── Metabolic / kidney ──────────────────────────────────────────────
  ['Glucose', 'Fasting Glucose'],
  ['HbA1c', 'Glycated Haemoglobin', 'Glycated Hemoglobin', 'A1c'],
  ['Insulin', 'Fasting Insulin'],
  ['HOMA-IR'],
  ['Creatinine'],
  ['eGFR', 'Estimated GFR', 'GFR'],
  ['BUN', 'Blood Urea Nitrogen', 'Urea'],
  ['Uric Acid'],
  ['Sodium'],
  ['Potassium'],
  ['Chloride'],
  ['Bicarbonate', 'CO2'],
  ['Calcium'],
  ['Magnesium'],
  ['Phosphorus', 'Phosphate'],

  // ── Liver ───────────────────────────────────────────────────────────
  ['ALT', 'Alanine Aminotransferase', 'SGPT'],
  ['AST', 'Aspartate Aminotransferase', 'SGOT'],
  ['ALP', 'Alkaline Phosphatase'],
  ['GGT', 'Gamma GT', 'Gamma-Glutamyl Transferase'],
  ['Total Bilirubin', 'Bilirubin Total', 'Bilirubin'],
  ['Direct Bilirubin', 'Bilirubin Direct', 'Conjugated Bilirubin'],
  ['Albumin'],
  ['Globulin'],
  ['Total Protein', 'Protein Total'],
  ['Albumin/Globulin Ratio', 'A/G Ratio'],

  // ── Vitamins / minerals ─────────────────────────────────────────────
  ['Vitamin D', '25-Hydroxy Vitamin D', '25(OH)D', '25 OH Vitamin D'],
  ['Vitamin B12', 'B12', 'Cobalamin', 'Active Vitamin B12', 'Vitamin B12 - Active'],
  ['Folate', 'Folic Acid'],
  ['Iron'],
  ['Ferritin'],
  ['TIBC', 'Total Iron Binding Capacity'],
  ['Transferrin'],
  ['Transferrin Saturation'],

  // ── Inflammation ────────────────────────────────────────────────────
  ['hsCRP', 'High Sensitivity CRP', 'CRP HS', 'CRP-HS', 'hs-CRP'],
  ['CRP', 'C-Reactive Protein'],
  ['Homocysteine'],

  // ── Other ───────────────────────────────────────────────────────────
  ['PSA', 'Prostate Specific Antigen'],
  ['Lipoprotein-Associated Phospholipase A2', 'Lp-PLA2'],
  ['IGF-1', 'Insulin-like Growth Factor 1'],
]

// Known lab units. The extractor will REJECT a candidate whose captured
// "unit" token isn't in this set — that's how we filter out matches like
// "AST 48 hours" (prose grabbing "hours" as a unit). Lowercase comparison
// so case-different variants all collapse to one entry.
const KNOWN_UNITS = new Set<string>([
  'ng/dl', 'ng/ml', 'ng/l',
  'pg/ml', 'pg/dl',
  'pmol/l', 'nmol/l',
  'µmol/l', 'umol/l', 'mcmol/l',
  'mmol/l', 'mEq/l', 'meq/l',
  'mg/dl', 'mg/l',
  'g/dl', 'g/l',
  'µg/l', 'ug/l', 'mcg/l', 'µg/dl', 'ug/dl', 'mcg/dl',
  'miu/l', 'iu/l', 'u/l', 'mu/l', 'µiu/ml', 'uiu/ml', 'miu/ml',
  '%', 'pct',
  'fl', 'fl.', 'pg', 'pg.',
  '10^9/l', '10^12/l', 'x10^9/l', 'x10^12/l',
  'cells/ul', 'cells/µl', 'cells/mcl',
  'ratio',
  'ml/min', 'ml/min/1.73m2',
  'mmhg',
  // some labs print just `K/ul` or `M/ul`
  'k/ul', 'm/ul', 'k/µl', 'm/µl',
])

function isKnownUnit(u: string | undefined): boolean {
  if (!u) return false
  const lower = u.toLowerCase().replace(/μ/g, 'µ').replace(/\s+/g, '')
  return KNOWN_UNITS.has(lower)
}

// Plausibility ranges for a handful of common markers — used to reject
// implausible candidate values (e.g. an "Iron = 12" match grabbed from
// "Iron and B12" prose where 12 came from "B12"). Bound is permissive;
// only set this for markers where wild misreads are common.
type Plausibility = { min?: number; max?: number; unit?: RegExp }
const PLAUSIBLE: Record<string, Plausibility> = {
  'Creatinine':           { min: 0.2,  max: 2000 },   // covers mg/dL and umol/L
  'eGFR':                 { min: 1,    max: 250 },
  'Total Cholesterol':    { min: 1,    max: 500 },
  'LDL Cholesterol':      { min: 0.3,  max: 400 },
  'HDL Cholesterol':      { min: 0.1,  max: 200 },
  'Non-HDL Cholesterol':  { min: 0.3,  max: 400 },
  'Triglycerides':        { min: 0.1,  max: 2000 },
  'Glucose':              { min: 1,    max: 600 },
  'HbA1c':                { min: 3,    max: 200 },
  'ALT':                  { min: 1,    max: 5000 },
  'AST':                  { min: 1,    max: 5000 },
  'ALP':                  { min: 10,   max: 2000 },
  'GGT':                  { min: 1,    max: 2000 },
  'Total Bilirubin':      { min: 0.05, max: 200 },
  'Albumin':              { min: 5,    max: 100 },
  'Globulin':             { min: 5,    max: 100 },
  'Total Protein':        { min: 20,   max: 200 },
  'Ferritin':             { min: 1,    max: 5000 },
  'Vitamin D':            { min: 1,    max: 600 },
  'Vitamin B12':          { min: 10,   max: 3000 },
  'TSH':                  { min: 0.01, max: 200 },
  'CRP':                  { min: 0.1,  max: 500 },
  'hsCRP':                { min: 0.05, max: 100 },
}

export type ExtractedMarker = {
  marker: string
  value: number
  unit: string
}

export async function extractPdfText(file: File) {
  const [pdfjs, pdfWorkerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl.default

  const buffer = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    pageTexts.push(text)
  }

  return pageTexts.join('\n')
}

// Match a single number, including decimals and optional leading sign or
// `<` / `>` operator (some labs use these for out-of-range values).
const VALUE_REGEX = '(?:[<>]\\s*)?(-?\\d+(?:[.,]\\d+)?)'
// Unit token. Permissive enough to capture `µmol/L`, `10^9/l`, `mg/dL`,
// `%`, etc. — starts with a digit OR letter (CBC differentials use
// `10^9/l` which begins with a digit). We validate against KNOWN_UNITS
// after extraction so prose tokens like "hours" + pure-digit captures
// like "45" get rejected.
const UNIT_REGEX = '([0-9a-zA-Zµμ%][a-zA-Z0-9µμ/%^.]*)?'

// Gap between the marker name and its value. Allows whitespace and the
// common one-letter "out of range" flag labs use ("X", "H", "L"), but
// rejects more than 1 alphabetic word inside the gap — that's how we
// stop "Iron and B12" matching as Iron=12.
const GAP_REGEX = '[^A-Za-z0-9]{0,8}(?:[A-Z][^A-Za-z0-9]{0,4})?'

export function extractMarkersFromText(text: string): ExtractedMarker[] {
  // Collapse whitespace so multi-line markers ("Mean Cell\nVolume") still
  // match. Strip soft-hyphens that some PDF exports insert.
  const normalized = text.replace(/­/g, '').replace(/\s+/g, ' ')

  // Flatten + sort variants longest-first so a long canonical match
  // ("Total Cholesterol") beats its shorter alias ("Cholesterol").
  const flatVariants: Array<{ canonical: string; alias: string }> = []
  for (const [canonical, ...aliases] of MARKER_VARIANTS) {
    flatVariants.push({ canonical, alias: canonical })
    for (const a of aliases) flatVariants.push({ canonical, alias: a })
  }
  flatVariants.sort((a, b) => b.alias.length - a.alias.length)

  type Candidate = {
    canonical: string
    value: number
    unit: string
    start: number
    end: number
    score: number
  }

  const accepted = new Map<string, Candidate>()
  const consumed: Array<[number, number]> = []
  const overlaps = (s: number, e: number) =>
    consumed.some(([a, b]) => s < b && e > a)

  for (const { canonical, alias } of flatVariants) {
    if (accepted.has(canonical)) continue

    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(
      `\\b${escaped}\\b${GAP_REGEX}${VALUE_REGEX}\\s*${UNIT_REGEX}`,
      'gi',
    )
    const candidates: Candidate[] = []

    let m: RegExpExecArray | null
    // Capture every occurrence — score them, keep the best.
    while ((m = pattern.exec(normalized)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (overlaps(start, end)) continue
      const numericRaw = m[1].replace(',', '.')
      const value = Number(numericRaw)
      if (!Number.isFinite(value)) continue
      let unit = (m[2] || '').replace(/[.,]$/, '')
      // Reject pure-digit unit captures — those are the next number on
      // the row (a reference value or the column-wise range start),
      // not a real unit.
      if (unit && /^[0-9.]+$/.test(unit)) unit = ''
      const score = scoreCandidate(canonical, value, unit, start, end, normalized)
      if (score <= 0) continue
      candidates.push({ canonical, value, unit, start, end, score })
    }

    if (candidates.length === 0) continue
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    consumed.push([best.start, best.end])
    accepted.set(canonical, best)
  }

  return Array.from(accepted.values())
    .map(({ canonical, value, unit }) => ({ marker: canonical, value, unit }))
    .slice(0, 64)
}

// Score a candidate match. Higher score = more likely to be the real
// structured-table entry rather than a prose mention.
function scoreCandidate(
  canonical: string,
  value: number,
  unit: string,
  start: number,
  end: number,
  text: string,
): number {
  let score = 1

  // Strong positive: the row is followed by a "(Range:" parenthetical.
  // Almost every structured lab PDF labels its reference range this way.
  const after = text.slice(end, end + 60)
  if (/\(\s*Range\s*[:=]/i.test(after)) score += 8
  if (/\bRange\s*[:=]/i.test(after)) score += 2
  // "Ref Low" / "Ref High" header (some Quest / LabCorp formats use this
  // instead of an inline parenthetical).
  if (/\bRef\s+(Low|High)\b/i.test(after)) score += 3

  // Unit must look like a real lab unit. No unit at all is a soft penalty
  // (some markers like Cholesterol/HDL Ratio don't carry one); a bogus
  // unit like "hours" or "years" is a hard reject.
  if (unit) {
    if (isKnownUnit(unit)) score += 5
    else if (/^(hours?|minutes?|seconds?|days?|weeks?|years?|months?|times?|each|per)$/i.test(unit)) {
      return -1
    } else {
      score -= 2
    }
  } else {
    score -= 1
  }

  // Strong negative: prose context. Look 30 chars before the marker name
  // for filler phrases. Real table rows don't have these around them.
  const before = text.slice(Math.max(0, start - 40), start)
  if (/\b(your|the|is|are|at|with|of|than|to|in|on|by|over|under|about|within|range|normal)\s+$/i.test(before)) {
    score -= 4
  }
  if (/\b(is|are|at|than|to|reflects?|considered|sits?|sit)\s+/i.test(text.slice(start, end))) {
    score -= 3
  }

  // Positive: section header words nearby ("Liver Health", "Kidney
  // Health", "Cholesterol Status", "Iron Status", "Vitamins", "Hormones",
  // "Thyroid", "Inflammation").
  const beforeWide = text.slice(Math.max(0, start - 80), start)
  if (
    /\b(Liver|Kidney|Cholesterol|Iron|Thyroid|Hormone|Vitamin|Inflammation|Protein|Mineral|Diabetes|Glucose|Hematology|Haematology|Lipid|Cardiovascular)\s+(Health|Status|Panel|Function)?\b/i.test(beforeWide)
  ) {
    score += 2
  }

  // Plausibility — bound check against the known range for this marker.
  // If the value is wildly out of range (e.g. Iron=12 from "B12" prose),
  // reject; if mildly off, soft penalty.
  const p = PLAUSIBLE[canonical]
  if (p) {
    const min = p.min ?? -Infinity
    const max = p.max ?? Infinity
    if (value < min || value > max) score -= 5
  }

  // Zero value is almost always a parse artifact.
  if (value === 0) score -= 3

  return score
}
