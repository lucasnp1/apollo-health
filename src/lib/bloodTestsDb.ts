// Bloods writes: saving a test from the editor and merging two tests. Each
// runs in one Dexie transaction and hands back its own undo. Nothing is ever
// hard-deleted: removed rows and merged tests are archived, so sync carries
// the change and the Archive view can bring them back.

import { db, type ExamMeta, type LabExam, type LabResult } from './db'
import { archiveRow, restoreRow, setExamArchived } from './archive'
import { canonicalKey, fillEmpty, planMerge, splitNewRows, tcUnitExams } from './labTests'

export type DraftRow = {
  /** Set for a stored row in edit mode. */
  resultId?: number
  marker: string
  value?: number
  rawValue: string
  unit: string
  low?: number
  high?: number
  status?: 'H' | 'L'
}

export type Draft = {
  /** yyyy-mm-dd */
  date: string
  name: string
  company?: string
  notes?: string
  meta: ExamMeta
  rows: DraftRow[]
  source: 'pdf' | 'photo' | 'manual' | 'read'
  sourceFileId?: number
}

export type SaveTarget = { kind: 'new' } | { kind: 'add'; examId: number } | { kind: 'edit'; examId: number; removed: number[] }

export type Saved = { examId: number; added: number; skipped: number; undo: () => Promise<void> }

// How the test was added. Stored, never displayed.
const LAB_NAME: Record<Draft['source'], string> = { pdf: 'PDF import', photo: 'Photo import', manual: 'Manual entry', read: 'Read' }

const live = (r: { archivedAt?: number; deletedAtSync?: number }) => !r.archivedAt && !r.deletedAtSync

const resultFields = (r: DraftRow) => ({
  marker: r.marker.trim(),
  value: r.value,
  rawValue: r.rawValue.trim(),
  unit: r.unit.trim(),
  low: r.low,
  high: r.high,
  status: r.status,
})

/** The fields of `row` named in `patch`, as they are now, so an update can be reverted. */
function before<T extends object>(row: T, patch: Partial<T>): Partial<T> {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, row[k as keyof T]])) as Partial<T>
}

async function liveResults(examId: number): Promise<LabResult[]> {
  return (await db.results.where('examId').equals(examId).toArray()).filter(live)
}

/**
 * Reports that already became a test but still say "Needs review" (an old
 * sync race left some behind) are marked reviewed, so the queue only ever
 * holds reports nobody has imported yet.
 */
export async function settleReviewQueue(): Promise<number> {
  const queued = await db.files.filter((f) => f.status === 'Needs review' && !f.deletedAtSync).toArray()
  if (queued.length === 0) return 0
  const linked = new Set((await db.exams.filter((e) => live(e) && e.sourceFileId !== undefined).toArray()).map((e) => e.sourceFileId))
  const done = queued.filter((f) => linked.has(f.id))
  await Promise.all(done.map((f) => db.files.update(f.id!, { status: 'Reviewed' })))
  return done.length
}

