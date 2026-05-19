import Dexie, { type Table } from 'dexie'

export type Unit = 'mg' | 'mcg' | 'iu' | 'ml' | 'tablet' | 'capsule'
export type TestosteroneEster = 'Enanthate' | 'Cypionate' | 'Propionate' | 'Undecanoate' | 'Custom'

export type Compound = {
  id?: number
  name: string
  category: 'TRT' | 'Peptide' | 'Ancillary' | 'Supplement' | 'Other'
  defaultDose: number
  unit: Unit
  concentration?: string
  schedule: string
  color: string
  ester?: TestosteroneEster
  halfLifeDays?: number
  peakHours?: number
  archived?: boolean
}

export type InjectionLog = {
  id?: number
  compoundId: number
  takenAt: string
  dose?: number
  unit: Unit
  route: 'SubQ' | 'IM' | 'Oral' | 'Other'
  site?: string
  notes?: string
  rawDose?: string
  vialAmount?: string
  weightKg?: number
}

export type VitalLog = {
  id?: number
  measuredAt: string
  systolic: number
  diastolic: number
  pulse?: number
  weightKg?: number
  notes?: string
}

export type LabExam = {
  id?: number
  name: string
  collectedAt: string
  labName?: string
  sourceFileId?: number
  notes?: string
}

export type LabResult = {
  id?: number
  examId: number
  marker: string
  value?: number
  rawValue: string
  unit?: string
  low?: number
  high?: number
  status?: string
  notes?: string
  source?: string
}

export type HealthFile = {
  id?: number
  name: string
  type: string
  size: number
  addedAt: string
  status: 'Stored' | 'Needs review' | 'Reviewed'
  extractedText?: string
  blob?: Blob
}

export type MetaRecord = {
  key: string
  value: string
}

type SeedData = {
  seedVersion: string
  compounds: Array<Omit<Compound, 'id'>>
  injections: Array<Omit<InjectionLog, 'id' | 'compoundId'> & { compoundName: string }>
  vitals: Array<Omit<VitalLog, 'id'>>
  exams: Array<Omit<LabExam, 'id' | 'sourceFileId'> & { key: string; sourceFileName?: string }>
  results: Array<Omit<LabResult, 'id' | 'examId'> & { examKey: string }>
  files: Array<Omit<HealthFile, 'id' | 'blob'>>
}

export type SeedImportResult = {
  status: 'imported' | 'skipped' | 'missing'
  counts: {
    compounds: number
    injections: number
    vitals: number
    exams: number
    results: number
    files: number
  }
  seedVersion?: string
}

export class ApolloDatabase extends Dexie {
  compounds!: Table<Compound, number>
  injections!: Table<InjectionLog, number>
  vitals!: Table<VitalLog, number>
  exams!: Table<LabExam, number>
  results!: Table<LabResult, number>
  files!: Table<HealthFile, number>
  meta!: Table<MetaRecord, string>

  constructor() {
    super('apollo-health-local')
    this.version(1).stores({
      compounds: '++id, name, category, archived',
      injections: '++id, compoundId, takenAt',
      vitals: '++id, measuredAt',
      exams: '++id, collectedAt, sourceFileId',
      results: '++id, examId, marker',
      files: '++id, addedAt, status',
    })
    this.version(2).stores({
      compounds: '++id, name, category, archived',
      injections: '++id, compoundId, takenAt',
      vitals: '++id, measuredAt',
      exams: '++id, collectedAt, sourceFileId',
      results: '++id, examId, marker',
      files: '++id, addedAt, status',
      meta: '&key',
    })
  }
}

export const db = new ApolloDatabase()

let seedPromise: Promise<void> | undefined

export async function seedIfEmpty() {
  if (seedPromise) return seedPromise
  seedPromise = importBundledSeed(false).then(() => undefined).finally(() => {
    seedPromise = undefined
  })
  return seedPromise
}

export async function importBundledSeed(force = false): Promise<SeedImportResult> {
  const seed = await fetchLocalSeed()
  if (!seed) return { status: 'missing', counts: await recordCounts() }

  const currentSeed = await db.meta.get('seedVersion')
  if (!force && currentSeed?.value === seed.seedVersion) {
    return { status: 'skipped', counts: await recordCounts(), seedVersion: seed.seedVersion }
  }

  await db.transaction('rw', [db.compounds, db.injections, db.vitals, db.exams, db.results, db.files, db.meta], async () => {
    await Promise.all([
      db.compounds.clear(),
      db.injections.clear(),
      db.vitals.clear(),
      db.exams.clear(),
      db.results.clear(),
      db.files.clear(),
    ])

    await db.files.bulkAdd(seed.files)

    const compoundIdByName = new Map<string, number>()
    for (const compound of seed.compounds) {
      const id = await db.compounds.add(compound)
      compoundIdByName.set(compound.name, id)
    }

    const injections = seed.injections
      .map(({ compoundName, ...entry }) => {
        const compoundId = compoundIdByName.get(compoundName)
        return compoundId ? { ...entry, compoundId } : undefined
      })
      .filter((entry): entry is InjectionLog => Boolean(entry))
    if (injections.length > 0) await db.injections.bulkAdd(injections)

    if (seed.vitals.length > 0) await db.vitals.bulkAdd(seed.vitals)

    const fileIdByName = new Map((await db.files.toArray()).map((file) => [file.name, file.id]))
    const examIdByKey = new Map<string, number>()
    for (const { key, sourceFileName, ...exam } of seed.exams) {
      const sourceFileId = sourceFileName ? fileIdByName.get(sourceFileName) : undefined
      const id = await db.exams.add({ ...exam, sourceFileId })
      examIdByKey.set(key, id)
    }

    const results = seed.results
      .map(({ examKey, ...result }) => {
        const examId = examIdByKey.get(examKey)
        return examId ? { ...result, examId } : undefined
      })
      .filter((result): result is LabResult => Boolean(result))
    if (results.length > 0) await db.results.bulkAdd(results)

    await db.meta.put({ key: 'seedVersion', value: seed.seedVersion })
  })

  return {
    status: 'imported',
    counts: {
      compounds: seed.compounds.length,
      injections: seed.injections.length,
      vitals: seed.vitals.length,
      exams: seed.exams.length,
      results: seed.results.length,
      files: seed.files.length,
    },
    seedVersion: seed.seedVersion,
  }
}

async function fetchLocalSeed() {
  try {
    const response = await fetch('/local-seed/apollo-seed.json', { cache: 'no-store' })
    if (!response.ok) return undefined
    return (await response.json()) as SeedData
  } catch {
    return undefined
  }
}

export async function recordCounts() {
  const [compounds, injections, vitals, exams, results, files] = await Promise.all([
    db.compounds.count(),
    db.injections.count(),
    db.vitals.count(),
    db.exams.count(),
    db.results.count(),
    db.files.count(),
  ])

  return { compounds, injections, vitals, exams, results, files }
}
