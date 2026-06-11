// Quick sanity test of the new extractor against the recent PDF text.
// Imports the actual extractMarkersFromText via TS-stripping shim.

import { readFileSync } from 'node:fs'

// Re-implement the relevant portion inline (Node can't import TS directly).
// This mirrors src/lib/pdf.ts.

const MARKER_VARIANTS = [
  ['Total Testosterone', 'Testosterone Total'],
  ['Free Testosterone', 'Testosterone Free'],
  ['Testosterone'],
  ['Estradiol', 'Oestradiol', 'E2'],
  ['SHBG'],
  ['DHEA', 'DHEA-S', 'DHEAS'],
  ['Prolactin'],
  ['LH', 'Luteinising Hormone'],
  ['FSH'],
  ['Cortisol'],
  ['TSH'],
  ['Free T3', 'FT3'],
  ['Free T4', 'FT4'],
  ['T3'], ['T4'],
  ['Total Cholesterol', 'Cholesterol'],
  ['HDL'],
  ['LDL'],
  ['VLDL'],
  ['Triglycerides'],
  // CBC
  ['Hemoglobin', 'Haemoglobin'],
  ['Hematocrit', 'Haematocrit'],
  ['MCV', 'Mean Cell Volume', 'Red Blood Cell Mean Cell Volume'],
  ['MCH', 'Mean Cell Haemoglobin'],
  ['MCHC', 'Mean Cell Haemoglobin Concentration'],
  ['Red Blood Cell Count', 'RBC'],
  ['White Blood Cell Count', 'WBC'],
  ['Platelet Count', 'Platelets'],
  ['Neutrophil Count', 'Neutrophils'],
  ['Lymphocyte Count', 'Lymphocytes'],
  ['Monocyte Count', 'Monocytes'],
  ['Eosinophil Count', 'Eosinophils'],
  ['Basophil Count', 'Basophils'],
  // Metabolic + liver
  ['Glucose'],
  ['HbA1c'],
  ['Creatinine'],
  ['eGFR'],
  ['ALT'], ['AST'], ['ALP'], ['GGT'],
  ['Total Bilirubin', 'Bilirubin'],
  ['Albumin'], ['Globulin'],
  ['Vitamin D'], ['Vitamin B12'],
  ['Ferritin'],
  ['CRP'],
  ['PSA'],
]

const VALUE_REGEX = '(?:[<>]\\s*)?(-?\\d+(?:[.,]\\d+)?)'
const UNIT_REGEX = '([a-zA-Zµμ%][a-zA-Z0-9µμ/%^.]*(?:/[a-zA-Z0-9]+)?)?'

function extractMarkersFromText(text) {
  const normalized = text.replace(/­/g, '').replace(/\s+/g, ' ')

  const flat = []
  for (const [canonical, ...aliases] of MARKER_VARIANTS) {
    flat.push({ canonical, alias: canonical })
    for (const a of aliases) flat.push({ canonical, alias: a })
  }
  flat.sort((a, b) => b.alias.length - a.alias.length)

  const results = new Map()
  const consumed = []

  function overlaps(s, e) {
    for (const [a, b] of consumed) if (s < b && e > a) return true
    return false
  }

  for (const { canonical, alias } of flat) {
    if (results.has(canonical)) continue
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b[^0-9<>-]{0,64}${VALUE_REGEX}\\s*${UNIT_REGEX}`, 'i')
    const m = re.exec(normalized)
    if (!m) continue
    const s = m.index, e = s + m[0].length
    if (overlaps(s, e)) continue
    const v = Number(m[1].replace(',', '.'))
    if (!Number.isFinite(v)) continue
    consumed.push([s, e])
    results.set(canonical, { marker: canonical, value: v, unit: (m[2] || '').replace(/[.,]$/, '') })
  }
  return [...results.values()]
}

const text = readFileSync('/tmp/recent-pdf.txt', 'utf-8')
const markers = extractMarkersFromText(text)
console.log(`Extracted ${markers.length} markers:\n`)
for (const m of markers) console.log(`  ${m.marker.padEnd(28)} ${String(m.value).padStart(8)} ${m.unit}`)
