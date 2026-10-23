// Asks for an App Store rating with Apple's own dialog, at a calm moment: right after the 10th and the 40th entry
// someone saves, once per app version. Apple shows it at most three times a year and may skip it; we never ask
// again in the same version, and never nag or gate anything on it.
import Constants from 'expo-constants'
import * as StoreReview from 'expo-store-review'

const KEY = 'magno.review'
const AT = [10, 40]

export function afterSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { saves?: number; asked?: string }
    const saves = (s.saves ?? 0) + 1
    const version = Constants.expoConfig?.version ?? ''
    const ask = AT.includes(saves) && s.asked !== version
    localStorage.setItem(KEY, JSON.stringify({ saves, asked: ask ? version : s.asked }))
    // after the sheet has closed, so the dialog lands on Home, not on a closing form
    if (ask) setTimeout(() => void StoreReview.hasAction().then((ok) => (ok ? StoreReview.requestReview() : undefined)).catch(() => {}), 900)
  } catch {}
}
