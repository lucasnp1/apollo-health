// What each felt symptom is often linked to, for the Wellbeing summary.
// Drafted then fact-checked twice (accuracy, and harm reduction for this
// audience) on 28 Sept 2026, and kept consistent with labCopy.ts. Wording is
// hedged on purpose: a pattern and a pointer, never a diagnosis or a dose.
//
// Key: `${symptom}:${'high' | 'low'}`. `high` = a side effect was felt, `low` =
// a good thing was poor. Only the FIRST matching compound line is shown, so
// order them by what is most useful to hear (an AI before tren for low libido:
// more AI is the risky reflex there).

import type { CauseRule } from './wellbeingSummary'

const AI = /anastrozole|arimidex|letrozole|femara|exemestane|aromasin/i
const NORS = /tren|nandrolone|durabolin|\bdeca\b|\bnpp\b/i
// GH and GH boosters. HGH Frag 176-191 does not raise IGF-1, so it is left out.
const GH = /\bh?gh\b(?![\s-]*frag)|growth hormone|somatropin|genotropin|norditropin|omnitrope|humatrope|mk-?677|ibutamoren|ipamorelin|\bcjc|tesamorelin|sermorelin/i
const GLP1 = /retatrutide|semaglutide|tirzepatide|liraglutide|ozempic|wegovy|mounjaro|zepbound|saxenda|\bglp/i
const ORALS_BP = /anadrol|oxymetholone|dianabol|methandrostenolone|methandienone|\bdbol\b/i
const HCG = /\bhcg\b|pregnyl|ovidrel|novarel|gonadotropin/i

