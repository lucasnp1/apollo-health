import { createContext, useContext } from 'react'

export type PlanContextValue = {
  isPro: boolean
  // Open the upgrade dialog; `feature` names what prompted it (for the copy).
  openUpgrade: (feature?: string) => void
}

// Defaults are Pro/no-op so any component rendered outside the provider (tests,
// the sign-in screen) never accidentally shows a paywall.
const PlanContext = createContext<PlanContextValue>({ isPro: true, openUpgrade: () => {} })

export const PlanProvider = PlanContext.Provider
export function usePlan(): PlanContextValue {
  return useContext(PlanContext)
}