/** Save the editor's draft as a new test, into an existing test (same draw), or over the test being edited. */
export async function saveTest(d: Draft, target: SaveTarget): Promise<Saved> {
  const exam = {
    name: d.name,
    collectedAt: `${d.date}T12:00:00Z`,
    company: d.company || undefined,
    notes: d.notes || undefined,
    meta: d.meta,
  }

  if (target.kind === 'new') {
    return db.transaction('rw', db.exams, db.results, db.files, async () => {
      const examId = await db.exams.add({ ...exam, labName: LAB_NAME[d.source], sourceFileId: d.sourceFileId }) as number
      await db.results.bulkAdd(d.rows.map((r) => ({ ...resultFields(r), examId, source: d.source })))
      if (d.sourceFileId !== undefined) await db.files.update(d.sourceFileId, { status: 'Reviewed' })
      const fileId = d.sourceFileId
      return {
        examId, added: d.rows.length, skipped: 0,
        undo: async () => {
          await setExamArchived(examId, true)
          if (fileId !== undefined) await db.files.update(fileId, { status: 'Needs review' })
        },
      }
    })
  }

  if (target.kind === 'add') {
    const examId = target.examId
    return db.transaction('rw', db.exams, db.results, db.files, async () => {
      const dst = await db.exams.get(examId)
      if (!dst) throw new Error('That test is no longer on file.')
      const { add, skipped } = splitNewRows(d.rows, await liveResults(examId))
      const ids = await db.results.bulkAdd(add.map((r) => ({ ...resultFields(r), examId, source: d.source })), { allKeys: true }) as number[]
      const fill = fillEmpty(dst, { company: exam.company, notes: exam.notes, meta: d.meta, sourceFileId: d.sourceFileId })
      const was = before(dst, fill)
      if (Object.keys(fill).length) await db.exams.update(examId, fill)
      if (d.sourceFileId !== undefined) await db.files.update(d.sourceFileId, { status: 'Reviewed' })
      const fileId = d.sourceFileId
      return {
        examId, added: add.length, skipped,
        undo: async () => {
          await db.transaction('rw', db.exams, db.results, db.files, async () => {
            for (const id of ids) await archiveRow('results', id)
            if (Object.keys(was).length) await db.exams.update(examId, was)
            if (fileId !== undefined) await db.files.update(fileId, { status: 'Needs review' })
          })
        },
      }
    })
  }

  const examId = target.examId
  return db.transaction('rw', db.exams, db.results, async () => {
    const old = await db.exams.get(examId)
    if (!old) throw new Error('That test is no longer on file.')
    // A test shows one row per key, so a hidden live duplicate would take the
    // place of a removed row. Removing a marker archives every row of its key.
    const liveRows = await liveResults(examId)
    const tc = tcUnitExams(liveRows).has(examId)
    const keyOf = (r: LabResult) => canonicalKey(r.marker, r.unit, r, tc).key
    const removedKeys = new Set(liveRows.filter((r) => target.removed.includes(r.id!)).map(keyOf))
    const keptIds = new Set(d.rows.map((r) => r.resultId))
    const removed = liveRows.filter((r) => !keptIds.has(r.id) && removedKeys.has(keyOf(r))).map((r) => r.id!)
    const oldExam = before(old, exam)
    await db.exams.update(examId, exam)

    const kept = d.rows.filter((r) => r.resultId !== undefined)
    const oldRows = new Map((await db.results.bulkGet(kept.map((r) => r.resultId!))).flatMap((r) => (r?.id !== undefined ? [[r.id, r] as const] : [])))
    const reverts: Array<[number, Partial<LabResult>]> = []
    for (const r of kept) {
      const row = oldRows.get(r.resultId!)
      if (!row) continue
      const patch = resultFields(r)
      reverts.push([r.resultId!, before(row, patch)])
      await db.results.update(r.resultId!, patch)
    }
    const fresh = d.rows.filter((r) => r.resultId === undefined)
    const ids = await db.results.bulkAdd(fresh.map((r) => ({ ...resultFields(r), examId, source: 'manual' })), { allKeys: true }) as number[]
    for (const id of removed) await archiveRow('results', id)

    return {
      examId, added: fresh.length, skipped: 0,
      undo: async () => {
        await db.transaction('rw', db.exams, db.results, async () => {
          await db.exams.update(examId, oldExam)
          for (const [id, patch] of reverts) await db.results.update(id, patch)
          for (const id of ids) await archiveRow('results', id)
          for (const id of removed) await restoreRow('results', id)
        })
      },
    }
  })
}

/**
 * Merge test `src` into test `dst`: src's results move over (the ones whose
 * marker dst already has are archived, dst keeps its values), dst's empty fields are
 * filled from src, and src is archived. Returns the undo.
 */
export async function mergeTests(src: number, dst: number): Promise<() => Promise<void>> {
  return db.transaction('rw', db.exams, db.results, async () => {
    const [s, d] = await Promise.all([db.exams.get(src), db.exams.get(dst)])
    if (!s || !d || src === dst) throw new Error('Pick two different tests to merge.')
    const srcRows = await liveResults(src)
    const { archive } = planMerge(srcRows, await liveResults(dst))
    const moved = srcRows.map((r) => r.id!)
    await db.results.where('id').anyOf(moved).modify({ examId: dst })
    for (const id of archive) await archiveRow('results', id)
    const fill = fillEmpty(d, s)
    const was = before(d, fill)
    if (Object.keys(fill).length) await db.exams.update(dst, fill)
    await archiveRow('exams', src)

    return async () => {
      await db.transaction('rw', db.exams, db.results, async () => {
        await restoreRow('exams', src)
        await db.results.where('id').anyOf(moved).modify({ examId: src })
        for (const id of archive) await restoreRow('results', id)
        if (Object.keys(was).length) await db.exams.update(dst, was as Partial<LabExam>)
      })
    }
  })
}
