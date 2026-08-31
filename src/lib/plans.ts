// Display config for Apollo Pro. The PRICES here are for DISPLAY ONLY — the
// actual charge comes from the Stripe Price you create for each plan. Keep the
// numbers in sync with Stripe (this is the one file to edit).

export type PlanKind = 'monthly' | 'yearly' | 'lifetime'

export const PRO_PLANS: Array<{
  kind: PlanKind
  label: string
  price: string
  cadence: string
  note?: string
  highlight?: boolean
}> = [
  { kind: 'monthly', label: 'Monthly', price: '$4.99', cadence: 'per month' },
  { kind: 'yearly', label: 'Yearly', price: '$39', cadence: 'per year', note: 'Save ~35%', highlight: true },
  { kind: 'lifetime', label: 'Lifetime', price: '$99', cadence: 'one time', note: 'Pay once' },
]

export const PRO_FEATURES = [
  'Import lab results straight from a PDF',
  'Smart lab analysis: heart, hormones, blood, liver',
  'Doctor-ready export and print report',
  'Injection reminders',
]
