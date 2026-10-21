// The injection logger's draft, kept apart from its screen: the lines in the syringe, what a new shot opens on (the last
// syringe on the route) and the "Syringe: …" / "Vial: …" lines it adds to your note. No dose maths here either.
import { type CompoundGroup, compoundGroups, groupByCompoundId } from '@shared/lib/compounds'
import type { Compound, InjectionLog, SyringeKey, Unit } from '@shared/lib/db'
import type { Route } from '@shared/lib/sites'
import { routeOf } from '@/log'

export const NEW = 'new'
// Names only, to note which syringe you used. Same keys as the web, so its logger picks the same one next time.
export const SYRINGES: { value: SyringeKey; label: string; marks: Mark }[] = [
  { value: 'u30', label: '30 unit insulin', marks: 'units' },
  { value: 'u50', label: '50 unit insulin', marks: 'units' },
  { value: 'u100', label: '100 unit insulin', marks: 'units' },
  { value: 'ml1', label: '1 mL', marks: 'mL' },
  { value: 'ml2', label: '2 mL', marks: 'mL' },
  { value: 'ml3', label: '3 mL', marks: 'mL' },
]
export type Mark = 'units' | 'mL'
// The web's needle list (src/lib/dose.ts NEEDLES), copied as plain names: that file must not ship here
export const NEEDLES: Record<Mark, string[]> = {
  units: ['31G 6 mm', '31G 8 mm', '30G 8 mm', '29G 12.7 mm'],
  mL: ['30G ½ in (13 mm)', '27G ½ in (13 mm)', '25G ⅝ in (16 mm)', '25G 1 in (25 mm)', '23G 1 in (25 mm)', '23G 1¼ in (32 mm)', '22G 1½ in (38 mm)', '21G 1½ in (38 mm)'],
}

/** Lines this logger adds under your note, so the web shows them too: "Syringe: …", "Vial: …". */
const LINE = { Syringe: /^Syringe: (.*)$/m, Vial: /^Vial: (.*)$/m }
export const noteLine = (notes: string | undefined, label: keyof typeof LINE) => notes?.match(LINE[label])?.[1]
export const stripLines = (notes: string | undefined) => (notes ?? '').split('\n').filter((l) => !/^(Syringe|Vial): /.test(l)).join('\n').trim()

/** One compound in the syringe. `pick` is a compound group key, NEW for a typed name, or nothing yet. */
export type Line = { key: string; pick?: string; name: string; unit: Unit; dose: string; vial: string; vialNew?: boolean }
let seq = 0
export const blank = (): Line => ({ key: `l${++seq}`, name: '', unit: 'mg', dose: '', vial: '' })

export type Prefill = { lines: Line[]; syringe?: SyringeKey; marks?: Mark; needle: string }

/** A compound's line as you left it last time on this route: dose and vial. Never a new number. */
export function lineFor(g: CompoundGroup, route: Route, shots: InjectionLog[]): Line {
  const c = g.canonical
  const mine = shots.filter((i) => g.ids.includes(i.compoundId))
  const onRoute = mine.find((i) => routeOf(i) === route && i.dose != null && i.unit === (c.unit ?? 'mg'))
  const d = onRoute?.dose ?? c.lastDose
  return { ...blank(), pick: g.key, dose: d !== undefined && d > 0 ? String(d) : '', vial: noteLine(mine[0]?.notes, 'Vial') ?? '' }
}

/** The last syringe on a route: every compound logged at the most recent moment on it, with its syringe and needle. */
export function prefillFor(route: Route, groups: CompoundGroup[], shots: InjectionLog[]): Prefill {
  const byId = groupByCompoundId(groups)
  const last = shots.find((i) => routeOf(i) === route)
  const stack: CompoundGroup[] = []
  if (last)
    for (const i of shots) {
      if (i.takenAt !== last.takenAt || routeOf(i) !== route) continue
      const g = byId.get(i.compoundId)
      if (g && !stack.includes(g)) stack.push(g)
    }
  if (!stack.length) {
    const g = groups.find((x) => x.canonical.defaultRoute === route)
    if (g) stack.push(g)
  }
  const sy = SYRINGES.find((x) => x.value === stack[0]?.canonical.syringe)
  return {
    lines: stack.length ? stack.map((g) => lineFor(g, route, shots)) : [blank()],
    syringe: sy?.value,
    marks: sy?.marks,
    needle: last?.needle ?? '',
  }
}

/** Most recently used first: one chip per drug (sync can leave duplicate rows). */
export function sortedGroups(compounds: Compound[], shots: InjectionLog[]) {
  const lastAt = new Map<number, string>()
  for (const i of shots) if (!lastAt.has(i.compoundId)) lastAt.set(i.compoundId, i.takenAt)
  const last = (ids: number[]) => ids.map((id) => lastAt.get(id) ?? '').sort().pop() ?? ''
  return compoundGroups(compounds, shots).sort((a, b) => last(b.ids).localeCompare(last(a.ids)))
}
