/**
 * Pharmacokinetics engine — based on steroidplanner.com methodology
 *
 * Formula (first-order release model):
 *   Release(t) = Dose × (ActiveDosePct/100) × e^(−t×λ) × λ
 *   λ = ln(2) / halfLifeDays
 *
 * This gives the release rate in mg/day at time t (days after injection).
 * Summing contributions from all past injections gives the total active level.
 *
 * Data sourced from: Behre HM, Nieschlag E. 1998 Comparative pharmacokinetics
 * of testosterone esters + steroidplanner.com compound table.
 */

export type PKCompound = {
  compound: string        // Display name
  form: string            // Ester or form (empty = oral / no ester)
  halfLifeDays: number
  activeDosePct: number   // % of injected mass that is active drug (vs ester weight)
}

// Full compound database — all 37 entries from steroidplanner.com
export const PK_COMPOUNDS: PKCompound[] = [
  { compound: 'Anadrol',                  form: '',                     halfLifeDays: 0.58, activeDosePct: 100 },
  { compound: 'Anavar',                   form: '',                     halfLifeDays: 0.42, activeDosePct: 100 },
  { compound: 'Arimidex',                 form: '',                     halfLifeDays: 1.95, activeDosePct: 100 },
  { compound: 'Aromasin',                 form: '',                     halfLifeDays: 1,    activeDosePct: 100 },
  { compound: 'Boldenone',                form: 'Cypionate',            halfLifeDays: 5,    activeDosePct: 70  },
  { compound: 'Dianabol',                 form: '',                     halfLifeDays: 0.21, activeDosePct: 100 },
  { compound: 'Dihydroboldenone (DHB)',   form: 'Cypionate',            halfLifeDays: 5,    activeDosePct: 70  },
  { compound: 'DNP',                      form: 'Crystal',              halfLifeDays: 1.5,  activeDosePct: 75  },
  { compound: 'DNP',                      form: 'Powder',               halfLifeDays: 1.5,  activeDosePct: 100 },
  { compound: 'Epistane',                 form: '',                     halfLifeDays: 0.25, activeDosePct: 100 },
  { compound: 'Equipoise',               form: '',                     halfLifeDays: 14,   activeDosePct: 61  },
  { compound: 'Halotestin',              form: '',                     halfLifeDays: 0.29, activeDosePct: 100 },
  { compound: 'Masteron',                form: 'Enanthate',            halfLifeDays: 4.5,  activeDosePct: 70  },
  { compound: 'Masteron',                form: 'Propionate',           halfLifeDays: 0.8,  activeDosePct: 80  },
  { compound: 'Nandrolone',              form: 'Decanoate',            halfLifeDays: 7.5,  activeDosePct: 64  },
  { compound: 'Nandrolone',              form: 'Phenylpropionate',     halfLifeDays: 1.5,  activeDosePct: 67  },
  { compound: 'Primobolan',              form: 'Enanthate',            halfLifeDays: 4.5,  activeDosePct: 70  },
  { compound: 'Primobolan',              form: 'Oral',                 halfLifeDays: 0.21, activeDosePct: 100 },
  { compound: 'Superdrol',               form: '',                     halfLifeDays: 0.42, activeDosePct: 100 },
  { compound: 'Testosterone',            form: 'Cypionate',            halfLifeDays: 5,    activeDosePct: 69  },
  { compound: 'Testosterone',            form: 'Decanoate',            halfLifeDays: 7.5,  activeDosePct: 62  },
  { compound: 'Testosterone',            form: 'Enanthate',            halfLifeDays: 4.5,  activeDosePct: 70  },
  { compound: 'Testosterone',            form: 'Isocaproate',          halfLifeDays: 4,    activeDosePct: 72  },
  { compound: 'Testosterone',            form: 'Phenylpropionate',     halfLifeDays: 1.5,  activeDosePct: 66  },
  { compound: 'Testosterone',            form: 'Propionate',           halfLifeDays: 0.8,  activeDosePct: 80  },
  { compound: 'Testosterone',            form: 'Suspension',           halfLifeDays: 0.5,  activeDosePct: 100 },
  { compound: 'Testosterone',            form: 'Sustanon 250',         halfLifeDays: 0.8,  activeDosePct: 68  },
  { compound: 'Testosterone',            form: 'Undecanoate',          halfLifeDays: 20.9, activeDosePct: 61  },
  { compound: 'Testosterone',            form: 'Undecanoate (Castor Oil)', halfLifeDays: 33.9, activeDosePct: 61 },
  { compound: 'Trenbolone',              form: 'Acetate',              halfLifeDays: 1,    activeDosePct: 87  },
  { compound: 'Trenbolone',              form: 'Enanthate',            halfLifeDays: 4.5,  activeDosePct: 70  },
  { compound: 'Trenbolone',              form: 'Hex (Parabolan)',      halfLifeDays: 8,    activeDosePct: 66  },
  { compound: 'Trestolone (MENT)',       form: 'Acetate',              halfLifeDays: 1,    activeDosePct: 87  },
  { compound: 'Trestolone (MENT)',       form: 'Enanthate',            halfLifeDays: 4.5,  activeDosePct: 72  },
  { compound: 'Turinabol',              form: '',                     halfLifeDays: 0.67, activeDosePct: 100 },
  { compound: 'Winstrol',               form: 'Injectable',           halfLifeDays: 1,    activeDosePct: 87  },
  { compound: 'Winstrol',               form: 'Oral',                 halfLifeDays: 0.33, activeDosePct: 100 },
]

