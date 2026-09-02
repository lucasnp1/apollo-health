// Shared vocabulary for lab-report parsing: marker name variants, units,
// plausibility bounds and number parsing. Used by the line parser
// (labParse.ts), the flattened-text fallback (pdf.ts) and the OCR path.
//
// MARKER_VARIANTS rows are [canonical, ...aliases]. The FIRST entry is what
// the extractor reports; markers.ts then folds it onto the catalog label so
// "HDL Cholesterol" and "HDL" end up in the same history line. Be generous
// with aliases: most "nothing was found in my PDF" reports come from a lab
// printing a name we don't recognise. UK, US and Brazilian spellings included.

export const MARKER_VARIANTS: Array<[canonical: string, ...aliases: string[]]> = [
  // ── Hormones ────────────────────────────────────────────────────────
  ['Total Testosterone', 'Testosterone Total', 'Testosterone, Total', 'Testosterone (Total)', 'Total Testosterone Serum', 'Testosterone Serum', 'Serum Testosterone', 'Testosterona Total'],
  ['Free Testosterone', 'Testosterone Free', 'Testosterone, Free', 'Testosterone (Free)', 'Calculated Free Testosterone', 'Free Testosterone (Calculated)', 'Free Testosterone Calculated', 'Calc Free Testosterone', 'Free Testosterone Direct', 'Testosterona Livre'],
  ['Testosterone', 'Testosterona'],
  ['Bioavailable Testosterone', 'Testosterone Bioavailable', 'Bioavailable Testosterone Calc'],
  ['Free Androgen Index', 'FAI'],
  ['Estradiol', 'Oestradiol', 'Oestradiol (Sensitive)', 'Estradiol (Sensitive)', 'Estradiol Sensitive', 'Estradiol, Sensitive', 'Ultrasensitive Estradiol', 'Estradiol Ultrasensitive', 'Estradiol, Ultrasensitive', 'Estradiol (E2)', 'Oestradiol (E2)', 'E2'],
  ['Estrone', 'Oestrone', 'E1'],
  ['SHBG', 'Sex Hormone Binding Globulin', 'Sex Hormone-Binding Globulin', 'Sex Hormone Binding Glob'],
  ['DHEA-S', 'DHEA Sulfate', 'DHEA Sulphate', 'DHEA-SO4', 'DHEAS', 'DHEA', 'Dehydroepiandrosterone Sulfate', 'Dehydroepiandrosterone'],
  ['DHT', 'Dihydrotestosterone'],
  ['Progesterone', 'Progesterona'],
  ['Prolactin', 'Prolactina'],
  ['LH', 'Luteinizing Hormone', 'Luteinising Hormone', 'Luteinising Hormone (LH)', 'Luteinizing Hormone (LH)'],
  ['FSH', 'Follicle Stimulating Hormone', 'Follicle-Stimulating Hormone', 'Follicle Stimulating Hormone (FSH)'],
  ['Cortisol', 'Cortisol AM', 'Cortisol (AM)', 'Cortisol, AM', 'Morning Cortisol', 'Serum Cortisol'],
  ['IGF-1', 'IGF1', 'IGF 1', 'Insulin-like Growth Factor 1', 'Insulin Like Growth Factor 1', 'Insulin-Like Growth Factor-1', 'Insulin-like Growth Factor I', 'Somatomedin C'],

  // ── Thyroid ─────────────────────────────────────────────────────────
  ['TSH', 'Thyroid Stimulating Hormone', 'Thyroid Stimulating Hormone (TSH)', 'Thyrotropin', 'Thyroid-Stimulating Hormone'],
  ['Free T3', 'FT3', 'T3 Free', 'T3, Free', 'Free Triiodothyronine', 'Triiodothyronine Free', 'T3 Livre'],
  ['Free T4', 'FT4', 'T4 Free', 'T4, Free', 'Free Thyroxine', 'Thyroxine Free', 'T4 Livre'],
  ['Reverse T3', 'rT3', 'T3 Reverse', 'Reverse Triiodothyronine'],
  ['T3', 'Triiodothyronine', 'Total T3', 'T3 Total'],
  ['T4', 'Thyroxine', 'Total T4', 'T4 Total'],
  ['Anti-TPO', 'TPO Antibodies', 'Thyroid Peroxidase Antibodies', 'Thyroid Peroxidase', 'Thyroid Peroxidase Ab', 'TPO Ab', 'Anti-TPO Antibodies'],
  ['Anti-Thyroglobulin', 'Thyroglobulin Antibodies', 'Thyroglobulin Ab', 'Anti-Tg'],

  // ── Lipids ──────────────────────────────────────────────────────────
  ['Total Cholesterol', 'Cholesterol Total', 'Cholesterol, Total', 'Cholesterol (Total)', 'Colesterol Total', 'Cholesterol'],
  ['HDL Cholesterol', 'HDL-C', 'HDL-Cholesterol', 'HDL Cholesterol Direct', 'Cholesterol HDL', 'HDL Chol', 'High-Density Lipoprotein', 'High Density Lipoprotein', 'Colesterol HDL', 'HDL'],
  ['LDL Cholesterol', 'LDL-C', 'LDL-Cholesterol', 'LDL Cholesterol Calc', 'LDL Cholesterol (Calculated)', 'LDL Chol Calc', 'LDL Chol Calc (NIH)', 'Cholesterol LDL', 'LDL Chol', 'Low-Density Lipoprotein', 'Low Density Lipoprotein', 'Colesterol LDL', 'LDL'],
  ['VLDL Cholesterol', 'VLDL-C', 'VLDL'],
  ['Non-HDL Cholesterol', 'Non HDL Cholesterol', 'Non-HDL-C', 'Non-HDL Chol', 'Non HDL', 'Non-HDL', 'Colesterol Nao-HDL', 'Colesterol Não-HDL'],
  ['Triglycerides', 'Triglyceride', 'Triglicerides', 'Triglicérides', 'Trigliceridos', 'Triglicerídeos', 'TRIG', 'TG'],
  ['ApoB', 'Apolipoprotein B', 'Apo B', 'Apo-B', 'Apolipoprotein B-100'],
  ['ApoA1', 'Apolipoprotein A1', 'Apo A1', 'Apo-A1', 'Apolipoprotein A-1', 'Apolipoprotein A-I'],
  ['Lp(a)', 'Lipoprotein(a)', 'Lipoprotein (a)', 'Lipoprotein A', 'Lipoprotein a'],
  ['Cholesterol/HDL Ratio', 'Total Cholesterol : HDL', 'Total Cholesterol/HDL Ratio', 'Total Cholesterol / HDL Ratio', 'Cholesterol : HDL Ratio', 'Cholesterol/HDL', 'Chol/HDL Ratio', 'Chol:HDL Ratio', 'Chol:HDL', 'TC/HDL Ratio', 'TC/HDL', 'TC:HDL', 'Cholesterol HDL Ratio'],

  // ── Complete Blood Count + differentials ────────────────────────────
  ['Hemoglobin', 'Haemoglobin', 'Haemoglobin (Hb)', 'Hemoglobin (Hgb)', 'Hemoglobin (Hb)', 'Haemoglobin Concentration', 'Hemoglobin Concentration', 'Hemoglobina', 'Hgb', 'Hb'],
  ['Hematocrit', 'Haematocrit', 'Haematocrit (HCT)', 'Hematocrit (HCT)', 'Packed Cell Volume', 'Hematócrito', 'Hematocrito', 'HCT', 'Hct', 'PCV'],
  ['MCV', 'Mean Cell Volume', 'Mean Cell Volume (MCV)', 'Mean Corpuscular Volume', 'Mean Corpuscular Volume (MCV)', 'Red Blood Cell Mean Cell Volume', 'VCM'],
  ['MCH', 'Mean Cell Haemoglobin', 'Mean Cell Hemoglobin', 'Mean Corpuscular Haemoglobin', 'Mean Corpuscular Hemoglobin', 'HCM'],
  ['MCHC', 'Mean Cell Haemoglobin Concentration', 'Mean Cell Hemoglobin Concentration', 'Mean Corpuscular Haemoglobin Concentration', 'Mean Corpuscular Hemoglobin Concentration', 'CHCM'],
  ['RDW', 'Red Cell Distribution Width', 'RDW-CV', 'RDW-SD', 'Red Cell Dist Width'],
  ['Red Blood Cell Count', 'Red Blood Cells', 'Red Cell Count', 'RBC Count', 'Erythrocyte Count', 'Erythrocytes', 'Hemácias', 'Hemacias', 'Eritrócitos', 'Eritrocitos', 'RBC'],
  ['White Blood Cell Count', 'White Blood Cells', 'White Cell Count', 'Total White Cell Count', 'WBC Count', 'Leukocyte Count', 'Leukocytes', 'Leucócitos', 'Leucocitos', 'WBC'],
  ['Platelet Count', 'Platelets', 'Platelets (PLT)', 'Plaquetas', 'PLT'],
  ['MPV', 'Mean Platelet Volume', 'VPM'],
  ['Neutrophil Count', 'Neutrophils', 'Neutrophils Absolute', 'Abs Neutrophils', 'Absolute Neutrophils', 'Neutrófilos', 'Neutrofilos', 'Neutrophil'],
  ['Lymphocyte Count', 'Lymphocytes', 'Lymphocytes Absolute', 'Abs Lymphocytes', 'Absolute Lymphocytes', 'Linfócitos', 'Linfocitos', 'Lymphocyte'],
  ['Monocyte Count', 'Monocytes', 'Monocytes Absolute', 'Abs Monocytes', 'Monócitos', 'Monocitos', 'Monocyte'],
  ['Eosinophil Count', 'Eosinophils', 'Eosinophils Absolute', 'Abs Eosinophils', 'Eosinófilos', 'Eosinofilos', 'Eosinophil'],
  ['Basophil Count', 'Basophils', 'Basophils Absolute', 'Abs Basophils', 'Basófilos', 'Basofilos', 'Basophil'],
  ['Reticulocytes', 'Reticulocyte Count', 'Retic Count', 'Reticulócitos'],
  ['ESR', 'Erythrocyte Sedimentation Rate', 'Sed Rate', 'VHS'],

  // ── Metabolic / kidney / electrolytes ───────────────────────────────
  ['Glucose', 'Fasting Glucose', 'Glucose Fasting', 'Glucose, Fasting', 'Glucose (Fasting)', 'Fasting Blood Glucose', 'Blood Glucose', 'Glucose Serum', 'Glicose', 'Glicemia', 'Glicemia de Jejum'],
  ['HbA1c', 'Glycated Haemoglobin', 'Glycated Hemoglobin', 'Glycated Haemoglobin (HbA1c)', 'Haemoglobin A1c', 'Hemoglobin A1c', 'HbA1c (IFCC)', 'HbA1c IFCC', 'Hemoglobina Glicada', 'A1c', 'A1C'],
  ['Insulin', 'Fasting Insulin', 'Insulin Fasting', 'Insulin, Fasting', 'Insulina'],
  ['HOMA-IR', 'HOMA IR', 'HOMA'],
  ['Creatinine', 'Creatinine Serum', 'Serum Creatinine', 'Creatinina'],
  ['Cystatin C', 'Cystatin-C', 'Cistatina C'],
  ['eGFR', 'Estimated GFR', 'eGFR (CKD-EPI)', 'eGFR CKD-EPI', 'Estimated GFR (CKD-EPI)', 'GFR Estimated', 'GFR (Estimated)', 'GFR', 'TFG'],
  ['BUN', 'Blood Urea Nitrogen', 'Urea Nitrogen', 'Urea (BUN)', 'Urea', 'Ureia'],
  ['Uric Acid', 'Urate', 'Serum Urate', 'Ácido Úrico', 'Acido Urico'],
  ['Sodium', 'Sódio', 'Sodio'],
  ['Potassium', 'Potássio', 'Potassio'],
  ['Chloride', 'Cloreto', 'Cloro'],
  ['Bicarbonate', 'CO2', 'Carbon Dioxide', 'Total CO2'],
  ['Calcium', 'Calcium (Adjusted)', 'Adjusted Calcium', 'Corrected Calcium', 'Calcium Adjusted', 'Cálcio', 'Calcio'],
  ['Magnesium', 'Magnesium (Serum)', 'Serum Magnesium', 'Magnésio', 'Magnesio'],
  ['Phosphorus', 'Phosphate', 'Fósforo', 'Fosforo'],
  ['Zinc', 'Zinc (Serum)', 'Serum Zinc', 'Zinco'],
  ['Lipase', 'Lipase (Serum)'],
  ['Amylase', 'Amilase'],
  ['LDH', 'Lactate Dehydrogenase', 'Lactate Dehydrogenase (LDH)', 'Desidrogenase Lática'],

  // ── Liver ───────────────────────────────────────────────────────────
  ['ALT', 'Alanine Aminotransferase', 'Alanine Aminotransferase (ALT)', 'Alanine Transaminase', 'ALT (SGPT)', 'SGPT', 'TGP'],
  ['AST', 'Aspartate Aminotransferase', 'Aspartate Aminotransferase (AST)', 'Aspartate Transaminase', 'AST (SGOT)', 'SGOT', 'TGO'],
  ['ALP', 'Alkaline Phosphatase', 'Alkaline Phosphatase (ALP)', 'Alk Phos', 'Fosfatase Alcalina'],
  ['GGT', 'Gamma GT', 'Gamma-GT', 'Gamma GT (GGT)', 'Gamma-Glutamyl Transferase', 'Gamma Glutamyl Transferase', 'Gamma-Glutamyltransferase', 'Gamma Glutamyltransferase', 'Gama GT', 'Gama-GT'],
  ['Total Bilirubin', 'Bilirubin Total', 'Bilirubin, Total', 'Bilirubin (Total)', 'Bilirrubina Total', 'Bilirubin'],
  ['Direct Bilirubin', 'Bilirubin Direct', 'Bilirubin, Direct', 'Conjugated Bilirubin', 'Bilirrubina Direta'],
  ['Albumin', 'Albumin (Serum)', 'Serum Albumin', 'Albumina'],
  ['Globulin', 'Globulins', 'Globulina'],
  ['Total Protein', 'Protein Total', 'Protein (Total)', 'Protein, Total', 'Proteínas Totais', 'Proteinas Totais'],
  ['Albumin/Globulin Ratio', 'A/G Ratio', 'Albumin : Globulin Ratio'],
  ['Creatine Kinase', 'Creatine Kinase (CK)', 'Creatine Phosphokinase', 'Creatine Kinase Total', 'CK Total', 'CPK', 'CK'],

  // ── Vitamins / minerals / iron ──────────────────────────────────────
  ['Vitamin D', '25-Hydroxy Vitamin D', '25-Hydroxyvitamin D', 'Vitamin D (25-OH)', '25-OH Vitamin D', '25 OH Vitamin D', 'Vitamin D 25-Hydroxy', 'Vitamin D, 25-Hydroxy', 'Vitamin D Total', 'Vitamin D3', '25(OH)D', '25-OH-D', 'Vitamina D'],
  ['Vitamin B12', 'Vitamin B-12', 'Active Vitamin B12', 'Vitamin B12 - Active', 'Active B12', 'B12 Active', 'Cobalamin', 'Vitamina B12', 'B12'],
  ['Folate', 'Folic Acid', 'Folate (Serum)', 'Serum Folate', 'Ácido Fólico', 'Acido Folico', 'Folato'],
  ['Iron', 'Iron (Serum)', 'Serum Iron', 'Ferro', 'Ferro Sérico'],
  ['Ferritin', 'Ferritina'],
  ['TIBC', 'Total Iron Binding Capacity', 'Total Iron-Binding Capacity'],
  ['Transferrin Saturation', 'Iron Saturation', 'Saturação de Transferrina', 'TSAT'],
  ['Transferrin', 'Transferrina'],

  // ── Inflammation ────────────────────────────────────────────────────
  ['hsCRP', 'High Sensitivity CRP', 'High-Sensitivity CRP', 'CRP High Sensitivity', 'CRP (High Sensitivity)', 'C-Reactive Protein (High Sensitivity)', 'C-Reactive Protein High Sensitivity', 'CRP HS', 'CRP-HS', 'hs-CRP', 'hs CRP', 'PCR Ultrassensível', 'PCR Ultra Sensível'],
  ['CRP', 'C-Reactive Protein', 'C Reactive Protein', 'Proteína C Reativa', 'PCR'],
  ['Homocysteine', 'Homocisteína', 'Homocisteina'],
  ['Fibrinogen', 'Fibrinogênio', 'Fibrinogenio'],

  // ── Other ───────────────────────────────────────────────────────────
  ['PSA', 'Prostate Specific Antigen', 'Prostate-Specific Antigen', 'Prostate Specific Antigen (PSA)', 'PSA Total', 'Total PSA', 'PSA (Total)', 'PSA, Total'],
  ['Free PSA', 'PSA Free', 'PSA, Free'],
  ['Lp-PLA2', 'Lipoprotein-Associated Phospholipase A2'],
  ['NT-proBNP', 'NT proBNP', 'BNP'],
]

