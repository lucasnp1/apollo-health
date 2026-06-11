import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Plus, Trash2, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { extractMarkersFromText, type ExtractedMarker } from '../lib/pdf'
import { db, type HealthFile } from '../lib/db'
import { canonicalize } from '../lib/markers'

type Row = ExtractedMarker & { include: boolean }

// Suggestion list shown beneath an edited marker name field — combines
// canonical markers we know + markers the user already has on file (so
// renaming "ALT" to "Alanine Aminotransferase" pulls in the existing
// canonical, preventing accidental duplicates in their lab history).
function useMarkerSuggestions() {
  const existing = useLiveQuery(async () => {
    const all = await db.results.toArray()
    const set = new Set<string>()
    for (const r of all) {
      const canon = canonicalize(r.marker)
      // Prefer the canonical label when available — it's the version
      // the Labs view groups by.
      set.add(canon?.label ?? r.marker)
    }
    return [...set].sort()
  }, [], [])
  return existing
}

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
  const suggestions = useMarkerSuggestions()

  // If the file changes (user uploads another PDF before closing) reset.
  useEffect(() => { setRows(initial) }, [initial])

  const selectedCount = rows.filter((r) => r.include).length
  const allSelected = selectedCount === rows.length && rows.length > 0

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addRow() {
    setRows((prev) => [...prev, { marker: '', value: NaN, unit: '', include: true }])
  }

  async function commitImport(useAll: boolean) {
    if (saving) return
    // Canonicalise marker names so "Alanine Aminotransferase" merges with
    // existing "ALT" history instead of creating a new marker line. Keeps
    // the user's lab record consistent across imports.
    const items: ExtractedMarker[] = (useAll ? rows : rows.filter((r) => r.include))
      .filter((r) => Number.isFinite(r.value) && r.marker.trim().length > 0)
      .map(({ include: _i, marker, value, unit }) => {
        const canon = canonicalize(marker)
        return {
          marker: canon?.label ?? marker.trim(),
          value,
          unit: unit.trim(),
        }
      })
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
              <span>
                {rows.length} marker{rows.length === 1 ? '' : 's'}
                {' · '}
                {selectedCount} selected
              </span>
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

        {/* Shared datalist gives every marker-name field the same
            autocomplete: canonical markers + markers already in the
            user's history. Picking one keeps the name aligned with
            existing records so the Labs view groups them together. */}
        <datalist id="marker-suggestions">
          {(suggestions ?? []).map((s) => <option key={s} value={s} />)}
        </datalist>

        <div className="pdf-review-body">
          {rows.length === 0 ? (
            <div className="pdf-review-empty-wrap">
              <p className="pdf-review-empty">
                We didn't find any known lab markers in this PDF. Add markers
                manually with the button below.
              </p>
              <button
                type="button"
                className="ghost-button"
                onClick={addRow}
                style={{ alignSelf: 'center', marginTop: 12 }}
              >
                <Plus size={13} /> Add a marker
              </button>
            </div>
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
                <span className="pdf-review-count">
                  {selectedCount} of {rows.length} selected
                </span>
              </div>
              <ul className="pdf-review-list">
                {rows.map((r, i) => (
                  <li key={i} className={r.include ? 'pdf-review-row' : 'pdf-review-row off'}>
                    <input
                      type="checkbox"
                      className="pdf-review-row-check"
                      checked={r.include}
                      onChange={(e) => updateRow(i, { include: e.target.checked })}
                      aria-label="Include this row"
                    />
                    <input
                      type="text"
                      className="pdf-review-name"
                      value={r.marker}
                      onChange={(e) => updateRow(i, { marker: e.target.value })}
                      list="marker-suggestions"
                      placeholder="Marker name"
                      aria-label="Marker name"
                    />
                    <input
                      type="number"
                      step="any"
                      className="pdf-review-value"
                      value={Number.isFinite(r.value) ? r.value : ''}
                      onChange={(e) => updateRow(i, { value: Number(e.target.value) })}
                      placeholder="value"
                      aria-label={`${r.marker || 'marker'} value`}
                    />
                    <input
                      type="text"
                      className="pdf-review-unit"
                      value={r.unit}
                      onChange={(e) => updateRow(i, { unit: e.target.value })}
                      placeholder="unit"
                      aria-label={`${r.marker || 'marker'} unit`}
                    />
                    <button
                      type="button"
                      className="icon-button danger pdf-review-row-del"
                      onClick={() => removeRow(i)}
                      aria-label={`Remove ${r.marker}`}
                      title="Remove row"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="ghost-button pdf-review-add"
                onClick={addRow}
              >
                <Plus size={13} /> Add a marker
              </button>
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
