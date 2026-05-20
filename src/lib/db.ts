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

export type SyncFields = {
  // UUID assigned by the client on first save. Used as the row id on the server.
  serverId?: string
  // ms epoch — bumped on every local mutation.
  updatedAt?: number
  // ms epoch — soft-delete tombstone.
  deletedAtSync?: number
  // 1 = local changes not yet pushed to server.
  dirty?: 0 | 1
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
  protocolDoseId?: number
  vialId?: number
} & SyncFields

export type VitalLog = {
  id?: number
  measuredAt: string
  systolic: number
  diastolic: number
  pulse?: number
  weightKg?: number
  waistCm?: number
  bodyFatPct?: number
  notes?: string
}

export type LabExam = {
  id?: number
  name: string
  collectedAt: string
  examType?: string
  location?: string
  company?: string
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

// --- v3: Protocols, vials, symptoms, targets, goals ---

export type ProtocolCadence =
  | { kind: 'everyNDays'; n: number; timeOfDay?: string }
  | { kind: 'weekly'; daysOfWeek: number[]; timeOfDay?: string }
  | { kind: 'daily'; timesOfDay: string[] }
  | { kind: 'asNeeded' }

export type Protocol = {
  id?: number
  name: string
  compoundId: number
  dose: number
  unit: Unit
  cadence: ProtocolCadence
  startedAt: string
  endsAt?: string
  notes?: string
  phase?: 'Blast' | 'Cruise' | 'PCT' | 'Bridge' | 'Trial' | 'Maintenance'
  archived?: boolean
}

export type ProtocolDose = {
  id?: number
  protocolId: number
  scheduledAt: string
  status: 'pending' | 'done' | 'skipped' | 'missed'
  injectionId?: number
}

export type Vial = {
  id?: number
  compoundId: number
  label: string
  totalMl: number
  concentrationMgPerMl?: number
  remainingMl: number
  openedAt?: string
  expiresAt?: string
  costCents?: number
  archived?: boolean
}

export type Symptom = {
  id?: number
  recordedAt: string
  libido?: number
  sleep?: number
  mood?: number
  energy?: number
  waterRetention?: number
  acne?: number
  nippleSensitivity?: number
  jointPain?: number
  headache?: number
  notes?: string
}

export type MarkerTarget = {
  id?: number
  marker: string
  low?: number
  high?: number
  unit?: string
  rationale?: string
}

export type Goal = {
  id?: number
  kind: 'weight' | 'marker' | 'bp'
  label: string
  target: number
  marker?: string
  startedAt: string
  achievedAt?: string
}

// Timestamped body measurements imported from Apple Health, wearables, or manual entry.
// Each row may carry a subset of metrics; nulls are normal.
export type BodyMetric = {
  id?: number
  measuredAt: string
  source: 'apple_health' | 'manual' | 'capacitor_healthkit' | 'health_connect'
  weightKg?: number
  bodyFatPct?: number
  waistCm?: number
  restingHr?: number
  hrvMs?: number
  sleepHours?: number
  externalKey?: string // dedupe key from source (e.g., HK UUID)
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
  protocols!: Table<Protocol, number>
  protocolDoses!: Table<ProtocolDose, number>
  vials!: Table<Vial, number>
  symptoms!: Table<Symptom, number>
  markerTargets!: Table<MarkerTarget, number>
  goals!: Table<Goal, number>
  bodyMetrics!: Table<BodyMetric, number>

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
    this.version(3).stores({
      compounds: '++id, name, category, archived',
      injections: '++id, compoundId, takenAt, vialId',
      vitals: '++id, measuredAt',
      exams: '++id, collectedAt, sourceFileId',
      results: '++id, examId, marker',
      files: '++id, addedAt, status',
      meta: '&key',
      protocols: '++id, compoundId, archived, startedAt',
      protocolDoses: '++id, protocolId, scheduledAt, status',
      vials: '++id, compoundId, archived',
      symptoms: '++id, recordedAt',
      markerTargets: '++id, &marker',
      goals: '++id, kind, achievedAt',
    })
    this.version(4).stores({
      compounds: '++id, name, category, archived',
      injections: '++id, compoundId, takenAt, vialId',
      vitals: '++id, measuredAt',
      exams: '++id, collectedAt, sourceFileId',
      results: '++id, examId, marker',
      files: '++id, addedAt, status',
      meta: '&key',
      protocols: '++id, compoundId, archived, startedAt',
      protocolDoses: '++id, protocolId, scheduledAt, status',
      vials: '++id, compoundId, archived',
      symptoms: '++id, recordedAt',
      markerTargets: '++id, &marker',
      goals: '++id, kind, achievedAt',
      bodyMetrics: '++id, measuredAt, source, &externalKey',
    })
    // v5: per-row sync metadata indexes (serverId, dirty, updatedAt) so the
    // background sync engine can find unsynced rows and upsert by server id.
    this.version(5).stores({
      compounds: '++id, name, category, archived, &serverId, dirty, updatedAt',
      injections: '++id, compoundId, takenAt, vialId, &serverId, dirty, updatedAt',
      vitals: '++id, measuredAt, &serverId, dirty, updatedAt',
      exams: '++id, collectedAt, sourceFileId, &serverId, dirty, updatedAt',
      results: '++id, examId, marker, &serverId, dirty, updatedAt',
      files: '++id, addedAt, status, &serverId, dirty, updatedAt',
      meta: '&key',
      protocols: '++id, compoundId, archived, startedAt, &serverId, dirty, updatedAt',
      protocolDoses: '++id, protocolId, scheduledAt, status, &serverId, dirty, updatedAt',
      vials: '++id, compoundId, archived, &serverId, dirty, updatedAt',
      symptoms: '++id, recordedAt, &serverId, dirty, updatedAt',
      markerTargets: '++id, &marker, &serverId, dirty, updatedAt',
      goals: '++id, kind, achievedAt, &serverId, dirty, updatedAt',
      bodyMetrics: '++id, measuredAt, source, &externalKey, &serverId, dirty, updatedAt',
    })
  }
}

