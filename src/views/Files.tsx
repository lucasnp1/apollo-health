import { useState } from 'react'
import { Archive, CloudDownload, FileText } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { ensureBlobAvailable } from '../lib/fileSync'
import { setFileArchived } from '../lib/archive'
import { usePlan } from '../lib/plan'
import { DashGrid } from '../components/dashboard/Grid'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { HealthFile } from '../lib/db'

type StoredFile = HealthFile

export function Files({
  files,
  onReviewFile,
}: {
  files: Array<StoredFile>
  onReviewFile?: (id: number) => void
}) {
  return (
    <DashGrid>
      <PanelCard className="md:col-span-2 xl:col-span-6" subtitle="Imported lab PDFs" title="Files">
        {files.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Added</TableHead>
                <TableHead className="w-[160px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => <FileRow file={f} key={f.id} onReviewFile={onReviewFile} />)}
            </TableBody>
          </Table>
        ) : (
          <PanelEmpty icon={FileText} title="No files yet" detail="Upload a lab PDF from the Lab results screen to import and manage it here." />
        )}
      </PanelCard>
    </DashGrid>
  )
}

function FileRow({ file, onReviewFile }: { file: StoredFile; onReviewFile?: (id: number) => void }) {
  const { isPro, openUpgrade } = usePlan()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasLocal = Boolean(file.blob)
  const hasRemote = Boolean(file.r2Key)
  const canOpen = hasLocal || hasRemote
  const location = !hasLocal && hasRemote ? 'in cloud' : hasLocal && !hasRemote ? 'local only' : null
  const needsReview = file.status === 'Needs review'

  async function open() {
    setError(null)
    setBusy(true)
    try {
      const blob = hasLocal ? file.blob! : await ensureBlobAvailable(file)
      if (!blob) { setError('File is unavailable'); return }
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the file')
    } finally {
      setBusy(false)
    }
  }

  // Delete the file AND everything it imported (its exam + results), so removing
  // an import cleans up after itself.
  async function archive() {
    if (!file.id) return
    const exams = await db.exams.where('sourceFileId').equals(file.id).filter((e) => !e.archivedAt).toArray()
    let resultCount = 0
    for (const ex of exams) resultCount += await db.results.where('examId').equals(ex.id!).filter((r) => !r.archivedAt).count()
    const msg = exams.length
      ? `Archive "${file.name}" and the ${resultCount} result${resultCount === 1 ? '' : 's'} imported from it? You can restore it later from the Archive.`
      : `Archive "${file.name}"? You can restore it later from the Archive.`
    if (!confirm(msg)) return
    await setFileArchived(file.id, true)
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{file.name}</span>
        </div>
        {error && <p className="mt-0.5 text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell className="hidden font-mono text-xs tabular-nums text-muted-foreground md:table-cell">{Math.round(file.size / 1024)} KB</TableCell>
      <TableCell className="text-xs text-muted-foreground">{file.status}{location ? ` · ${location}` : ''}</TableCell>
      <TableCell className="hidden font-mono text-xs tabular-nums text-muted-foreground md:table-cell">{format(parseISO(file.addedAt), 'MMM d')}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {needsReview && onReviewFile && file.id != null && (
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => (isPro ? onReviewFile(file.id!) : openUpgrade('Lab PDF import'))}>
              Review
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" disabled={!canOpen || busy} onClick={open}>
            {busy ? '…' : hasLocal ? 'Open' : <><CloudDownload className="size-3" /> Fetch</>}
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={archive} aria-label="Archive file" title="Archive">
            <Archive className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
