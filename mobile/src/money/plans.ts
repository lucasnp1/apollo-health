// Magno Pro on the iPhone, written down once. Same prices as the web (src/lib/plans.ts; decided by Lucas, 18 Oct
// 2026). The paywall shows the App Store's own prices, in each person's currency, once it has them; these until then.
/** RevenueCat's name for what a purchase unlocks (project "Magno"). */
export const ENTITLEMENT = 'pro'

export type PlanId = 'monthly' | 'lifetime'
export const PLANS: Record<PlanId, { name: string; product: string; price: string; per: string; note?: string }> = {
  monthly: { name: 'Monthly', product: 'magno_pro_monthly', price: '£4.99', per: 'a month', note: 'First month free' },
  lifetime: { name: 'Lifetime', product: 'magno_pro_lifetime', price: '£99', per: 'once' },
}

/** What Pro adds in this app. Logging, charts, results typed in by hand and export are never behind Pro. */
export const PRO_FEATURES = ['Import blood tests from a PDF, a photo or a spreadsheet, read on your phone', 'Your bloods read in plain words', 'See what changed since your last test, marker by marker']

export const LEGAL = { terms: 'https://magno.fit/terms.html', privacy: 'https://magno.fit/privacy.html' }
