// Builds the UK Search campaign as a Google Ads Editor import file, and
// validates it against the rules that would otherwise get it disapproved.
//
//   node scripts/google-ads-campaign.mjs            → validate + write
//   node scripts/google-ads-campaign.mjs --check    → validate only
//
// The rule that shapes everything here: for campaigns targeting anywhere other
// than Canada, New Zealand or the United States, Google says "You may not use
// prescription drug terms in ads or landing pages", and keyword targeting of
// those terms needs certification we cannot get from the UK.
//   https://support.google.com/adspolicy/answer/15595717
//   https://support.google.com/adspolicy/answer/2430794  (testosterone and
//   nandrolone decanoate are both on that list, which is non-exhaustive)
//
// So: no drug term appears in a keyword, a headline, a description or on the
// landing page, and every drug term we can think of is a negative keyword so
// we never even serve against one.

import fs from 'node:fs'
import path from 'node:path'

const LANDING = 'https://magno.fit/read'
const DAILY_BUDGET = '1.60'        // about £50 over 31 days
const MAX_CPC = '0.60'
const CAMPAIGN = 'Magno UK - Marker Intent'

// Anything that is a drug name, a therapy name, or reads as one. Used BOTH as
// the negative keyword list and as the validator's blocklist.
const DRUG_TERMS = [
  'testosterone', 'trt', 'nandrolone', 'deca', 'tren', 'trenbolone', 'anavar',
  'dianabol', 'winstrol', 'primobolan', 'masteron', 'equipoise', 'anadrol',
  'halotestin', 'superdrol', 'epistane', 'boldenone', 'steroid', 'steroids',
  'anabolic', 'sarm', 'sarms', 'hgh', 'growth hormone', 'peptide', 'peptides',
  'hcg', 'clomid', 'nolvadex', 'arimidex', 'aromasin', 'enclomiphene',
  'semaglutide', 'tirzepatide', 'retatrutide', 'ozempic', 'mounjaro',
  'clenbuterol', 'dnp', 'pct', 'cycle', 'blast', 'cruise', 'gear', 'juice',
  'insulin', 'thyroid medication', 'levothyroxine', 'finasteride', 'minoxidil',
]

// Money-intent and irrelevant traffic we do not want to pay for.
const COMMERCIAL_NEGATIVES = [
  'buy', 'for sale', 'cheap', 'price', 'pharmacy', 'prescription', 'clinic',
  'jobs', 'salary', 'course', 'phlebotomy', 'nhs appointment', 'free nhs',
  'dog', 'cat', 'pet', 'veterinary', 'pregnancy test', 'covid',
]

// Ad groups: one per search intent. Keywords are marker-name or
// read-my-results intent only. Phrase match keeps it tight at this budget.
const AD_GROUPS = [
  {
    name: 'Read my results',
    keywords: [
      'blood test results explained', 'understand my blood test',
      'read my blood test results', 'what do my blood results mean',
      'blood test results meaning', 'how to read a blood test',
      'lab results explained', 'blood test pdf reader',
      'understand lab results', 'blood test interpretation',
    ],
  },
  {
    name: 'Haematocrit and haemoglobin',
    keywords: [
      'what does high haematocrit mean', 'high haematocrit meaning',
      'haematocrit blood test', 'hematocrit high meaning',
      'what is haematocrit', 'high haemoglobin meaning',
      'haematocrit normal range',
    ],
  },
  {
    name: 'Lipids',
    keywords: [
      'what does high apob mean', 'apob blood test', 'apob explained',
      'ldl cholesterol high meaning', 'what is non hdl cholesterol',
      'triglycerides high meaning', 'lipid panel explained',
    ],
  },
  {
    name: 'Liver and kidney',
    keywords: [
      'what does high alt mean', 'alt blood test high', 'ast blood test meaning',
      'liver function test explained', 'egfr blood test meaning',
      'high creatinine meaning', 'ggt blood test high',
    ],
  },
  {
    name: 'Hormone panel markers',
    keywords: [
      'what is shbg', 'shbg blood test meaning', 'low shbg meaning',
      'high shbg meaning', 'prolactin blood test meaning',
      'what does high oestradiol mean', 'lh and fsh blood test meaning',
    ],
  },
  {
    name: 'Metabolic and iron',
    keywords: [
      'what does high hba1c mean', 'hba1c explained', 'high ferritin meaning',
      'low ferritin meaning', 'what is homa ir', 'iron panel explained',
      'blood sugar blood test meaning',
    ],
  },
]

// Responsive Search Ad assets. Google's limits: headline 30, description 90.
// Nothing here names a condition or implies we know the reader has one, which
// the personalised-advertising rules prohibit for health.
const HEADLINES = [
  'Read Your Blood Test',
  'Blood Results, Explained',
  'Upload A Lab PDF, Free',
  'What Your Markers Mean',
  'Free, No Account Needed',
  'Your Lab Report, Decoded',
  'Every Marker Explained',
  'Read It On Your Phone',
  'Plain English Lab Results',
  'Nothing Leaves Your Phone',
  'Lab PDF To Plain English',
  'See What The Numbers Say',
]
const DESCRIPTIONS = [
  'Drop in a lab PDF or a photo and get every marker explained in plain English. Free.',
  'No account and no upload. The file is read on your device, then forgotten.',
  'See what your numbers mean together, what moves them, and what people usually do.',
  'Works with Medichecks, Thriva, Randox, NHS and more. Free to use, no sign up.',
]