/**
 * Find a PKCompound by name and optional ester/form.
 *
 * Matching tiers (first match wins):
 *   1. Exact compound name + exact form
 *   2. Bidirectional substring on compound name (PK⊆user OR user⊆PK) + exact form
 *   3. Bidirectional substring on compound name, best form match or first result
 *   4. First-token prefix (≥3 chars) — catches "Test E", "Tren A", "Mast P" etc.
 */
export function findPKCompound(name: string, form?: string): PKCompound | undefined {
  const norm = name.trim().toLowerCase()
  const formNorm = form?.trim().toLowerCase()

  /** True if user name and PK compound name share a meaningful substring relationship */
  function nameMatches(pkName: string): boolean {
    const pk = pkName.toLowerCase()
    return pk === norm || pk.includes(norm) || norm.includes(pk)
  }

  // 1. Exact compound name + exact form
  if (formNorm) {
    const hit = PK_COMPOUNDS.find(
      (c) => c.compound.toLowerCase() === norm && c.form.toLowerCase() === formNorm,
    )
    if (hit) return hit
  }

  // 2 & 3. Bidirectional name match — prefer the entry whose form matches
  const nameHits = PK_COMPOUNDS.filter((c) => nameMatches(c.compound))
  if (nameHits.length > 0) {
    if (formNorm) {
      const withForm = nameHits.find((c) => c.form.toLowerCase() === formNorm)
      if (withForm) return withForm
    }
    return nameHits[0]
  }

  // 4. First-token prefix fallback (e.g. "Test" → "Testosterone", "Tren" → "Trenbolone")
  const firstToken = norm.split(/[\s\-_]+/)[0]
  if (firstToken && firstToken.length >= 3) {
    const tokenHits = PK_COMPOUNDS.filter((c) =>
      c.compound.toLowerCase().startsWith(firstToken),
    )
    if (tokenHits.length > 0) {
      if (formNorm) {
        const withForm = tokenHits.find((c) => c.form.toLowerCase() === formNorm)
        if (withForm) return withForm
      }
      return tokenHits[0]
    }
  }

  return undefined
}

/**
 * Release rate (mg/day) at time `tDays` after a single injection.
 * Returns 0 for negative time (before injection).
 */
export function releaseAtTime(dose: number, pkComp: PKCompound, tDays: number): number {
  if (tDays < 0) return 0
  const lambda = Math.LN2 / pkComp.halfLifeDays
  return dose * (pkComp.activeDosePct / 100) * Math.exp(-tDays * lambda) * lambda
}

/**
 * Build a daily release curve for one compound, given a list of injection timestamps.
 * Returns an array of length `totalDays` with mg/day values.
 *
 * @param pkComp    - PKCompound definition
 * @param injections - Array of { takenAt: ISO string, dose: number }
 * @param startMs   - Start of the window (ms epoch)
 * @param totalDays - Number of days to compute (hours precision internally)
 */
export function buildDailyReleaseCurve(
  pkComp: PKCompound,
  injections: Array<{ takenAt: string; dose: number }>,
  startMs: number,
  totalDays: number
): number[] {
  const MS_PER_DAY = 86_400_000
  const curve: number[] = []

  for (let d = 0; d < totalDays; d++) {
    const dayMs = startMs + d * MS_PER_DAY
    let total = 0
    for (const inj of injections) {
      const injMs = Date.parse(inj.takenAt)
      if (isNaN(injMs)) continue
      const tDays = (dayMs - injMs) / MS_PER_DAY
      total += releaseAtTime(inj.dose, pkComp, tDays)
    }
    curve.push(Math.max(0, total))
  }

  return curve
}

/** All unique compound names in the database */
export const PK_COMPOUND_NAMES = [...new Set(PK_COMPOUNDS.map((c) => c.compound))].sort()

/** All forms available for a compound name */
export function formsForCompound(name: string): string[] {
  return PK_COMPOUNDS.filter((c) => c.compound === name).map((c) => c.form)
}