export const db = new ApolloDatabase()

// --- Auto-stamping hooks --------------------------------------------------
// Every syncable table gets `creating` and `updating` hooks so the sync engine
// can find new/changed rows without each save site remembering to set them.
//   creating: stamp serverId (UUID), updatedAt = now, dirty = 1
//   updating: bump updatedAt + dirty = 1 ONLY IF the change touches a non-sync
//             column. This lets the sync engine clear `dirty: 0` after a push
//             without immediately re-marking the row dirty.
const SYNC_TABLES = [
  'compounds',
  'injections',
  'vitals',
  'exams',
  'results',
  'files',
  'protocols',
  'protocolDoses',
  'vials',
  'symptoms',
  'markerTargets',
  'goals',
  'bodyMetrics',
] as const

const SYNC_ONLY_FIELDS = new Set(['serverId', 'updatedAt', 'deletedAtSync', 'dirty'])

type AnyRow = Record<string, unknown>

for (const name of SYNC_TABLES) {
  const table = (db as unknown as Record<string, { hook: (event: string, fn: (...args: unknown[]) => unknown) => void }>)[name]
  if (!table) continue
  table.hook('creating', (...args: unknown[]) => {
    // signature: (primKey, obj, trans) — we mutate obj in place.
    const obj = args[1] as AnyRow
    if (obj.serverId == null) obj.serverId = crypto.randomUUID()
    if (obj.updatedAt == null) obj.updatedAt = Date.now()
    if (obj.dirty == null) obj.dirty = 1
    return undefined
  })
  table.hook('updating', (...args: unknown[]) => {
    // signature: (mods, primKey, obj, trans). Return a new mods to override.
    const mods = (args[0] as AnyRow) || {}
    const keys = Object.keys(mods)
    if (keys.length === 0) return undefined
    const onlySync = keys.every((k) => SYNC_ONLY_FIELDS.has(k))
    if (onlySync) return undefined
    return { ...mods, updatedAt: Date.now(), dirty: 1 }
  })
}

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

  await db.transaction(
    'rw',
    [db.compounds, db.injections, db.vitals, db.exams, db.results, db.files, db.meta],
    async () => {
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

      const fileIdByName = new Map(
        (await db.files.toArray()).map((file) => [file.name, file.id]),
      )
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
    },
  )

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