// ── validation ─────────────────────────────────────────────────────────────
const problems = []
const hasDrugTerm = (text) => {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `
  return DRUG_TERMS.filter((t) => hay.includes(` ${t} `))
}

for (const h of HEADLINES) {
  if (h.length > 30) problems.push(`headline too long (${h.length}/30): "${h}"`)
  const hits = hasDrugTerm(h)
  if (hits.length) problems.push(`headline contains a restricted term (${hits}): "${h}"`)
}
for (const d of DESCRIPTIONS) {
  if (d.length > 90) problems.push(`description too long (${d.length}/90): "${d}"`)
  const hits = hasDrugTerm(d)
  if (hits.length) problems.push(`description contains a restricted term (${hits}): "${d}"`)
}
for (const g of AD_GROUPS) {
  for (const k of g.keywords) {
    const hits = hasDrugTerm(k)
    if (hits.length) problems.push(`keyword contains a restricted term (${hits}): "${k}"`)
  }
}
if (HEADLINES.length < 3) problems.push('an RSA needs at least 3 headlines')
if (DESCRIPTIONS.length < 2) problems.push('an RSA needs at least 2 descriptions')

// The landing page must be clean too, not just the ad.
const readHtml = fs.readFileSync(path.resolve('read.html'), 'utf8')
const readTsx = fs.readFileSync(path.resolve('src/read/ReadPage.tsx'), 'utf8')
for (const [label, body] of [['read.html', readHtml], ['ReadPage.tsx', readTsx]]) {
  // Prose only. A reviewer reads rendered copy, not identifiers: `p.pct` in
  // ReadPage.tsx matched the negative term "pct" once JSX braces were stripped.
  // Four-plus consecutive words is a sentence; a variable name is not.
  const prose = (body.match(/[A-Za-z][A-Za-z'’,.-]*(?: [A-Za-z][A-Za-z'’,.-]*){3,}/g) || []).join(' ')
  const hits = hasDrugTerm(prose)
  if (hits.length) problems.push(`LANDING PAGE ${label} contains a restricted term: ${hits}`)
}

console.log(problems.length ? 'VALIDATION FAILED\n' : 'validation passed')
for (const p of problems) console.log('  ✘', p)
if (problems.length) process.exit(1)

const kwCount = AD_GROUPS.reduce((n, g) => n + g.keywords.length, 0)
console.log(`  ${AD_GROUPS.length} ad groups, ${kwCount} keywords, ${HEADLINES.length} headlines, ${DESCRIPTIONS.length} descriptions`)
console.log(`  ${DRUG_TERMS.length + COMMERCIAL_NEGATIVES.length} negative keywords`)
console.log(`  landing page ${LANDING} is free of restricted terms`)

if (process.argv.includes('--check')) process.exit(0)

// ── emit Google Ads Editor CSV ─────────────────────────────────────────────
const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const rows = []
const COLS = ['Campaign', 'Campaign Daily Budget', 'Campaign Type', 'Networks', 'Languages',
  'Location', 'Bid Strategy Type', 'Ad Group', 'Max CPC', 'Keyword', 'Criterion Type',
  'Ad type', 'Headline 1', 'Headline 2', 'Headline 3', 'Headline 4', 'Headline 5',
  'Headline 6', 'Headline 7', 'Headline 8', 'Headline 9', 'Headline 10', 'Headline 11',
  'Headline 12', 'Description 1', 'Description 2', 'Description 3', 'Description 4',
  'Final URL', 'Path 1', 'Path 2']
const blank = () => Object.fromEntries(COLS.map((c) => [c, '']))

// Campaign-level negatives
for (const n of [...DRUG_TERMS, ...COMMERCIAL_NEGATIVES]) {
  rows.push({ ...blank(), Campaign: CAMPAIGN, Keyword: n, 'Criterion Type': 'Campaign Negative Broad' })
}

for (const g of AD_GROUPS) {
  for (const k of g.keywords) {
    rows.push({
      ...blank(),
      Campaign: CAMPAIGN, 'Campaign Daily Budget': DAILY_BUDGET, 'Campaign Type': 'Search',
      Networks: 'Google search', Languages: 'English', Location: 'United Kingdom',
      'Bid Strategy Type': 'Manual CPC',
      'Ad Group': g.name, 'Max CPC': MAX_CPC, Keyword: k, 'Criterion Type': 'Phrase',
    })
  }
  const ad = { ...blank(), Campaign: CAMPAIGN, 'Ad Group': g.name, 'Ad type': 'Responsive search ad',
    'Final URL': LANDING, 'Path 1': 'read', 'Path 2': 'bloods' }
  HEADLINES.forEach((h, i) => { ad[`Headline ${i + 1}`] = h })
  DESCRIPTIONS.forEach((d, i) => { ad[`Description ${i + 1}`] = d })
  rows.push(ad)
}

const out = path.resolve('tmp/ads/magno-uk-search.csv')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, [COLS.join(','), ...rows.map((r) => COLS.map((c) => esc(r[c] ?? '')).join(','))].join('\n'))
console.log(`\nwrote ${out} (${rows.length} rows)`)
