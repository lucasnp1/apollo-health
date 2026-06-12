import { useState } from 'react'
import { CloudDownload, FileText, Trash2, UploadCloud } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { extractPdfText } from '../lib/pdf'
import { ensureBlobAvailable } from '../lib/fileSync'
import { DashGrid } from '../components/dashboard/Grid'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { HealthFile } from '../lib/db'
type StoredFile = HealthFile

export function Files({
  files,
}: {
  files: Array<StoredFile>
}) {
  const [busy, setBusy] = useState(false)

  async function onFileUpload(list: FileList | null) {
    const file = list?.[0]
    if (!file) return
    setBusy(true)
    try {
      const extractedText = file.type === 'application/pdf' ? await extractPdfText(file) : ''
      await db.files.add({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        addedAt: new Date().toISOString(),
        status: extractedText ? 'Needs review' : 'Stored',
        extractedText,
        blob: file,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashGrid>
      <PanelCard
        className="md:col-span-2 xl:col-span-2"
        subtitle="Local extraction"
        title="Upload exam"
        action={<UploadCloud className="size-4 text-muted-foreground" />}
      >
        <div className="flex flex-col gap-3">
          <Button asChild className="self-start">
            <label className="cursor-pointer">
              <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => onFileUpload(e.target.files)} />
              {busy ? 'Reading…' : 'Choose PDF or image'}
            </label>
          </Button>
          <p className="text-xs text-muted-foreground">PDF text extraction runs in your browser. Nothing is uploaded.</p>
        </div>
      </PanelCard>

      <PanelCard className="md:col-span-2 xl:col-span-4" subtitle="Storage" title="Local files">
        {files.length > 0 ? (
          <div className="flex flex-col">
            {files.map((f, i) => (
              <FileRow file={f} first={i === 0} key={f.id} />
            ))}
          </div>
        ) : (
          <PanelEmpty icon={FileText} title="No files" detail="PDF lab reports get parsed and prepared for review." />
        )}
      </PanelCard>
    </DashGrid>
  )
}

function FileRow({ file, first }: { file: StoredFile; first: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasLocal = Boolean(file.blob)
  const hasRemote = Boolean(file.r2Key)
  const canOpen = hasLocal || hasRemote

  async function open() {
    setError(null)
    setBusy(true)
    try {
      const blob = hasLocal ? file.blob! : await ensureBlobAvailable(file)
      if (!blob) {
        setError('Blob unavailable')
        return
      }
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Open failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!file.id) return
    if (file.serverId) {
      await db.files.update(file.id, { deletedAtSync: Date.now(), dirty: 1 })
    } else {
      await db.files.delete(file.id)
    }
  }

  return (
    <div className={cn('flex items-center gap-3 py-2.5', !first && 'border-t')}>
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {Math.round(file.size / 1024)} KB · {file.status}
          {!hasLocal && hasRemote ? ' · in cloud' : ''}
          {hasLocal && !hasRemote ? ' · local only' : ''}
          {error ? ` · ${error}` : ''}
        </p>
      </div>
      <time className="shrink-0 text-xs text-muted-foreground">{format(parseISO(file.addedAt), 'MMM d')}</time>
      <Button variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-xs" disabled={!canOpen || busy} onClick={open}>
        {busy ? '…' : hasLocal ? 'Open' : <><CloudDownload className="size-3" /> Fetch</>}
      </Button>
      <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={remove} aria-label="Delete file">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
