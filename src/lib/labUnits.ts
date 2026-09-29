// Unit conversions for lab values. Every comparison across tests (deltas,
// charts, compare, the trend grid) converts into the newer reading's unit
// through here; when there is no conversion, there is no comparison. Pure, so
// node can load it.

import { normalizeUnit } from './labCatalog.ts'

/** A comparison key for a unit: case-free, with µ, u and mcg all spelled "u". */
export function normUnit(u?: string): string {
  if (!u) return ''
  return normalizeUnit(u).toLowerCase().replace(/µ/g, 'u').replace(/mcg/g, 'ug')
}

// Spellings that are the same quantity for any marker.
const SAME: Record<string, string> = {
  'ug/l': 'ng/ml', 'ng/l': 'pg/ml', 'mg/l': 'ug/ml',
  'uiu/ml': 'miu/l', 'mu/l': 'miu/l', 'iu/l': 'u/l', 'miu/ml': 'u/l',
  'ml/min/1.73m²': 'ml/min', 'pct': '%',
}
const same = (u?: string) => {
  const n = normUnit(u)
  return SAME[n] ?? n
}

// Per marker: the factor that turns a value in that unit into the base unit
// (the first one). Units are in `same()` form.
const CHOL: Record<string, number> = { 'mmol/l': 1, 'mg/dl': 1 / 38.67 }
const FACTORS: Record<string, Record<string, number>> = {
  total_testosterone: { 'nmol/l': 1, 'ng/dl': 1 / 28.84, 'ng/ml': 100 / 28.84 },
  free_testosterone: { 'pmol/l': 1, 'nmol/l': 1000, 'pg/ml': 1 / 0.2884, 'ng/dl': 10 / 0.2884 },
  estradiol: { 'pmol/l': 1, 'pg/ml': 1 / 0.2724 },
  hematocrit: { '%': 1, 'l/l': 100 },
  hemoglobin: { 'g/l': 1, 'g/dl': 10 },
  total_cholesterol: CHOL, ldl: CHOL, hdl: CHOL, non_hdl: CHOL, vldl: CHOL,
  triglycerides: { 'mmol/l': 1, 'mg/dl': 1 / 88.57 },
  glucose: { 'mmol/l': 1, 'mg/dl': 1 / 18.016 },
  insulin: { 'pmol/l': 1, 'miu/l': 6 },
  creatinine: { 'umol/l': 1, 'mg/dl': 88.4 },
  vitamin_d: { 'nmol/l': 1, 'ng/ml': 2.496 },
  vitamin_b12: { 'pmol/l': 1, 'pg/ml': 1 / 1.355 },
  prolactin: { 'miu/l': 1, 'ng/ml': 21.2 },
  apob: { 'g/l': 1, 'mg/dl': 0.01 },
  // Ca2+ and Mg2+ carry two charges, so 1 mmol/L is 2 mEq/L.
  calcium: { 'mmol/l': 1, 'meq/l': 0.5 },
  magnesium: { 'mmol/l': 1, 'meq/l': 0.5 },
}

// One charge each, so mEq/L and mmol/L are the same number.
const MONO = new Set(['sodium', 'potassium', 'chloride', 'bicarbonate'])

// Twelve significant digits: 0.512 × 100 is 51.2, not 51.199999999999996.
const tidy = (v: number) => Number(v.toPrecision(12))

/** A value in another unit of the same marker, or undefined when there is no known conversion. */
export function toUnit(key: string, v: number, from?: string, to?: string): number | undefined {
  const eq = (u: string) => (MONO.has(key) && u === 'meq/l' ? 'mmol/l' : u)
  const a = eq(same(from)), b = eq(same(to))
  if (a === b) return v
  if (key === 'hba1c') {
    if (a === 'mmol/mol' && b === '%') return tidy(v / 10.929 + 2.15)
    if (a === '%' && b === 'mmol/mol') return tidy((v - 2.15) * 10.929)
    return undefined
  }
  const f = FACTORS[key]
  if (!f || f[a] === undefined || f[b] === undefined) return undefined
  return tidy((v * f[a]) / f[b])
}

/** Markers printed as a percentage change in points, not percent of percent. */
export function isPointsMarker(key: string, unit?: string): boolean {
  if (key === 'hematocrit' || key === 'transferrin_sat') return true
  return key === 'hba1c' && same(unit) === '%'
}

/** HOMA-IR from same-draw glucose and insulin: mmol/L × µIU/mL / 22.5. */
export function homaIr(glucose: number, gUnit: string, insulin: number, iUnit: string): number | undefined {
  const g = toUnit('glucose', glucose, gUnit, 'mmol/L')
  const i = toUnit('insulin', insulin, iUnit, 'µIU/mL')
  if (g === undefined || i === undefined) return undefined
  return (g * i) / 22.5
}

/** The unit a UK lab prints, for filling in a typed result. */
export const UK_UNIT: Record<string, string> = {
  total_testosterone: 'nmol/L', free_testosterone: 'nmol/L', bioavailable_testosterone: 'nmol/L', estradiol: 'pmol/L',
  shbg: 'nmol/L', lh: 'IU/L', fsh: 'IU/L', prolactin: 'mIU/L', dhea_s: 'µmol/L', cortisol: 'nmol/L', igf1: 'nmol/L',
  psa: 'µg/L', free_psa: 'µg/L',
  hematocrit: 'L/L', hemoglobin: 'g/L', rbc: '10^12/L', wbc: '10^9/L', platelets: '10^9/L', mcv: 'fL', mch: 'pg',
  mchc: 'g/L', rdw: '%', neutrophils: '10^9/L', lymphocytes: '10^9/L', monocytes: '10^9/L', eosinophils: '10^9/L', basophils: '10^9/L',
  total_cholesterol: 'mmol/L', ldl: 'mmol/L', hdl: 'mmol/L', non_hdl: 'mmol/L', triglycerides: 'mmol/L', tc_hdl_ratio: '', apob: 'g/L',
  alt: 'U/L', ast: 'U/L', ggt: 'U/L', alp: 'U/L', total_bilirubin: 'µmol/L', albumin: 'g/L', globulin: 'g/L', total_protein: 'g/L',
  creatinine: 'µmol/L', egfr: 'mL/min/1.73m²', urea: 'mmol/L', sodium: 'mmol/L', potassium: 'mmol/L', chloride: 'mmol/L',
  calcium: 'mmol/L', uric_acid: 'µmol/L', creatine_kinase: 'U/L',
  glucose: 'mmol/L', hba1c: 'mmol/mol', insulin: 'pmol/L',
  tsh: 'mIU/L', free_t4: 'pmol/L', free_t3: 'pmol/L',
  ferritin: 'µg/L', iron: 'µmol/L', transferrin_sat: '%', vitamin_d: 'nmol/L', vitamin_b12: 'ng/L', folate: 'µg/L', magnesium: 'mmol/L',
  crp: 'mg/L', hs_crp: 'mg/L', homocysteine: 'µmol/L',
}
