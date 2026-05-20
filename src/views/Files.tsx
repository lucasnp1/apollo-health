import { useState } from 'react'
import { Activity, Check, CloudDownload, FileText, Trash2, UploadCloud } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { db } from '../lib/db'
import { extractPdfText } from '../lib/pdf'
import { commitHealthImport, parseAppleHealthXml, type HealthImportPreview } from '../lib/healthImport'
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
      <section className="surface col-12">
        <AppleHealthImport />
      </section>

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

function AppleHealthImport() {
  const [preview, setPreview] = useState<HealthImportPreview | null>(null)
  const [progress, setProgress] = useState<{ bytes: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState<{ inserted: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onPick(list: FileList | null) {
    const file = list?.[0]
    if (!file) return
    setBusy(true)
    setPreview(null)
    setCommitted(null)
    setError(null)
    try {
      const parsed = await parseAppleHealthXml(file, (bytes, total) => setProgress({ bytes, total }))
      setPreview(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function confirm() {
    if (!preview) return
    setBusy(true)
    try {
      const result = await commitHealthImport(preview)
      setCommitted(result)
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  const pct = progress ? Math.round((progress.bytes / Math.max(1, progress.total)) * 100) : 0

  return (
    <>
      <div className="panel-header">
        <div>
          <span className="section-label">Wearables &amp; HealthKit</span>
          <h3>Apple Health import</h3>
        </div>
        <span className="safety-chip">Parses locally · nothing uploaded</span>
      </div>
      <p className="panel-note">
        Open the Health app on iPhone → tap your profile → <strong>Export All Health Data</strong> → save the zip and
        unzip it. Drop the <strong>export.xml</strong> file below. Imports weight, body fat %, waist, blood pressure,
        resting heart rate, and HRV.
      </p>

      <label className="primary-button" style={{ display: 'inline-flex', justifyContent: 'center', alignSelf: 'flex-start' }}>
        <input type="file" accept=".xml,application/xml,text/xml" hidden onChange={(e) => onPick(e.target.files)} />
        {busy && progress ? `Parsing… ${pct}%` : busy ? 'Working…' : 'Choose export.xml'}
      </label>

      {error && <p className="panel-note" style={{ color: 'var(--bad)' }}>{error}</p>}

      {preview && (
        <>
          <div className="stat-grid">
            <Stat label="Weight" value={preview.weight} />
            <Stat label="Body fat" value={preview.bodyFat} />
            <Stat label="Waist" value={preview.waist} />
            <Stat label="Blood pressure" value={preview.bloodPressure} />
            <Stat label="Resting HR" value={preview.restingHr} />
            <Stat label="HRV" value={preview.hrv} />
          </div>
          <p className="panel-note">
            Date range: {preview.rangeFrom?.slice(0, 10) ?? '—'} to {preview.rangeTo?.slice(0, 10) ?? '—'} ·
            {' '}{preview.totalScanned.toLocaleString()} relevant records scanned. Existing records with the same
            timestamp will be skipped so re-importing is safe.
          </p>
          <button type="button" className="primary-button" onClick={confirm} disabled={busy} style={{ alignSelf: 'flex-start' }}>
            <Check size={15} /> Import to local database
          </button>
        </>
      )}

      {committed && (
        <p className="panel-note" style={{ color: 'var(--good)' }}>
          <Activity size={12} style={{ verticalAlign: -1 }} /> Imported {committed.inserted.toLocaleString()} new rows.
          Skipped {committed.skipped.toLocaleString()} duplicates.
        </p>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value.toLocaleString()}</span>
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
      // Soft-delete so sync engine propagates the tombstone; physical row
      // is removed after the push succeeds.
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