// Known lab units, lowercase and whitespace-free. A candidate whose unit
// isn't here is not thrown away, but it can never be "high" confidence.
const KNOWN_UNITS = new Set<string>([
  'ng/dl', 'ng/ml', 'ng/l',
  'pg/ml', 'pg/dl', 'pg/l',
  'pmol/l', 'nmol/l', 'µmol/l', 'umol/l', 'mcmol/l', 'mmol/l', 'mol/l',
  'meq/l', 'mmol/mol',
  'mg/dl', 'mg/l', 'g/dl', 'g/l',
  'µg/l', 'ug/l', 'mcg/l', 'µg/dl', 'ug/dl', 'mcg/dl', 'µg/ml', 'ug/ml', 'ng/100ml',
  'miu/l', 'iu/l', 'u/l', 'mu/l', 'µiu/ml', 'uiu/ml', 'miu/ml', 'iu/ml', 'u/ml', 'ku/l', 'kiu/l', 'ukat/l', 'µkat/l',
  '%', 'pct',
  'fl', 'pg',
  '10^9/l', '10^12/l', 'x10^9/l', 'x10^12/l', '10*9/l', '10*12/l', '10e9/l', '10e12/l', 'x10e9/l', 'x10e12/l', '10^3/µl', '10^3/ul', '10^6/µl', '10^6/ul', 'x10^3/µl', 'x10^3/ul', 'x10^6/µl', 'x10^6/ul', 'thou/µl', 'thou/ul', 'mil/µl', 'mil/ul', 'k/ul', 'm/ul', 'k/µl', 'm/µl', 'k/mm3', 'm/mm3', 'cells/ul', 'cells/µl', 'cells/mcl', '/µl', '/ul', '/mm3', 'mil/mm3', 'mil/mm³', '/mm³',
  'ratio', 'index',
  'ml/min', 'ml/min/1.73m2', 'ml/min/1.73m²', 'ml/min/1.73', 'ml/min/1,73m2', 'ml/min/1,73m²',
  'mmhg', 'mm/h', 'mm/hr', 'sec', 's', 'l/l',
])

