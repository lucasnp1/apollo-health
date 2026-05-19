import { useState } from 'react'
import { FileText, Trash2, UploadCloud } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { extractPdfText } from '../lib/pdf'
import { EmptyState } from '../components/EmptyState'

export function Files({
  files,
}: {
  files: Array<{ id?: number; name: string; type: string; size: number; addedAt: string; status: string; extractedText?: string }>
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
        <p className="panel-note">Text extraction runs in your browser. Nothing is uploaded.</p>
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
              <div className="row" key={f.id}>
                <FileText size={14} />
                <div>
                  <strong>{f.name}</strong>
                  <span className="sub">{Math.round(f.size / 1024)} KB · {f.status}</span>
                </div>
                <time>{format(parseISO(f.addedAt), 'MMM d')}</time>
                <button type="button" className="icon-button danger" onClick={() => db.files.delete(f.id!)} aria-label="Delete file">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} title="No files" detail="PDF lab reports get parsed and prepared for review." />
        )}
      </section>
    </div>
  )
}
