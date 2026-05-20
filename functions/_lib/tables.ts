// Catalog of syncable tables. Each entry maps the client field names
// (camelCase, matching Dexie types in src/lib/db.ts) to D1 columns
// (snake_case) and lists the allowed columns for writes.
// Adding a new sync table = adding an entry here.

export type ColumnMap = {
  [clientField: string]: { col: string; type: 'text' | 'int' | 'real' | 'bool' | 'json' }
}

export type TableSpec = {
  // URL slug → DB table
  table: string
  // Columns owned by the user, written from the client
  columns: ColumnMap
  // Whether the table allows hard-delete (false = always soft via deleted_at)
  hardDelete?: boolean
}

const CT: ColumnMap = {
  createdAt: { col: 'created_at', type: 'int' },
  updatedAt: { col: 'updated_at', type: 'int' },
  deletedAt: { col: 'deleted_at', type: 'int' },
}

export const TABLES: Record<string, TableSpec> = {
  compounds: {
    table: 'compounds',
    columns: {
      id: { col: 'id', type: 'text' },
      name: { col: 'name', type: 'text' },
      category: { col: 'category', type: 'text' },
      defaultDose: { col: 'default_dose', type: 'real' },
      unit: { col: 'unit', type: 'text' },
      concentration: { col: 'concentration', type: 'text' },
      schedule: { col: 'schedule', type: 'text' },
      color: { col: 'color', type: 'text' },
      ester: { col: 'ester', type: 'text' },
      halfLifeDays: { col: 'half_life_days', type: 'real' },
      peakHours: { col: 'peak_hours', type: 'real' },
      archived: { col: 'archived', type: 'bool' },
      ...CT,
    },
  },
  injections: {
    table: 'injections',
    columns: {
      id: { col: 'id', type: 'text' },
      compoundId: { col: 'compound_id', type: 'text' },
      takenAt: { col: 'taken_at', type: 'text' },
      dose: { col: 'dose', type: 'real' },
      unit: { col: 'unit', type: 'text' },
      route: { col: 'route', type: 'text' },
      site: { col: 'site', type: 'text' },
      notes: { col: 'notes', type: 'text' },
      rawDose: { col: 'raw_dose', type: 'text' },
      vialAmount: { col: 'vial_amount', type: 'text' },
      weightKg: { col: 'weight_kg', type: 'real' },
      protocolDoseId: { col: 'protocol_dose_id', type: 'text' },
      vialId: { col: 'vial_id', type: 'text' },
      ...CT,
    },
  },
  vitals: {
    table: 'vitals',
    columns: {
      id: { col: 'id', type: 'text' },
      measuredAt: { col: 'measured_at', type: 'text' },
      systolic: { col: 'systolic', type: 'int' },
      diastolic: { col: 'diastolic', type: 'int' },
      pulse: { col: 'pulse', type: 'int' },
      weightKg: { col: 'weight_kg', type: 'real' },
      waistCm: { col: 'waist_cm', type: 'real' },
      bodyFatPct: { col: 'body_fat_pct', type: 'real' },
      notes: { col: 'notes', type: 'text' },
      ...CT,
    },
  },
  exams: {
    table: 'exams',
    columns: {
      id: { col: 'id', type: 'text' },
      name: { col: 'name', type: 'text' },
      collectedAt: { col: 'collected_at', type: 'text' },
      examType: { col: 'exam_type', type: 'text' },
      location: { col: 'location', type: 'text' },
      company: { col: 'company', type: 'text' },
      labName: { col: 'lab_name', type: 'text' },
      sourceFileId: { col: 'source_file_id', type: 'text' },
      notes: { col: 'notes', type: 'text' },
      ...CT,
    },
  },
  results: {
    table: 'results',
    columns: {
      id: { col: 'id', type: 'text' },
      examId: { col: 'exam_id', type: 'text' },
      marker: { col: 'marker', type: 'text' },
      value: { col: 'value', type: 'real' },
      rawValue: { col: 'raw_value', type: 'text' },
      unit: { col: 'unit', type: 'text' },
      low: { col: 'low', type: 'real' },
      high: { col: 'high', type: 'real' },
      status: { col: 'status', type: 'text' },
      notes: { col: 'notes', type: 'text' },
      source: { col: 'source', type: 'text' },
      ...CT,
    },
  },
  files: {
    table: 'files',
    columns: {
      id: { col: 'id', type: 'text' },
      name: { col: 'name', type: 'text' },
      type: { col: 'type', type: 'text' },
      size: { col: 'size', type: 'int' },
      addedAt: { col: 'added_at', type: 'text' },
      status: { col: 'status', type: 'text' },
      extractedText: { col: 'extracted_text', type: 'text' },
      r2Key: { col: 'r2_key', type: 'text' },
      ...CT,
    },
  },
  protocols: {
    table: 'protocols',
    columns: {
      id: { col: 'id', type: 'text' },
      name: { col: 'name', type: 'text' },
      compoundId: { col: 'compound_id', type: 'text' },
      dose: { col: 'dose', type: 'real' },
      unit: { col: 'unit', type: 'text' },
      cadence: { col: 'cadence', type: 'json' },
      startedAt: { col: 'started_at', type: 'text' },
      endsAt: { col: 'ends_at', type: 'text' },
      notes: { col: 'notes', type: 'text' },
      phase: { col: 'phase', type: 'text' },
      archived: { col: 'archived', type: 'bool' },
      ...CT,
    },
  },
  protocolDoses: {
    table: 'protocol_doses',
    columns: {
      id: { col: 'id', type: 'text' },
      protocolId: { col: 'protocol_id', type: 'text' },
      scheduledAt: { col: 'scheduled_at', type: 'text' },
      status: { col: 'status', type: 'text' },
      injectionId: { col: 'injection_id', type: 'text' },
      ...CT,
    },
  },
  vials: {
    table: 'vials',
    columns: {
      id: { col: 'id', type: 'text' },
      compoundId: { col: 'compound_id', type: 'text' },
      label: { col: 'label', type: 'text' },
      totalMl: { col: 'total_ml', type: 'real' },
      concentrationMgPerMl: { col: 'concentration_mg_per_ml', type: 'real' },
      remainingMl: { col: 'remaining_ml', type: 'real' },
      openedAt: { col: 'opened_at', type: 'text' },
      expiresAt: { col: 'expires_at', type: 'text' },
      costCents: { col: 'cost_cents', type: 'int' },
      archived: { col: 'archived', type: 'bool' },
      ...CT,
    },
  },
  symptoms: {
    table: 'symptoms',
    columns: {
      id: { col: 'id', type: 'text' },
      recordedAt: { col: 'recorded_at', type: 'text' },
      libido: { col: 'libido', type: 'int' },
      sleep: { col: 'sleep', type: 'int' },
      mood: { col: 'mood', type: 'int' },
      energy: { col: 'energy', type: 'int' },
      waterRetention: { col: 'water_retention', type: 'int' },
      acne: { col: 'acne', type: 'int' },
      nippleSensitivity: { col: 'nipple_sensitivity', type: 'int' },
      jointPain: { col: 'joint_pain', type: 'int' },
      headache: { col: 'headache', type: 'int' },
      notes: { col: 'notes', type: 'text' },
      ...CT,
    },
  },
  markerTargets: {
    table: 'marker_targets',
    columns: {
      id: { col: 'id', type: 'text' },
      marker: { col: 'marker', type: 'text' },
      low: { col: 'low', type: 'real' },
      high: { col: 'high', type: 'real' },
      unit: { col: 'unit', type: 'text' },
      rationale: { col: 'rationale', type: 'text' },
      ...CT,
    },
  },
  goals: {
    table: 'goals',
    columns: {
      id: { col: 'id', type: 'text' },
      kind: { col: 'kind', type: 'text' },
      label: { col: 'label', type: 'text' },
      target: { col: 'target', type: 'real' },
      marker: { col: 'marker', type: 'text' },
      startedAt: { col: 'started_at', type: 'text' },
      achievedAt: { col: 'achieved_at', type: 'text' },
      ...CT,
    },
  },
  bodyMetrics: {
    table: 'body_metrics',
    columns: {
      id: { col: 'id', type: 'text' },
      measuredAt: { col: 'measured_at', type: 'text' },
      source: { col: 'source', type: 'text' },
      weightKg: { col: 'weight_kg', type: 'real' },
      bodyFatPct: { col: 'body_fat_pct', type: 'real' },
      waistCm: { col: 'waist_cm', type: 'real' },
      restingHr: { col: 'resting_hr', type: 'real' },
      hrvMs: { col: 'hrv_ms', type: 'real' },
      sleepHours: { col: 'sleep_hours', type: 'real' },
      externalKey: { col: 'external_key', type: 'text' },
      ...CT,
    },
  },
}

// Convert a DB row (snake_case) into a client-shaped row (camelCase).
export function rowToClient(spec: TableSpec, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const byCol = new Map<string, { client: string; type: string }>()
  for (const [client, def] of Object.entries(spec.columns)) byCol.set(def.col, { client, type: def.type })
  for (const [col, value] of Object.entries(row)) {
    const meta = byCol.get(col)
    if (!meta) continue
    if (value === null || value === undefined) {
      out[meta.client] = undefined
    } else if (meta.type === 'bool') {
      out[meta.client] = Boolean(value)
    } else if (meta.type === 'json' && typeof value === 'string') {
      try {
        out[meta.client] = JSON.parse(value)
      } catch {
        out[meta.client] = value
      }
    } else {
      out[meta.client] = value
    }
  }
  return out
}
