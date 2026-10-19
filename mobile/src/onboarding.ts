// Whether the first-run walk-through (app/welcome.tsx) has been done. Its own file, so the root layout can ask without
// loading the Welcome screen and its pictures.
const KEY = 'magno.onboarded'

export const needsOnboarding = () => {
  try {
    return !localStorage.getItem(KEY)
  } catch {
    return false
  }
}

export const markOnboarded = () => {
  try {
    localStorage.setItem(KEY, String(Date.now()))
  } catch {}
}
