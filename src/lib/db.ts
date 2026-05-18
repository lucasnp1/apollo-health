import Dexie, { type Table } from 'dexie'

export type Unit = 'mg' | 'mcg' | 'iu' | 'ml' | 'tablet' | 'capsule'

export type Compound = {
  id?: number
  name: string
  category: 'TRT' | 'Peptide' | 'Ancillary' | 'Supplement' | 'Other'
  defaultDose: number
  unit: Unit
  concentration?: string
  schedule: string
  color: string
  archived?: boolean
}

export type InjectionLog = {
  id?: number
  compoundId: number
  takenAt: string
  dose: number
  unit: Unit
  route: 'SubQ' | 'IM' | 'Oral' | 'Other'
  site?: string
  notes?: string
}

export type VitalLog = {
  id?: number
  measuredAt: string
  systolic: number
  diastolic: number
  pulse?: number
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
  value: number
  unit: string
  low?: number
  high?: number
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

export class AtlasDatabase extends Dexie {
  compounds!: Table<Compound, number>
  injections!: Table<InjectionLog, number>
  vitals!: Table<VitalLog, number>
  exams!: Table<LabExam, number>
  results!: Table<LabResult, number>
  files!: Table<HealthFile, number>

  constructor() {
    super('atlas-health-local')
    this.version(1).stores({
      compounds: '++id, name, category, archived',
      injections: '++id, compoundId, takenAt',
      vitals: '++id, measuredAt',
      exams: '++id, collectedAt, sourceFileId',
      results: '++id, examId, marker',
      files: '++id, addedAt, status',
    })
  }
}

export const db = new AtlasDatabase()

let seedPromise: Promise<void> | undefined

export async function seedIfEmpty() {
  if (seedPromise) return seedPromise
  seedPromise = seedDatabaseIfEmpty()
  return seedPromise
}

async function seedDatabaseIfEmpty() {
  const count = await db.compounds.count()
  if (count > 0) return

  const [testosteroneId, hcgId, ipaId] = await db.compounds.bulkAdd(
    [
      {
        name: 'Testosterone Cypionate',
        category: 'TRT',
        defaultDose: 40,
        unit: 'mg',
        concentration: '200 mg/ml',
        schedule: 'Mon / Wed / Fri',
        color: '#0f8f84',
      },
      {
        name: 'HCG',
        category: 'Peptide',
        defaultDose: 250,
        unit: 'iu',
        concentration: '5,000 iu vial',
        schedule: 'Tue / Sat',
        color: '#2563eb',
      },
      {
        name: 'Ipamorelin',
        category: 'Peptide',
        defaultDose: 100,
        unit: 'mcg',
        schedule: 'Nightly',
        color: '#8b5cf6',
      },
    ],
    { allKeys: true },
  )

  await db.injections.bulkAdd([
    {
      compoundId: Number(testosteroneId),
      takenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      dose: 40,
      unit: 'mg',
      route: 'SubQ',
      site: 'Left abdomen',
      notes: 'No irritation.',
    },
    {
      compoundId: Number(hcgId),
      takenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      dose: 250,
      unit: 'iu',
      route: 'SubQ',
      site: 'Right abdomen',
    },
    {
      compoundId: Number(ipaId),
      takenAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      dose: 100,
      unit: 'mcg',
      route: 'SubQ',
      site: 'Thigh',
    },
  ])

  await db.vitals.bulkAdd([
    {
      measuredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      systolic: 128,
      diastolic: 78,
      pulse: 62,
    },
    {
      measuredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      systolic: 124,
      diastolic: 76,
      pulse: 60,
    },
    {
      measuredAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      systolic: 121,
      diastolic: 74,
      pulse: 58,
    },
  ])

  const examId = await db.exams.add({
    name: 'Baseline blood panel',
    collectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    labName: 'Manual entry',
    notes: 'Seed data. Replace with your own results.',
  })

  await db.results.bulkAdd([
    { examId, marker: 'Total Testosterone', value: 742, unit: 'ng/dL', low: 300, high: 900 },
    { examId, marker: 'Free Testosterone', value: 22.4, unit: 'ng/dL', low: 8, high: 25 },
    { examId, marker: 'Estradiol', value: 31, unit: 'pg/mL', low: 10, high: 40 },
    { examId, marker: 'Hematocrit', value: 47.8, unit: '%', low: 40, high: 52 },
    { examId, marker: 'PSA', value: 0.9, unit: 'ng/mL', low: 0, high: 4 },
  ])
}
