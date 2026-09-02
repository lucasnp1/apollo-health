// Canonical marker catalog: folds every lab's naming onto one stable key so
// history lines, panels and composites line up across imports.
// Aliases are lowercase and matched as whole words inside the incoming name.

export type LabPanel =
  | 'Sex Hormones'
  | 'Lipids'
  | 'Blood Count'
  | 'Metabolic'
  | 'Kidney & Electrolytes'
  | 'Liver'
  | 'Thyroid'
  | 'Vitamins & Minerals'
  | 'Inflammation'
  | 'Other'

export type MarkerMeta = {
  key: string
  label: string
  panel: LabPanel
  unit?: string
  // Curated "optimal" range for men on TRT, when meaningful. Not medical advice.
  optimal?: { low?: number; high?: number; note?: string }
}

type Entry = MarkerMeta & { aliases: string[] }

function m(key: string, label: string, panel: LabPanel, unit: string | undefined, aliases: string[], optimal?: MarkerMeta['optimal']): Entry {
  return { key, label, panel, unit, aliases, optimal }
}

const CATALOG: Entry[] = [
  // ── Sex Hormones ───────────────────────────────────────────────────────────
  m('total_testosterone', 'Total Testosterone', 'Sex Hormones', 'ng/dL',
    ['total testosterone', 'testosterone, total', 'testosterone (total)', 'testosterone total', 'testosterona total', 'serum testosterone', 'testosterone serum', 'testosterone', 'testosterona'],
    { low: 700, high: 1100, note: 'Mid-to-upper reference for men on TRT, draw-time dependent.' }),
  m('free_testosterone', 'Free Testosterone', 'Sex Hormones', 'pg/mL',
    ['free testosterone', 'testosterone, free', 'testosterone (free)', 'testosterone free', 'calculated free testosterone', 'testosterona livre'],
    { low: 15, high: 25 }),
  m('bioavailable_testosterone', 'Bioavailable Testosterone', 'Sex Hormones', 'ng/dL', ['bioavailable testosterone', 'testosterone bioavailable']),
  m('fai', 'Free Androgen Index', 'Sex Hormones', '', ['free androgen index', 'fai']),
  m('estradiol', 'Estradiol', 'Sex Hormones', 'pg/mL',
    ['estradiol', 'oestradiol', 'e2', 'estradiol sensitive', 'oestradiol (sensitive)', 'estradiol (sensitive)', 'ultrasensitive estradiol'],
    { low: 20, high: 40, note: 'Sensitive assay. LC-MS/MS preferred.' }),
  m('estrone', 'Estrone', 'Sex Hormones', 'pg/mL', ['estrone', 'oestrone', 'e1']),
  m('shbg', 'SHBG', 'Sex Hormones', 'nmol/L', ['shbg', 'sex hormone binding globulin', 'sex hormone-binding globulin'], { low: 20, high: 50 }),
  m('dhea_s', 'DHEA-S', 'Sex Hormones', 'µg/dL', ['dhea-s', 'dheas', 'dhea sulfate', 'dhea sulphate', 'dhea']),
  m('dht', 'DHT', 'Sex Hormones', 'pg/mL', ['dht', 'dihydrotestosterone']),
  m('prolactin', 'Prolactin', 'Sex Hormones', 'ng/mL', ['prolactin', 'prolactina'], { high: 15 }),
  m('progesterone', 'Progesterone', 'Sex Hormones', 'ng/mL', ['progesterone', 'progesterona']),
  m('lh', 'LH', 'Sex Hormones', 'mIU/mL', ['lh', 'luteinizing hormone', 'luteinising hormone']),
  m('fsh', 'FSH', 'Sex Hormones', 'mIU/mL', ['fsh', 'follicle stimulating hormone', 'follicle-stimulating hormone']),
  m('psa', 'PSA', 'Sex Hormones', 'ng/mL', ['psa', 'prostate specific antigen', 'prostate-specific antigen', 'total psa', 'psa total'], { high: 2.5 }),
  m('free_psa', 'Free PSA', 'Sex Hormones', 'ng/mL', ['free psa', 'psa free']),
  m('cortisol', 'Cortisol AM', 'Sex Hormones', 'µg/dL', ['cortisol', 'cortisol am', 'morning cortisol']),
  m('igf1', 'IGF-1', 'Sex Hormones', 'ng/mL', ['igf-1', 'igf 1', 'igf1', 'insulin-like growth factor', 'insulin like growth factor', 'somatomedin c'], { low: 150, high: 250 }),

  // ── Blood Count ────────────────────────────────────────────────────────────
  m('hematocrit', 'Hematocrit', 'Blood Count', '%',
    ['hematocrit', 'haematocrit', 'hct', 'packed cell volume', 'pcv', 'hematócrito', 'hematocrito'],
    { high: 52, note: 'Above 52% raises hyperviscosity / cardiovascular concern in TRT context.' }),
  m('hemoglobin', 'Hemoglobin', 'Blood Count', 'g/dL',
    ['hemoglobin', 'haemoglobin', 'hgb', 'hb', 'haemoglobin concentration', 'hemoglobin concentration', 'hemoglobina'],
    { high: 17.5 }),
  m('rbc', 'Red Blood Cells', 'Blood Count', 'M/uL', ['red blood cell', 'red blood cells', 'red cell count', 'rbc', 'erythrocytes', 'erythrocyte count', 'hemácias', 'hemacias']),
  m('wbc', 'White Blood Cells', 'Blood Count', 'K/uL', ['white blood cell', 'white blood cells', 'white cell count', 'wbc', 'leukocytes', 'leukocyte count', 'leucócitos', 'leucocitos']),
  m('platelets', 'Platelets', 'Blood Count', 'K/uL', ['platelet', 'platelets', 'platelet count', 'plt', 'plaquetas']),
  m('mcv', 'MCV', 'Blood Count', 'fL', ['mcv', 'mean cell volume', 'mean corpuscular volume', 'vcm']),
  m('mch', 'MCH', 'Blood Count', 'pg', ['mch', 'mean cell haemoglobin', 'mean cell hemoglobin', 'mean corpuscular haemoglobin', 'mean corpuscular hemoglobin', 'hcm']),
  m('mchc', 'MCHC', 'Blood Count', 'g/dL', ['mchc', 'mean cell haemoglobin concentration', 'mean cell hemoglobin concentration', 'chcm']),
  m('rdw', 'RDW', 'Blood Count', '%', ['rdw', 'red cell distribution width', 'rdw-cv', 'rdw-sd']),
  m('mpv', 'MPV', 'Blood Count', 'fL', ['mpv', 'mean platelet volume', 'vpm']),
  m('neutrophils', 'Neutrophils', 'Blood Count', 'K/uL', ['neutrophil', 'neutrophils', 'neutrophil count', 'neutrófilos', 'neutrofilos']),
  m('lymphocytes', 'Lymphocytes', 'Blood Count', 'K/uL', ['lymphocyte', 'lymphocytes', 'lymphocyte count', 'linfócitos', 'linfocitos']),
  m('monocytes', 'Monocytes', 'Blood Count', 'K/uL', ['monocyte', 'monocytes', 'monocyte count', 'monócitos', 'monocitos']),
  m('eosinophils', 'Eosinophils', 'Blood Count', 'K/uL', ['eosinophil', 'eosinophils', 'eosinophil count', 'eosinófilos', 'eosinofilos']),
  m('basophils', 'Basophils', 'Blood Count', 'K/uL', ['basophil', 'basophils', 'basophil count', 'basófilos', 'basofilos']),
  m('reticulocytes', 'Reticulocytes', 'Blood Count', '%', ['reticulocytes', 'reticulocyte count', 'reticulócitos']),
  m('ferritin', 'Ferritin', 'Blood Count', 'ng/mL', ['ferritin', 'ferritina'], { low: 60, high: 250 }),

  // ── Lipids ─────────────────────────────────────────────────────────────────
  m('hdl', 'HDL', 'Lipids', 'mg/dL', ['hdl', 'hdl cholesterol', 'hdl-c', 'colesterol hdl'], { low: 50 }),
  m('ldl', 'LDL', 'Lipids', 'mg/dL', ['ldl', 'ldl cholesterol', 'ldl-c', 'colesterol ldl'], { high: 100 }),
  m('vldl', 'VLDL', 'Lipids', 'mg/dL', ['vldl', 'vldl cholesterol', 'vldl-c']),
  m('triglycerides', 'Triglycerides', 'Lipids', 'mg/dL', ['triglycerides', 'triglyceride', 'triglicerideos', 'triglicérides', 'triglicerides', 'trig', 'tg'], { high: 100 }),
  m('total_cholesterol', 'Total Cholesterol', 'Lipids', 'mg/dL', ['total cholesterol', 'cholesterol total', 'cholesterol, total', 'colesterol total', 'cholesterol'], { high: 200 }),
  m('non_hdl', 'Non-HDL Cholesterol', 'Lipids', 'mmol/L', ['non-hdl cholesterol', 'non hdl cholesterol', 'non hdl', 'non-hdl', 'nonhdl', 'non-hdl-c'], { high: 3.37 }),
  m('tc_hdl_ratio', 'TC/HDL Ratio', 'Lipids', '', ['total cholesterol / hdl ratio', 'total cholesterol/hdl ratio', 'tc/hdl ratio', 'tc hdl ratio', 'tc/hdl', 'tc:hdl', 'cholesterol/hdl ratio', 'cholesterol/hdl', 'chol/hdl ratio', 'chol:hdl'], { high: 4 }),
  m('apob', 'ApoB', 'Lipids', 'mg/dL', ['apob', 'apo b', 'apo-b', 'apolipoprotein b']),
  m('apoa1', 'ApoA1', 'Lipids', 'mg/dL', ['apoa1', 'apo a1', 'apo-a1', 'apolipoprotein a1', 'apolipoprotein a-1', 'apolipoprotein a-i']),
  m('lpa', 'Lp(a)', 'Lipids', 'nmol/L', ['lp(a)', 'lipoprotein(a)', 'lipoprotein (a)', 'lipoprotein a']),
  m('lp_pla2', 'Lp-PLA2', 'Lipids', 'ng/mL', ['lp-pla2', 'lipoprotein-associated phospholipase a2']),

  // ── Metabolic ──────────────────────────────────────────────────────────────
  m('glucose', 'Fasting Glucose', 'Metabolic', 'mg/dL', ['glucose', 'fasting glucose', 'glicose', 'glicemia', 'blood glucose'], { low: 70, high: 99 }),
  m('hba1c', 'HbA1c', 'Metabolic', '%', ['hba1c', 'hemoglobin a1c', 'haemoglobin a1c', 'glycated', 'a1c', 'hemoglobina glicada'], { high: 5.4 }),
  m('insulin', 'Insulin', 'Metabolic', 'µIU/mL', ['insulin', 'fasting insulin', 'insulina'], { high: 8 }),
  m('homa_ir', 'HOMA-IR', 'Metabolic', '', ['homa-ir', 'homa ir', 'homa']),
  m('uric_acid', 'Uric Acid', 'Metabolic', 'mg/dL', ['uric acid', 'urate', 'ácido úrico', 'acido urico']),
  m('creatine_kinase', 'Creatine Kinase', 'Metabolic', 'U/L', ['creatine kinase', 'ck', 'cpk', 'creatine phosphokinase'], { high: 200 }),
  m('ldh', 'LDH', 'Metabolic', 'U/L', ['ldh', 'lactate dehydrogenase']),
  m('lipase', 'Lipase', 'Metabolic', 'U/L', ['lipase']),
  m('amylase', 'Amylase', 'Metabolic', 'U/L', ['amylase', 'amilase']),

  // ── Kidney & Electrolytes ──────────────────────────────────────────────────
  m('creatinine', 'Creatinine', 'Kidney & Electrolytes', 'mg/dL', ['creatinine', 'creatinina', 'serum creatinine']),
  m('egfr', 'eGFR', 'Kidney & Electrolytes', 'mL/min/1.73', ['egfr', 'gfr', 'estimated gfr', 'tfg'], { low: 90 }),
  m('cystatin_c', 'Cystatin C', 'Kidney & Electrolytes', 'mg/L', ['cystatin c', 'cystatin-c', 'cistatina c']),
  m('urea', 'Urea / BUN', 'Kidney & Electrolytes', 'mg/dL', ['urea', 'bun', 'blood urea', 'blood urea nitrogen', 'urea nitrogen', 'ureia']),
  m('sodium', 'Sodium', 'Kidney & Electrolytes', 'mmol/L', ['sodium', 'sódio', 'sodio']),
  m('potassium', 'Potassium', 'Kidney & Electrolytes', 'mmol/L', ['potassium', 'potássio', 'potassio']),
  m('chloride', 'Chloride', 'Kidney & Electrolytes', 'mmol/L', ['chloride', 'cloreto', 'cloro']),
  m('bicarbonate', 'Bicarbonate', 'Kidney & Electrolytes', 'mmol/L', ['bicarbonate', 'co2', 'carbon dioxide', 'total co2']),
  m('calcium', 'Calcium', 'Kidney & Electrolytes', 'mg/dL', ['calcium', 'adjusted calcium', 'corrected calcium', 'cálcio', 'calcio']),
  m('phosphorus', 'Phosphorus', 'Kidney & Electrolytes', 'mg/dL', ['phosphorus', 'phosphate', 'fósforo', 'fosforo']),

  // ── Liver ──────────────────────────────────────────────────────────────────
  m('alt', 'ALT', 'Liver', 'U/L', ['alt', 'alanine', 'alanine aminotransferase', 'sgpt', 'tgp'], { high: 40 }),
  m('ast', 'AST', 'Liver', 'U/L', ['ast', 'aspartate', 'aspartate aminotransferase', 'sgot', 'tgo'], { high: 40 }),
  m('ggt', 'GGT', 'Liver', 'U/L', ['ggt', 'gamma-gt', 'gamma gt', 'gamma-glutamyl transferase', 'gamma glutamyl transferase', 'gama gt']),
  m('alp', 'ALP', 'Liver', 'U/L', ['alp', 'alkaline phosphatase', 'alk phos', 'fosfatase alcalina']),
  m('total_bilirubin', 'Total Bilirubin', 'Liver', 'mg/dL', ['total bilirubin', 'bilirubin total', 'bilirubin', 'bilirrubina total']),
  m('direct_bilirubin', 'Direct Bilirubin', 'Liver', 'mg/dL', ['direct bilirubin', 'bilirubin direct', 'conjugated bilirubin', 'bilirrubina direta']),
  m('albumin', 'Albumin', 'Liver', 'g/dL', ['albumin', 'albumina']),
  m('globulin', 'Globulin', 'Liver', 'g/dL', ['globulin', 'globulins', 'globulina']),
  m('total_protein', 'Total Protein', 'Liver', 'g/dL', ['total protein', 'protein total', 'proteínas totais', 'proteinas totais']),
  m('ag_ratio', 'Albumin/Globulin Ratio', 'Liver', '', ['albumin/globulin ratio', 'a/g ratio']),

  // ── Thyroid ────────────────────────────────────────────────────────────────
  m('tsh', 'TSH', 'Thyroid', 'mIU/L', ['tsh', 'thyroid stimulating', 'thyroid-stimulating', 'thyrotropin'], { low: 0.5, high: 2.5 }),
  m('free_t4', 'Free T4', 'Thyroid', 'ng/dL', ['free t4', 'ft4', 't4 free', 'free thyroxine', 't4 livre']),
  m('free_t3', 'Free T3', 'Thyroid', 'pg/mL', ['free t3', 'ft3', 't3 free', 'free triiodothyronine', 't3 livre']),
  m('reverse_t3', 'Reverse T3', 'Thyroid', 'ng/dL', ['reverse t3', 'rt3']),
  m('t3', 'T3', 'Thyroid', 'ng/dL', ['t3', 'total t3', 'triiodothyronine']),
  m('t4', 'T4', 'Thyroid', 'µg/dL', ['t4', 'total t4', 'thyroxine']),
  m('anti_tpo', 'Anti-TPO', 'Thyroid', 'IU/mL', ['anti-tpo', 'tpo antibodies', 'thyroid peroxidase', 'tpo ab']),
  m('anti_tg', 'Anti-Thyroglobulin', 'Thyroid', 'IU/mL', ['anti-thyroglobulin', 'thyroglobulin antibodies', 'anti-tg']),

  // ── Vitamins & Minerals ────────────────────────────────────────────────────
  m('vitamin_d', 'Vitamin D (25-OH)', 'Vitamins & Minerals', 'ng/mL', ['vitamin d', '25-oh', '25 hydroxy', '25-hydroxy', '25(oh)d', 'vitamina d'], { low: 40, high: 80 }),
  m('vitamin_b12', 'Vitamin B12', 'Vitamins & Minerals', 'pg/mL', ['vitamin b12', 'vitamin b-12', 'b12', 'active b12', 'cobalamin', 'vitamina b12']),
  m('folate', 'Folate', 'Vitamins & Minerals', 'ng/mL', ['folate', 'folic acid', 'folato', 'ácido fólico', 'acido folico']),
  m('iron', 'Iron', 'Vitamins & Minerals', 'µg/dL', ['iron', 'serum iron', 'ferro']),
  m('tibc', 'TIBC', 'Vitamins & Minerals', 'µg/dL', ['tibc', 'total iron binding capacity', 'total iron-binding capacity']),
  m('transferrin_sat', 'Transferrin Saturation', 'Vitamins & Minerals', '%', ['transferrin saturation', 'iron saturation', 'tsat']),
  m('transferrin', 'Transferrin', 'Vitamins & Minerals', 'mg/dL', ['transferrin', 'transferrina']),
  m('magnesium', 'Magnesium', 'Vitamins & Minerals', 'mg/dL', ['magnesium', 'magnésio', 'magnesio']),
  m('zinc', 'Zinc', 'Vitamins & Minerals', 'µg/dL', ['zinc', 'zinco']),

  // ── Inflammation ───────────────────────────────────────────────────────────
  m('crp', 'hs-CRP', 'Inflammation', 'mg/L', ['crp', 'hscrp', 'hs-crp', 'hs crp', 'c-reactive', 'c reactive', 'high sensitivity crp', 'pcr'], { high: 1 }),
  m('homocysteine', 'Homocysteine', 'Inflammation', 'µmol/L', ['homocysteine', 'homocisteína', 'homocisteina']),
  m('esr', 'ESR', 'Inflammation', 'mm/h', ['esr', 'erythrocyte sedimentation rate', 'sed rate', 'vhs']),
  m('fibrinogen', 'Fibrinogen', 'Inflammation', 'mg/dL', ['fibrinogen', 'fibrinogênio', 'fibrinogenio']),
  m('nt_probnp', 'NT-proBNP', 'Inflammation', 'pg/mL', ['nt-probnp', 'nt probnp', 'bnp']),
]

