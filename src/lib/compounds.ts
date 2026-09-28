// One compound identity, shared by every screen that lists compounds.
//
// The same drug can own several rows: sync reconciles on serverId alone, so a
// compound created on two devices becomes two rows on both, and logging a shot
// under a name the picker was hiding creates another. Grouping by name is what
// makes five "Retatrutide" rows read as one compound everywhere.
//
// `ids` carries EVERY row in the group, not a winner, so filtering by a group
// never hides the shots logged against its other rows.

import type { Compound, InjectionLog } from './db'

export const compoundKey = (name: string) => name.trim().toLowerCase()

export type CompoundGroup = {
  key: string
  name: string
  color?: string
  /** The row to read remembered dose / vial numbers from, and write them back to. */
  canonical: Compound
  /** Every row id sharing this name. Filter with `ids.includes(i.compoundId)`. */
  ids: number[]
}

/**
 * One entry per distinct compound name, in first-seen order.
 * Canonical row = the one with the most injections (ties broken by the newest
 * row), because that is the row whose remembered numbers the user has actually
 * been using — not whichever happens to have the lowest id, which is what the
 * old per-screen dedups picked.
 */
export function compoundGroups(compounds: Compound[], injections: InjectionLog[] = []): CompoundGroup[] {
  const shots = new Map<number, number>()
  for (const i of injections) {
    if (i.compoundId === undefined) continue
    shots.set(i.compoundId, (shots.get(i.compoundId) ?? 0) + 1)
  }

  const byKey = new Map<string, Compound[]>()
  for (const c of compounds) {
    const k = compoundKey(c.name)
    const list = byKey.get(k)
    if (list) list.push(c)
    else byKey.set(k, [c])
  }

  const out: CompoundGroup[] = []
  for (const [key, rows] of byKey) {
    const canonical = rows.reduce((best, c) => {
      const a = shots.get(c.id ?? -1) ?? 0
      const b = shots.get(best.id ?? -1) ?? 0
      if (a !== b) return a > b ? c : best
      return (c.id ?? 0) > (best.id ?? 0) ? c : best
    }, rows[0])
    out.push({
      key,
      name: canonical.name,
      color: canonical.color ?? rows.find((r) => r.color)?.color,
      canonical,
      ids: rows.map((r) => r.id).filter((id): id is number => id !== undefined),
    })
  }
  return out
}

/** compoundId -> its group, so any per-id lookup resolves to one identity. */
export function groupByCompoundId(groups: CompoundGroup[]): Map<number, CompoundGroup> {
  const map = new Map<number, CompoundGroup>()
  for (const g of groups) for (const id of g.ids) map.set(id, g)
  return map
}

/** The existing row for this name, if any. Used to stop new duplicates at the source. */
export function findCompoundByName(compounds: Compound[], name: string): Compound | undefined {
  const k = compoundKey(name)
  return compounds.find((c) => compoundKey(c.name) === k)
}

// ── Colours ─────────────────────────────────────────────────────────────────
// Every compound needs a colour of its own on the charts and dots. New ones
// used to take COLORS[count % 7], so they landed on colours already in use:
// Primobolan and Trenbolone got the same green, next to a teal Test E.
// People name colours by hue ("all green"), so a clash is judged on the hue
// difference in OKLCH, weighted by saturation (dH = 2*sqrt(C1*C2)*sin(dh/2)):
// 30 degrees apart is obvious between vivid blue and violet but invisible
// between muted teal and green. Lightness is ignored: dark and bright green
// are still both "green".

const MIN_DH = 0.08 // under this, two series read as the same colour
const GREY_CHROMA = 0.06 // below this a colour is a grey and only clashes with greys

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Every 5 degrees round the wheel, at one saturation and lightness that read
// on both themes.
const CANDIDATES = Array.from({ length: 72 }, (_, i) => hslHex(i * 5, 0.7, 0.55))

/** [lightness, chroma, hue in degrees] in OKLCH, or undefined for anything but #rrggbb. */
function lch(hex?: string): [number, number, number] | undefined {
  const m = hex?.match(/^#([0-9a-f]{6})$/i)
  if (!m) return undefined
  const lin = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [lin(0), lin(2), lin(4)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}

// Saturation-weighted hue difference between two coloured (non-grey) colours.
const deltaH = (x: [number, number, number], y: [number, number, number]) =>
  2 * Math.sqrt(x[1] * y[1]) * Math.abs(Math.sin(((y[2] - x[2]) * Math.PI) / 360))

/** Two colours a reader would call the same on a chart. */
export function colorsClash(a: string, b: string): boolean {
  const x = lch(a), y = lch(b)
  if (!x || !y) return false
  const greyX = x[1] < GREY_CHROMA, greyY = y[1] < GREY_CHROMA
  if (greyX || greyY) return greyX && greyY && Math.abs(x[0] - y[0]) < 0.15
  return deltaH(x, y) < MIN_DH
}

// How far, in dH, a candidate is from the nearest coloured colour in use.
function hueRoom(c: string, used: string[]): number {
  const h = lch(c)!
  let room = Infinity
  for (const u of used) {
    const x = lch(u)
    if (x && x[1] >= GREY_CHROMA) room = Math.min(room, deltaH(h, x))
  }
  return room
}

/** The colour in the widest free gap of the wheel. Deterministic, so two devices agree. */
export function distinctColor(used: string[]): string {
  return CANDIDATES.reduce((best, c) => (hueRoom(c, used) > hueRoom(best, used) ? c : best))
}

/** A random colour that clashes with nothing in use, for a new compound. */
export function randomDistinctColor(used: string[]): string {
  const free = CANDIDATES.filter((c) => !used.some((u) => colorsClash(c, u)))
  return free.length ? free[Math.floor(Math.random() * free.length)] : distinctColor(used)
}

/**
 * Rows to recolour so no two compounds share a colour. The most-used compound
 * keeps its colour (it is the one you know); ties by name, so every device
 * computes the same fixes and sync never flips them back and forth.
 */
export function colorFixes(compounds: Compound[], injections: InjectionLog[] = []): Array<{ ids: number[]; color: string }> {
  const shots = new Map<number, number>()
  for (const i of injections) shots.set(i.compoundId, (shots.get(i.compoundId) ?? 0) + 1)
  const groups = compoundGroups(compounds, injections)
    .map((g) => ({ g, n: g.ids.reduce((s, id) => s + (shots.get(id) ?? 0), 0) }))
    .sort((a, b) => b.n - a.n || a.g.key.localeCompare(b.g.key))
  // First keep every colour that is already fine, then recolour the rest, so
  // a fix never lands next to (and displaces) a compound nobody complained about.
  const used: string[] = []
  const redo: CompoundGroup[] = []
  for (const { g } of groups) {
    if (lch(g.color) && !used.some((u) => colorsClash(g.color!, u))) used.push(g.color!)
    else redo.push(g)
  }
  const fixes: Array<{ ids: number[]; color: string }> = []
  for (const g of redo) {
    const color = distinctColor(used)
    used.push(color)
    // Writing the same value would still bump updatedAt and re-fire the caller.
    if (color !== g.color) fixes.push({ ids: g.ids, color })
  }
  return fixes
}