export const CAUSES: Record<string, CauseRule> = {
  'mood:low': {
    line: 'Low mood is often linked to estradiol too low or too high, or to prolactin on nandrolone or tren.',
    markers: ['estradiol', 'prolactin'],
    markerDirection: ['either', 'high'],
    compounds: [
      { match: AI, line: 'An AI can crash estradiol, and crashed E2 often shows up as flat mood.' },
      { match: /tren/i, line: 'Trenbolone is known for anxiety, irritability and low mood in some people.' },
      { match: /nandrolone|durabolin|\bdeca\b|\bnpp\b/i, line: 'Nandrolone can flatten mood and drive in some people, and it can raise prolactin.' },
      { match: /\bclomiphene|\bclomid|serophene/i, line: 'Clomiphene, common in PCT, is known for mood swings and low mood in some people.' },
      { match: /finasteride|propecia|proscar/i, line: 'Finasteride lists low mood as a possible side effect, worth raising with your doctor.' },
    ],
    guide: 'estradiol',
  },
  'energy:low': {
    line: 'Low energy is often linked to low ferritin if you donate blood, a low testosterone trough or a slow thyroid.',
    markers: ['ferritin', 'total_testosterone', 'tsh'],
    markerDirection: ['low', 'low', 'high'],
    compounds: [
      { match: GLP1, line: 'GLP-1 drugs like retatrutide cut appetite, and eating too little often shows up as low energy.' },
      { match: AI, line: 'An AI can push estradiol too low, which often feels like fatigue.' },
      { match: /tren/i, line: 'Trenbolone often disrupts sleep, which can show up as low energy the next day.' },
    ],
    guide: 'ferritin',
  },
  'sleep:low': {
    line: 'Poor sleep is often linked to tren or stimulants. Loud snoring can mean apnea, which also lifts hematocrit.',
    markers: ['hematocrit'],
    markerDirection: ['high'],
    compounds: [
      { match: /tren/i, line: 'Trenbolone is well known for insomnia and night sweats.' },
      { match: /clen/i, line: 'Clenbuterol is a stimulant and commonly disrupts sleep.' },
      { match: /\bt3\b|cytomel|liothyronine/i, line: 'T3 speeds up metabolism and can cause restless sleep and night sweats, often dose related.' },
    ],
    guide: 'hematocrit-on-trt-what-to-do',
  },
  'libido:low': {
    line: 'Low libido is often linked to estradiol out of range, low testosterone, or prolactin on nandrolone or tren.',
    markers: ['estradiol', 'prolactin', 'total_testosterone'],
    markerDirection: ['either', 'high', 'low'],
    compounds: [
      { match: AI, line: 'An AI can crash estradiol, and low libido is one of the classic signs.' },
      { match: NORS, line: 'Nandrolone and trenbolone can raise prolactin, which often blunts libido and erections.' },
      { match: /finasteride|dutasteride|propecia|avodart/i, line: 'Finasteride and dutasteride lower DHT, which can blunt libido in some people.' },
    ],
    guide: 'estradiol',
  },
  'waterRetention:high': {
    line: 'Water retention is often linked to high estradiol, and can also come from GH, MK-677 or a salty week.',
    markers: ['estradiol', 'igf1'],
    markerDirection: ['high', 'high'],
    useBp: true,
    compounds: [
      { match: GH, line: 'GH and GH boosters like MK-677 often cause water retention, mostly early on or at higher doses.' },
      { match: /nandrolone|durabolin|\bdeca\b|\bnpp\b/i, line: 'Nandrolone is commonly linked to water retention and a bloated look.' },
      { match: ORALS_BP, line: 'Dianabol and Anadrol are known for heavy water retention.' },
      { match: HCG, line: 'HCG can raise estradiol on top of testosterone, which can add to water retention.' },
    ],
    guide: 'estradiol-on-trt-without-an-ai',
  },
  'acne:high': {
    line: 'Acne often tracks androgen levels, and tends to be worse at higher doses or after big peaks.',
    markers: ['total_testosterone', 'dht'],
    markerDirection: ['high', 'high'],
    compounds: [
      { match: /tren/i, line: 'Trenbolone is well known for acne, often on the back and shoulders.' },
      { match: /masteron|drostanolone|anadrol|oxymetholone/i, line: 'Masteron and Anadrol are strongly androgenic and can bring on acne.' },
      { match: /boldenone|equipoise|\beq\b/i, line: 'Boldenone (EQ) is commonly reported to bring on acne, like other strong androgens.' },
    ],
    guide: 'total-testosterone',
  },
  'nippleSensitivity:high': {
    line: "Sore or puffy nipples are often linked to high estradiol. A lump that stays is worth a doctor's look.",
    markers: ['estradiol', 'prolactin'],
    markerDirection: ['high', 'high'],
    compounds: [
      { match: NORS, line: 'Nandrolone and trenbolone can make nipples more sensitive to estradiol, and can raise prolactin.' },
      { match: HCG, line: 'HCG can raise estradiol on top of testosterone, a common source of sore nipples.' },
      { match: /dianabol|methandrostenolone|methandienone|\bdbol\b/i, line: 'Dianabol converts to a strong estrogen and is a common trigger for sore nipples.' },
    ],
    guide: 'estradiol-on-trt-without-an-ai',
  },
  'jointPain:high': {
    line: 'Achy joints are often linked to estradiol running low (common on an AI), GH or MK-677, or heavy training.',
    markers: ['estradiol', 'igf1'],
    markerDirection: ['low', 'high'],
    compounds: [
      { match: AI, line: 'An AI can push estradiol too low, and achy joints are a common sign.' },
      { match: GH, line: 'GH and GH boosters like MK-677 can cause joint or wrist ache and tingling hands, often dose related.' },
      { match: /winstrol|stanozolol|\bwinny\b/i, line: 'Winstrol is widely reported to leave joints dry and achy.' },
    ],
    guide: 'estradiol-on-trt-without-an-ai',
  },
  'headache:high': {
    line: 'Headaches on a protocol are worth checking against blood pressure and hematocrit, which can both run high.',
    markers: ['hematocrit', 'hemoglobin'],
    markerDirection: ['high', 'high'],
    useBp: true,
    compounds: [
      { match: /tren/i, line: 'Trenbolone can push blood pressure up, and headaches are commonly reported on it.' },
      { match: ORALS_BP, line: 'Anadrol and Dianabol can push blood pressure up, and headaches are commonly reported on them.' },
      { match: GLP1, line: 'GLP-1 drugs like retatrutide can cause headaches, often when food and fluid intake drops.' },
      { match: /clen/i, line: 'Clenbuterol is a stimulant and commonly causes headaches and a racing heart.' },
    ],
    guide: 'hematocrit-on-trt-what-to-do',
  },
}
