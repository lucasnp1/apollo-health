// "What needs a look": the web's HomeInsightsCard rules (src/lib/homeInsights.ts, labFindings, wellbeingSummary), run
// on the phone. Bloods from the newest test, blood pressure read against weight, hematocrit, estradiol and dose
// changes, blood-letting nudges and check-ins, ranked serious first. Informational, never a prescription: the copy is
// the web's, minus anything that says what to do next ("what people usually do", "retest around..."), which the
// iPhone app leaves out for App Review (Lucas, 19 Oct 2026).
import { useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import type { BodyMetric, Compound, InjectionLog, Symptom, VitalLog } from '@shared/lib/db'
import { dayOf, fmtDay } from '@shared/lib/dates'
import { bleedInsight, bpInsight, doseChange, labInsight, rankInsights, staleInsight, symptomInsight, type HomeInsight } from '@shared/lib/homeInsights'
import { buildFindings } from '@shared/lib/labFindings'
import type { LabTest } from '@shared/lib/labTests'
import { toUnit } from '@shared/lib/labUnits'
import { bleedNudge, hctSeries } from '@shared/lib/phlebotomy'
import { ALL_SYMPTOMS, customDefs } from '@shared/lib/symptoms'
import { CAUSES } from '@shared/lib/wellbeingCauses'
import { wellbeingSummary } from '@shared/lib/wellbeingSummary'
import { useBleeds } from '@/labs/useBleeds'

export type { HomeInsight }

// The open insight, handed to its detail sheet (app/insight.tsx)
let open: HomeInsight | undefined
export const openInsight = (i: HomeInsight) => void (open = i)
export const currentInsight = () => open

export function useInsights(d: { tests?: LabTest[]; vitals: VitalLog[]; injections: InjectionLog[]; compounds: Compound[]; bodyMetrics: BodyMetric[]; symptoms: Symptom[]; pro: boolean }) {
  const bleeds = useBleeds()
  // moves on when the app comes back to the front, so a Home left open overnight isn't stale
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(Date.now()))
    return () => sub.remove()
  }, [])

  return useMemo(() => {
    const { tests, vitals, injections, compounds, bodyMetrics, symptoms, pro } = d
    if (!tests || !bleeds) return undefined
    const today = dayOf(new Date(now).toISOString())
    const latest = tests[0]
    const out: Array<HomeInsight | undefined> = []
    let bloodRow = false
    if (latest) {
      const stale = staleInsight(latest, today)
      if (stale) out.push(stale)
      else if (pro) {
        const findings = buildFindings(
          latest.markers.map((m) => ({ id: m.resultId, examId: latest.id, marker: m.printedName, value: m.value, rawValue: m.rawValue, unit: m.unit, low: m.low, high: m.high })),
          [latest.exam],
          latest.id,
        )
        for (const f of findings) {
          if (f.id === 'hpta' || (f.status !== 'bad' && f.status !== 'warn')) continue
          out.push(labInsight(f, latest, bleeds, today))
          if (f.id === 'blood') bloodRow = true
        }
      } else {
        const flagged = latest.markers.filter((m) => m.labFlag === 'high' || m.labFlag === 'low')
        if (flagged.length)
          out.push({
            id: 'lab-free', kind: 'bloods', tone: 'warn', area: 'Bloods', chip: 'Pro', testId: latest.id, signals: [],
            title: `${flagged.length} result${flagged.length === 1 ? '' : 's'} outside the lab range`,
            sub: `${flagged.slice(0, 2).map((m) => `${m.label} ${m.rawValue || m.value}${m.unit ? ` ${m.unit}` : ''}`).join(', ')} · ${fmtDay(latest.date)} test`,
          })
      }
    }
    const series = hctSeries(tests)
    if (!bloodRow) out.push(bleedInsight(bleedNudge(series, bleeds, today)))
    const weights = [
      ...bodyMetrics.filter((b) => b.weightKg !== undefined).map((b) => ({ at: b.measuredAt, kg: b.weightKg! })),
      ...injections.filter((i) => i.weightKg !== undefined).map((i) => ({ at: i.takenAt, kg: i.weightKg! })),
    ]
    const hct = series[series.length - 1]
    const e2m = latest?.markers.find((m) => m.key === 'estradiol' && m.value !== undefined)
    const pgml = e2m ? toUnit('estradiol', e2m.value!, e2m.unit, 'pg/mL') : undefined
    out.push(
      bpInsight(
        {
          vitals, weights,
          hct: hct ? { pct: hct.pct, date: hct.date } : undefined,
          e2: pgml !== undefined && latest ? { pgml, date: latest.date } : undefined,
          dose: doseChange(compounds, injections, now),
        },
        now,
      ),
    )
    const defs = [...ALL_SYMPTOMS, ...customDefs(symptoms)]
    out.push(symptomInsight(wellbeingSummary(symptoms, defs, CAUSES, { labs: {}, recentCompounds: [] }, now)))
    // No next steps on iOS: a blood-letting nudge says what was logged, not when to retest
    const plain = out.map((i) =>
      i?.kind === 'bleed' && /^Retest/.test(i.sub ?? '') ? { ...i, sub: 'Your next hematocrit result will show what it did', chip: 'Logged' } : i,
    )
    return rankInsights(plain.filter((i): i is HomeInsight => !!i))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.tests, bleeds, d.pro, d.vitals, d.bodyMetrics, d.injections, d.compounds, d.symptoms, now])
}