export function isKnownUnit(u: string | undefined): boolean {
  if (!u) return false
  return KNOWN_UNITS.has(u.toLowerCase().replace(/μ/g, 'µ').replace(/\s+/g, ''))
}

// Tidy a raw unit token for display: fix liter capitalisation, restore the
// micro sign, normalise "10*9" style exponents. Unknown tokens pass through.
export function normalizeUnit(raw: string): string {
  let u = raw.trim().replace(/μ/g, 'µ').replace(/\s+/g, '')
  if (!u) return ''
  u = u.replace(/^x/i, '').replace(/10[*e](\d+)/i, '10^$1')
  const lower = u.toLowerCase()
  const fixed: Record<string, string> = {
    'ng/dl': 'ng/dL', 'ng/ml': 'ng/mL', 'ng/l': 'ng/L', 'pg/ml': 'pg/mL', 'pg/dl': 'pg/dL', 'pg/l': 'pg/L',
    'pmol/l': 'pmol/L', 'nmol/l': 'nmol/L', 'µmol/l': 'µmol/L', 'umol/l': 'µmol/L', 'mcmol/l': 'µmol/L', 'mmol/l': 'mmol/L', 'mmol/mol': 'mmol/mol',
    'meq/l': 'mEq/L', 'mg/dl': 'mg/dL', 'mg/l': 'mg/L', 'g/dl': 'g/dL', 'g/l': 'g/L',
    'µg/l': 'µg/L', 'ug/l': 'µg/L', 'mcg/l': 'µg/L', 'µg/dl': 'µg/dL', 'ug/dl': 'µg/dL', 'mcg/dl': 'µg/dL', 'µg/ml': 'µg/mL', 'ug/ml': 'µg/mL',
    'miu/l': 'mIU/L', 'iu/l': 'IU/L', 'u/l': 'U/L', 'mu/l': 'mU/L', 'µiu/ml': 'µIU/mL', 'uiu/ml': 'µIU/mL', 'miu/ml': 'mIU/mL', 'iu/ml': 'IU/mL', 'u/ml': 'U/mL', 'ku/l': 'kU/L', 'kiu/l': 'kIU/L',
    'fl': 'fL', 'pg': 'pg', 'pct': '%',
    '10^9/l': '10^9/L', '10^12/l': '10^12/L', '10^3/µl': '10^3/µL', '10^3/ul': '10^3/µL', '10^6/µl': '10^6/µL', '10^6/ul': '10^6/µL',
    'k/ul': 'K/µL', 'k/µl': 'K/µL', 'm/ul': 'M/µL', 'm/µl': 'M/µL', 'cells/ul': 'cells/µL', 'cells/µl': 'cells/µL', '/ul': '/µL', '/µl': '/µL',
    'ml/min': 'mL/min', 'ml/min/1.73m2': 'mL/min/1.73m²', 'ml/min/1.73m²': 'mL/min/1.73m²', 'ml/min/1.73': 'mL/min/1.73m²', 'ml/min/1,73m2': 'mL/min/1.73m²', 'ml/min/1,73m²': 'mL/min/1.73m²',
    'mmhg': 'mmHg', 'mm/h': 'mm/h', 'mm/hr': 'mm/h', 'l/l': 'L/L', 'ratio': 'ratio', 'index': 'index',
  }
  return fixed[lower] ?? u
}

