import { db } from './db'

// Archive = soft, restorable, and synced (unlike a delete tombstone, the row is
// kept and archived_at propagates as a normal update). Setting updatedAt + dirty
// explicitly guarantees the sync engine picks it up.

export type ArchivableTable = 'injections' | 'vitals' | 'bodyMetrics' | 'symptoms' | 'results' | 'exams' | 'files'

type Archivable = { archivedAt?: number; updatedAt?: number; dirty?: 0 | 1 }

function stamp(row: Archivable, archive: boolean) {
  if (archive) row.archivedAt = Date.now()
  else delete row.archivedAt
  row.updatedAt = Date.now()
  row.dirty = 1
}

function tableOf(name: ArchivableTable) {
  return (db as unknown as Record<string, typeof db.injections>)[name]
}

export async function archiveRow(table: ArchivableTable, id: number): Promise<void> {
  await tableOf(table).where('id').equals(id).modify((row: Archivable) => stamp(row, true))
}

export async function restoreRow(table: ArchivableTable, id: number): Promise<void> {
  await tableOf(table).where('id').equals(id).modify((row: Archivable) => stamp(row, false))
}

// Archiving a lab file also archives the exam(s) + results it imported, so the
// whole import moves to the archive together. Restore reverses it.
export async function setFileArchived(fileId: number, archive: boolean): Promise<void> {
  await db.transaction('rw', db.files, db.exams, db.results, async () => {
    const exams = await db.exams.where('sourceFileId').equals(fileId).toArray()
    for (const ex of exams) {
      await db.results.where('examId').equals(ex.id!).modify((r: Archivable) => stamp(r, archive))
      if (ex.id != null) await db.exams.where('id').equals(ex.id).modify((r: Archivable) => stamp(r, archive))
    }
    await db.files.where('id').equals(fileId).modify((r: Archivable) => stamp(r, archive))
  })
}
