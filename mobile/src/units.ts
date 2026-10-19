// How weights and syringe volumes are shown: kg or lb, mL or cc. Kept on this phone (localStorage) like the appearance.
// Only the display changes: weights are always saved in kg and volumes in mL, so sync, the web and Health never see a
// pound. Pills, tablets and mg doses are never converted.
import { useSyncExternalStore } from 'react'

export type Units = { weight: 'kg' | 'lb'; volume: 'mL' | 'cc' }
const KEY = 'magno.units'
const LB_PER_KG = 2.20462

// First run follows the phone's region: pounds in the US (and Liberia and Myanmar), kilograms everywhere else
const regionDefault = (): Units => {
  let locale = ''
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale
  } catch {}
  return { weight: /-(US|LR|MM)\b/.test(locale) ? 'lb' : 'kg', volume: 'mL' }
}

let units: Units = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved?.weight && saved?.volume) return saved
  } catch {}
  return regionDefault()
})()
const subs = new Set<() => void>()

export const getUnits = () => units
export const useUnits = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => units)
export function setUnits(patch: Partial<Units>) {
  units = { ...units, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(units))
  } catch {}
  subs.forEach((f) => f())
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** A weight saved in kg, in the unit shown (one decimal). */
export const showWeight = (kg: number, u = units) => (u.weight === 'lb' ? round1(kg * LB_PER_KG) : kg)
/** A weight typed in the unit shown, back to kg for saving (two decimals, so 180.0 lb comes back as 180.0). */
export const toKg = (v: number, u = units) => (u.weight === 'lb' ? Math.round((v / LB_PER_KG) * 100) / 100 : v)
/** "82.7 kg" or "182.3 lb". */
export const weightText = (kg: number, u = units) => `${showWeight(kg, u)} ${u.weight}`
/** Saved text ("0.25 mL", "Syringe: 1 mL") as shown: mL reads cc when chosen. */
export const vol = (text: string, u = units) => (u.volume === 'cc' ? text.replace(/\bmL\b/g, 'cc') : text)
