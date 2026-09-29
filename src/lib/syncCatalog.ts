// Client-side catalog of syncable tables.
// Mirrors functions/_lib/tables.ts but adds Dexie table names, FK declarations,
// and a parent-first ordering used by the sync engine.

export type FieldType = 'text' | 'int' | 'real' | 'bool' | 'json'

export type ForeignKey = {
  field: string         // local column name (e.g. 'compoundId')
  targetTable: string   // sync slug (e.g. 'compounds')
}

export type TableSpec = {
  // URL slug used in /api/sync/<slug>
  slug: string
  // Dexie table name (matches db.* property)
  dexie: string
  // Allowed columns and their types. Order: id first, then domain fields, then sync fields.
  columns: Record<string, FieldType>
  // FK columns that point to another local Dexie row by numeric id. Sync engine
  // resolves to/from server UUIDs.
  foreignKeys?: ForeignKey[]
  // Bump when adding columns. It keys a fresh pull cursor, so every device
  // re-pulls the table once and picks up values for rows it already pulled
  // while its bundle did not know the new columns yet.
  rev?: number
  // Columns that were device-local before their migration: a server NULL
  // there means "never sent", so the pull keeps the local value. Every other
  // column takes the server's NULL, so restores and cleared fields sync.
  keepLocalOnNull?: string[]
}

// Parent-first order. Children depend on earlier entries.
//   compounds → vials/protocols → protocolDoses → injections
//   files     → exams           → results
//   no-deps   : vitals, symptoms, markerTargets, goals, bodyMetrics
export const TABLES: TableSpec[] = [
  {
    slug: 'compounds',
    dexie: 'compounds',
    rev: 12,
    // Migrations 0010 and 0012 moved these from the device to the server.
    keepLocalOnNull: ['concentrationMgPerMl', 'defaultRoute', 'lastDose', 'vialMg', 'reconstituteMl', 'vialKind', 'syringe', 'entryMode'],
    columns: {
      name: 'text',
      category: 'text',
      defaultDose: 'real',
      unit: 'text',
      concentration: 'text',
      schedule: 'text',
      color: 'text',
      ester: 'text',
      halfLifeDays: 'real',
      peakHours: 'real',
      archived: 'bool',
      // Per-compound values the injection logger remembers for next time.
      // Device-local until migration 0010 put them on the server.
      concentrationMgPerMl: 'real',
      defaultRoute: 'text',
      lastDose: 'real',
      vialMg: 'real',
      reconstituteMl: 'real',
      // Migration 0012: vial kind and syringe are per compound, not per route.
      vialKind: 'text',
      syringe: 'text',
      entryMode: 'text',
    },
  },
  {
    slug: 'vials',
    dexie: 'vials',
    columns: {
      label: 'text',
      totalMl: 'real',
      concentrationMgPerMl: 'real',
      remainingMl: 'real',
      openedAt: 'text',
      expiresAt: 'text',
      costCents: 'int',
      archived: 'bool',
      compoundId: 'text',
    },
    foreignKeys: [{ field: 'compoundId', targetTable: 'compounds' }],
  },
  {
    slug: 'protocols',
    dexie: 'protocols',
    columns: {
      name: 'text',
      dose: 'real',
      unit: 'text',
      cadence: 'json',
      startedAt: 'text',
      endsAt: 'text',
      notes: 'text',
      phase: 'text',
      archived: 'bool',
      compoundId: 'text',
    },
    foreignKeys: [{ field: 'compoundId', targetTable: 'compounds' }],
  },
  {
    slug: 'protocolDoses',
    dexie: 'protocolDoses',
    columns: {
      scheduledAt: 'text',
      status: 'text',
      protocolId: 'text',
      injectionId: 'text',
    },
    foreignKeys: [
      { field: 'protocolId', targetTable: 'protocols' },
      { field: 'injectionId', targetTable: 'injections' },
    ],
  },
  {
    slug: 'injections',
    dexie: 'injections',
    rev: 13,
    columns: {
      takenAt: 'text',
      dose: 'real',
      unit: 'text',
      route: 'text',
      site: 'text',
      notes: 'text',
      rawDose: 'text',
      vialAmount: 'text',
      weightKg: 'real',
      compoundId: 'text',
      vialId: 'text',
      protocolDoseId: 'text',
      archivedAt: 'int',
      needle: 'text',
    },
    foreignKeys: [
      { field: 'compoundId', targetTable: 'compounds' },
      { field: 'vialId', targetTable: 'vials' },
      { field: 'protocolDoseId', targetTable: 'protocolDoses' },
    ],
  },
  {
    slug: 'files',
    dexie: 'files',
    columns: {
      name: 'text',
      type: 'text',
      size: 'int',
      addedAt: 'text',
      status: 'text',
      extractedText: 'text',
      archivedAt: 'int',
      // blob is intentionally excluded — sync metadata only. R2 wiring is a later phase.
    },
  },
  {
    slug: 'exams',
    dexie: 'exams',
    columns: {
      name: 'text',
      collectedAt: 'text',
      examType: 'text',
      location: 'text',
      company: 'text',
      labName: 'text',
      notes: 'text',
      sourceFileId: 'text',
      meta: 'json',
      archivedAt: 'int',
    },
    foreignKeys: [{ field: 'sourceFileId', targetTable: 'files' }],
    rev: 14,
  },
  {
    slug: 'results',
    dexie: 'results',
    columns: {
      marker: 'text',
      value: 'real',
      rawValue: 'text',
      unit: 'text',
      low: 'real',
      high: 'real',
      status: 'text',
      notes: 'text',
      source: 'text',
      examId: 'text',
      archivedAt: 'int',
    },
    foreignKeys: [{ field: 'examId', targetTable: 'exams' }],
  },
  {
    slug: 'vitals',
    dexie: 'vitals',
    columns: {
      measuredAt: 'text',
      systolic: 'int',
      diastolic: 'int',
      pulse: 'int',
      weightKg: 'real',
      waistCm: 'real',
      bodyFatPct: 'real',
      notes: 'text',
      archivedAt: 'int',
    },
  },
  {
    slug: 'symptoms',
    dexie: 'symptoms',
    columns: {
      recordedAt: 'text',
      libido: 'int',
      sleep: 'int',
      mood: 'int',
      energy: 'int',
      waterRetention: 'int',
      acne: 'int',
      nippleSensitivity: 'int',
      jointPain: 'int',
      headache: 'int',
      notes: 'text',
      archivedAt: 'int',
      extras: 'json',
    },
  },
  {
    slug: 'markerTargets',
    dexie: 'markerTargets',
    columns: {
      marker: 'text',
      low: 'real',
      high: 'real',
      unit: 'text',
      rationale: 'text',
    },
  },
  {
    slug: 'goals',
    dexie: 'goals',
    columns: {
      kind: 'text',
      label: 'text',
      target: 'real',
      marker: 'text',
      startedAt: 'text',
      achievedAt: 'text',
    },
  },
  {
    slug: 'bodyMetrics',
    dexie: 'bodyMetrics',
    columns: {
      measuredAt: 'text',
      source: 'text',
      weightKg: 'real',
      bodyFatPct: 'real',
      waistCm: 'real',
      restingHr: 'real',
      hrvMs: 'real',
      sleepHours: 'real',
      externalKey: 'text',
      archivedAt: 'int',
    },
  },
]

