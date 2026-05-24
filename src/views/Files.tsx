import { useState } from 'react'
import { CloudDownload, FileText, Trash2, UploadCloud } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { extractPdfText } from '../lib/pdf'
import { ensureBlobAvailable } from '../lib/fileSync'
import { EmptyState } from '../components/EmptyState'

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
    <div className="content-grid">
      <section className="surface col-5">
        <div className="panel-header">
          <div>
            <span className="section-label">Local extraction</span>
            <h3>Upload exam</h3>
          </div>
          <UploadCloud size={18} style={{ color: 'var(--ink-mute)' }} />
        </div>
        <label className="primary-button" style={{ display: 'inline-flex', justifyContent: 'center' }}>
          <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => onFileUpload(e.target.files)} />
          {busy ? 'Reading…' : 'Choose PDF or image'}
        </label>
        <p className="panel-note">PDF text extraction runs in your browser. Nothing is uploaded.</p>
      </section>

      <section className="surface col-7">
        <div className="panel-header">
          <div>
            <span className="section-label">Storage</span>
            <h3>Local files</h3>
          </div>
        </div>
        {files.length > 0 ? (
          <div className="stack">
            {files.map((f) => (
              <FileRow file={f} key={f.id} />
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} title="No files" detail="PDF lab reports get parsed and prepared for review." />
        )}
      </section>
    </div>
  )
}

function FileRow({ file }: { file: StoredFile }) {
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
    <div className="row" style={{ gridTemplateColumns: 'auto 1fr auto auto auto' }}>
      <FileText size={14} />
      <div>
        <strong>{file.name}</strong>
        <span className="sub">
          {Math.round(file.size / 1024)} KB · {file.status}
          {!hasLocal && hasRemote ? ' · in cloud' : ''}
          {hasLocal && !hasRemote ? ' · local only' : ''}
          {error ? ` · ${error}` : ''}
        </span>
      </div>
      <time>{format(parseISO(file.addedAt), 'MMM d')}</time>
      <button type="button" className="ghost-button" disabled={!canOpen || busy} onClick={open}>
        {busy ? '…' : hasLocal ? 'Open' : <><CloudDownload size={12} /> Fetch</>}
      </button>
      <button type="button" className="icon-button danger" onClick={remove} aria-label="Delete file">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
