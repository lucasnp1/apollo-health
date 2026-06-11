// Known lab markers — each entry is a list of name variants ordered by
// preference. The FIRST entry in each variant list is the canonical label
// stored on the result row; subsequent entries match alternative
// spellings (UK vs US English) and common shorthand.
//
// Adding a marker = adding a new row here. Be generous with aliases: most
// of the "I uploaded a PDF and nothing showed up" tickets come from
// markers that exist in the PDF under a name we don't recognise.
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
  ['Total Cholesterol', 'Cholesterol Total', 'Cholesterol'],
  ['HDL', 'HDL Cholesterol', 'HDL-C', 'High-Density Lipoprotein'],
  ['LDL', 'LDL Cholesterol', 'LDL-C', 'Low-Density Lipoprotein'],
  ['VLDL', 'VLDL Cholesterol'],
  ['Triglycerides', 'TG'],
  ['Non-HDL Cholesterol', 'Non-HDL'],
  ['ApoB', 'Apolipoprotein B', 'Apo B'],
  ['ApoA1', 'Apolipoprotein A1', 'Apo A1'],
  ['Lp(a)', 'Lipoprotein(a)', 'Lipoprotein A'],
  ['Cholesterol/HDL Ratio', 'TC/HDL Ratio'],

  // ── Complete Blood Count + differentials ────────────────────────────
  ['Hemoglobin', 'Haemoglobin', 'Hgb', 'Hb'],
  ['Hematocrit', 'Haematocrit', 'HCT', 'Hct'],
  ['MCV', 'Mean Cell Volume', 'Mean Corpuscular Volume', 'Red Blood Cell Mean Cell Volume'],
  ['MCH', 'Mean Cell Haemoglobin', 'Mean Cell Hemoglobin', 'Mean Corpuscular Haemoglobin', 'Mean Corpuscular Hemoglobin'],
  ['MCHC', 'Mean Cell Haemoglobin Concentration', 'Mean Cell Hemoglobin Concentration'],
  ['RDW', 'Red Cell Distribution Width'],
  ['Red Blood Cell Count', 'RBC', 'RBC Count', 'Erythrocytes'],
  ['White Blood Cell Count', 'WBC', 'WBC Count', 'Leukocytes'],
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
  ['Vitamin B12', 'B12', 'Cobalamin'],
  ['Folate', 'Folic Acid'],
  ['Iron'],
  ['Ferritin'],
  ['TIBC', 'Total Iron Binding Capacity'],
  ['Transferrin'],
  ['Transferrin Saturation'],

  // ── Inflammation ────────────────────────────────────────────────────
  ['CRP', 'C-Reactive Protein'],
  ['hsCRP', 'High Sensitivity CRP'],
  ['Homocysteine'],

  // ── Other ───────────────────────────────────────────────────────────
  ['PSA', 'Prostate Specific Antigen'],
  ['Lipoprotein-Associated Phospholipase A2', 'Lp-PLA2'],
  ['IGF-1', 'Insulin-like Growth Factor 1'],
]

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

// Match a single number, including decimals and optional leading sign.
// Also handles the `<` and `>` prefixes some labs use for out-of-range
// values (we capture the numeric part only and drop the operator).
const VALUE_REGEX = '(?:[<>]\\s*)?(-?\\d+(?:[.,]\\d+)?)'

// Units include `10^9/l`, `μmol/L`, `µmol/L`, `pmol/l`, `%`, `g/dL`, etc.
// More permissive than the previous version which dropped anything with
// digits or `^` from the unit token.
const UNIT_REGEX = '([a-zA-Zµμ%][a-zA-Z0-9µμ/%^.]*(?:/[a-zA-Z0-9]+)?)?'

export function extractMarkersFromText(text: string): ExtractedMarker[] {
  // Collapse whitespace so multi-line markers ("Mean Cell\nVolume") still
  // match. Strip soft-hyphens that some PDF exports insert.
  const normalized = text.replace(/­/g, '').replace(/\s+/g, ' ')

  // Sort variants longest-first so "Total Testosterone" wins before
  // "Testosterone" eats the same line.
  const flatVariants: Array<{ canonical: string; alias: string }> = []
  for (const [canonical, ...aliases] of MARKER_VARIANTS) {
    flatVariants.push({ canonical, alias: canonical })
    for (const a of aliases) flatVariants.push({ canonical, alias: a })
  }
  flatVariants.sort((a, b) => b.alias.length - a.alias.length)

  const results = new Map<string, ExtractedMarker>()
  // Track text ranges we've already consumed so a longer canonical match
  // (e.g. "Total Testosterone") doesn't get re-matched as the shorter
  // alias ("Testosterone") starting one word later.
  const consumed: Array<[number, number]> = []

  function overlaps(start: number, end: number): boolean {
    for (const [s, e] of consumed) {
      if (start < e && end > s) return true
    }
    return false
  }

  for (const { canonical, alias } of flatVariants) {
    if (results.has(canonical)) continue
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Allow up to 64 non-digit characters between marker name and number
    // (lab PDFs often have "Result" / "Ref Low" headers between the marker
    // name and the actual numeric value).
    const regex = new RegExp(
      `\\b${escaped}\\b[^0-9<>-]{0,64}${VALUE_REGEX}\\s*${UNIT_REGEX}`,
      'i',
    )
    const match = regex.exec(normalized)
    if (!match) continue
    const start = match.index
    const end = start + match[0].length
    if (overlaps(start, end)) continue

    // `match[1]` is the captured numeric value. Normalise European
    // decimal comma (`5,2`) to a dot before parsing.
    const numericRaw = match[1].replace(',', '.')
    const value = Number(numericRaw)
    if (!Number.isFinite(value)) continue

    consumed.push([start, end])
    results.set(canonical, {
      marker: canonical,
      value,
      unit: (match[2] || '').replace(/[.,]$/, ''),
    })
  }

  // Cap to keep the review sheet manageable; if a PDF parsed >32 markers
  // something fishy is happening and the user can re-upload after
  // tightening the source. (Empirically TRT panels run 12-25; full
  // workups run 35-50.)
  return Array.from(results.values()).slice(0, 64)
}