// Plausibility bounds per canonical marker, covering the common unit systems
// (so the bound is wide). A value outside is almost always a misread.
export type Plausibility = { min?: number; max?: number }
export const PLAUSIBLE: Record<string, Plausibility> = {
  'Total Testosterone':   { min: 0.1,  max: 5000 },
  'Free Testosterone':    { min: 0.001, max: 2000 },
  'Testosterone':         { min: 0.1,  max: 5000 },
  'Estradiol':            { min: 0.5,  max: 3000 },
  'SHBG':                 { min: 1,    max: 400 },
  'Prolactin':            { min: 0.5,  max: 5000 },
  'LH':                   { min: 0,    max: 200 },
  'FSH':                  { min: 0,    max: 200 },
  'TSH':                  { min: 0.001, max: 200 },
  'Free T4':              { min: 0.1,  max: 100 },
  'Free T3':              { min: 0.1,  max: 50 },
  'Creatinine':           { min: 0.2,  max: 2000 },
  'eGFR':                 { min: 1,    max: 250 },
  'Total Cholesterol':    { min: 1,    max: 600 },
  'LDL Cholesterol':      { min: 0.3,  max: 500 },
  'HDL Cholesterol':      { min: 0.1,  max: 200 },
  'Non-HDL Cholesterol':  { min: 0.3,  max: 500 },
  'Triglycerides':        { min: 0.1,  max: 3000 },
  'Glucose':              { min: 1,    max: 600 },
  'HbA1c':                { min: 3,    max: 200 },
  'ALT':                  { min: 1,    max: 5000 },
  'AST':                  { min: 1,    max: 5000 },
  'ALP':                  { min: 5,    max: 2000 },
  'GGT':                  { min: 1,    max: 2000 },
  'Total Bilirubin':      { min: 0.05, max: 200 },
  'Albumin':              { min: 5,    max: 100 },
  'Globulin':             { min: 5,    max: 100 },
  'Total Protein':        { min: 20,   max: 200 },
  'Ferritin':             { min: 1,    max: 5000 },
  'Vitamin D':            { min: 1,    max: 600 },
  'Vitamin B12':          { min: 10,   max: 5000 },
  'CRP':                  { min: 0.05, max: 500 },
  'hsCRP':                { min: 0.05, max: 100 },
  'Hemoglobin':           { min: 3,    max: 250 },
  'Hematocrit':           { min: 0.1,  max: 75 },
  'Platelet Count':       { min: 5,    max: 2000 },
  'White Blood Cell Count': { min: 0.5, max: 200 },
  'Red Blood Cell Count': { min: 1,    max: 10 },
  'MCV':                  { min: 50,   max: 130 },
  'Sodium':               { min: 100,  max: 180 },
  'Potassium':            { min: 1.5,  max: 9 },
  'Calcium':              { min: 0.5,  max: 20 },
  'PSA':                  { min: 0,    max: 500 },
  'Creatine Kinase':      { min: 5,    max: 100000 },
}