// Length-sorted alias index, built once. Longer aliases must win so
// "non-hdl cholesterol" beats "hdl" and "free testosterone" beats
// "testosterone".
type AliasIndex = { alias: string; entry: Entry }
let ALIAS_INDEX: AliasIndex[] | null = null
function ensureAliasIndex(): AliasIndex[] {
  if (ALIAS_INDEX) return ALIAS_INDEX
  const flat: AliasIndex[] = []
  for (const entry of CATALOG) for (const alias of entry.aliases) flat.push({ alias, entry })
  flat.sort((a, b) => b.alias.length - a.alias.length)
  ALIAS_INDEX = flat
  return flat
}

// Whole-word match so "hdl" never matches inside "non-hdl cholesterol"
// and "ast" never matches inside "fast".
function matchesAsWord(needle: string, alias: string): boolean {
  let from = 0
  for (;;) {
    const i = needle.indexOf(alias, from)
    if (i < 0) return false
    const before = i === 0 ? '' : needle[i - 1]
    const after = i + alias.length === needle.length ? '' : needle[i + alias.length]
    const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c)
    if (!isWordChar(before) && !isWordChar(after)) return true
    from = i + 1
  }
}

function strip(entry: Entry): MarkerMeta {
  const { aliases: _aliases, ...meta } = entry
  void _aliases
  return meta
}

export function canonicalize(raw: string): MarkerMeta | undefined {
  const needle = raw.toLowerCase().trim()
  if (!needle) return undefined
  for (const { alias, entry } of ensureAliasIndex()) {
    if (needle === alias || matchesAsWord(needle, alias)) return strip(entry)
  }
  return undefined
}

export function metaForKey(key: string): MarkerMeta | undefined {
  const found = CATALOG.find((entry) => entry.key === key)
  return found ? strip(found) : undefined
}

export function allMarkerMeta(): MarkerMeta[] {
  return CATALOG.map(strip)
}

export const PANEL_ORDER: LabPanel[] = [
  'Sex Hormones',
  'Lipids',
  'Blood Count',
  'Metabolic',
  'Kidney & Electrolytes',
  'Liver',
  'Thyroid',
  'Vitamins & Minerals',
  'Inflammation',
  'Other',
]
