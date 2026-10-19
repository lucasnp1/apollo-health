// Light, dark, or as the phone is set: kept on this phone (localStorage), applied at launch and when changed in You.
// Appearance.setColorScheme overrides the window's style, so the dynamic colours in theme.ts and every native control
// follow it at once.
import { useSyncExternalStore } from 'react'
import { Appearance } from 'react-native'

export type Choice = 'system' | 'light' | 'dark'
const KEY = 'magno.appearance'
export const CHOICE_LABEL: Record<Choice, string> = { system: 'Same as phone', light: 'Light', dark: 'Dark' }

let choice: Choice = (() => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
})()
const subs = new Set<() => void>()
const apply = () => Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice)

export const startAppearance = apply
export function setAppearance(next: Choice) {
  choice = next
  try { localStorage.setItem(KEY, next) } catch {}
  apply()
  subs.forEach((f) => f())
}
export const useAppearance = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => choice)