export function isPlausible(canonical: string, value: number): boolean {
  const p = PLAUSIBLE[canonical]
  if (!p) return true
  return value >= (p.min ?? -Infinity) && value <= (p.max ?? Infinity)
}

// Parse a lab number. Handles "1,45" (decimal comma), "1,234" (thousands),
// "1.234,5" (European), "12." and leading operators are stripped by callers.
export function parseLabNumber(raw: string): number | undefined {
  let s = raw.trim().replace(/\s+/g, '')
  if (!s) return undefined
  // ".512" / ",512": OCR often loses the leading zero.
  if (/^-?[.,]\d/.test(s)) s = s.replace(/^(-?)([.,])/, '$10.')
  const commas = (s.match(/,/g) || []).length
  const dots = (s.match(/\./g) || []).length
  if (commas && dots) {
    // Whichever separator comes last is the decimal mark.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (commas === 1) {
    // "1,234" with exactly three trailing digits reads as a thousands group
    // only when the integer part is short; "62,5" and "0,78" are decimals.
    s = /^\d{1,3},\d{3}$/.test(s) ? s.replace(',', '') : s.replace(',', '.')
  } else if (commas > 1) {
    s = s.replace(/,/g, '')
  }
  s = s.replace(/\.$/, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

// OCR reads "O"/"@" for 0 and "l"/"I"/"|" for 1 inside numbers. Only touch
// tokens that are mostly digits (or a lone misread next to a decimal point)
// so words are never altered.
export function fixOcrDigits(line: string): string {
  return line.replace(/(?<![A-Za-z])[\dOo@Il|][\dOo@Il|.,]*(?![A-Za-z])/g, (tok) => {
    const digits = (tok.match(/\d/g) || []).length
    const suspects = (tok.match(/[Oo@Il|]/g) || []).length
    if (suspects === 0) return tok
    // Accept when digits dominate, or when the token is a decimal like "@.512" / "5@".
    if (digits === 0 || (digits < suspects && !/[.,]/.test(tok))) return tok
    return tok.replace(/[Oo@]/g, '0').replace(/[Il|]/g, '1')
  })
}
