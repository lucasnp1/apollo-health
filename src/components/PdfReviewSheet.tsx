import { useEffect, useMemo, useState } from 'react'
import { Check, X, FileText } from 'lucide-react'
import { extractMarkersFromText, type ExtractedMarker } from '../lib/pdf'
import type { HealthFile } from '../lib/db'

type Row = ExtractedMarker & { include: boolean }

export function PdfReviewSheet({
  file,
  duplicateWarning,
  onImport,
  onClose,
}: {
  file: HealthFile
  duplicateWarning?: string
  onImport: (markers: ExtractedMarker[]) => Promise<void>
  onClose: () => void
}) {
  const initial = useMemo<Row[]>(() => {
    const markers = file.extractedText ? extractMarkersFromText(file.extractedText) : []
    return markers.map((m) => ({ ...m, include: true }))
  }, [file.extractedText])

  const [rows, setRows] = useState<Row[]>(initial)
  const [saving, setSaving] = useState(false)

  // If the file changes (user uploads another PDF before closing) reset.
  useEffect(() => { setRows(initial) }, [initial])

  const selectedCount = rows.filter((r) => r.include).length
  const allSelected = selectedCount === rows.length && rows.length > 0

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function commitImport(useAll: boolean) {
    if (saving) return
    const items: ExtractedMarker[] = (useAll ? rows : rows.filter((r) => r.include))
      .filter((r) => Number.isFinite(r.value))
      .map(({ include: _i, ...rest }) => rest)
    if (items.length === 0) return
    setSaving(true)
    try {
      await onImport(items)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet pdf-review-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Review extracted markers">
        <header className="pdf-review-header">
          <div className="pdf-review-title">
            <FileText size={14} />
            <div>
              <strong>{file.name.replace(/\.pdf$/i, '')}</strong>
              <span>{rows.length} marker{rows.length === 1 ? '' : 's'} detected</span>
            </div>
          </div>
          <div className="pdf-review-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => commitImport(true)}
              disabled={rows.length === 0 || saving}
            >
              <Check size={14} /> Approve all &amp; import
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close"
              disabled={saving}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {duplicateWarning && (
          <div className="pdf-review-warning" role="alert">
            {duplicateWarning}
          </div>
        )}

        <div className="pdf-review-body">
          {rows.length === 0 ? (
            <p className="pdf-review-empty">
              We didn't find any known lab markers in this PDF. You can close this and add results manually.
            </p>
          ) : (
            <>
              <div className="pdf-review-toolbar">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setRows((prev) => prev.map((r) => ({ ...r, include: !allSelected })))}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
                <span className="pdf-review-count">{selectedCount} of {rows.length} selected</span>
              </div>
              <ul className="pdf-review-list">
                {rows.map((r, i) => (
                  <li key={`${r.marker}-${i}`} className={r.include ? 'pdf-review-row' : 'pdf-review-row off'}>
                    <label className="pdf-review-check">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => updateRow(i, { include: e.target.checked })}
                      />
                      <span>{r.marker}</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="pdf-review-value"
                      value={Number.isFinite(r.value) ? r.value : ''}
                      onChange={(e) => updateRow(i, { value: Number(e.target.value) })}
                      aria-label={`${r.marker} value`}
                    />
                    <input
                      type="text"
                      className="pdf-review-unit"
                      value={r.unit}
                      onChange={(e) => updateRow(i, { unit: e.target.value })}
                      aria-label={`${r.marker} unit`}
                      placeholder="unit"
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {rows.length > 0 && (
          <footer className="pdf-review-footer">
            <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => commitImport(false)}
              disabled={selectedCount === 0 || saving}
            >
              Import {selectedCount} {selectedCount === 1 ? 'marker' : 'markers'}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
