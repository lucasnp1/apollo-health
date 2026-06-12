import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Plus, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { extractMarkersFromText, type ExtractedMarker } from '../lib/pdf'
import { db, type HealthFile } from '../lib/db'
import { canonicalize } from '../lib/markers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

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
      .map(({ include: _i, marker, value, unit, low, high }) => {
        const canon = canonicalize(marker)
        return {
          marker: canon?.label ?? marker.trim(),
          value,
          unit: unit.trim(),
          // Critical: forward the reference range from the extractor. The
          // previous destructure left these off, so every PDF import landed
          // in D1 with no low/high → Labs showed every row as "OK".
          low,
          high,
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
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-h-[88dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name.replace(/\.pdf$/i, '')}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {rows.length} marker{rows.length === 1 ? '' : 's'} · {selectedCount} selected
          </p>
        </DialogHeader>

        {duplicateWarning && (
          <div className="rounded-md border-l-2 border-l-amber-500 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300" role="alert">
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

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">
              We didn't find any known lab markers in this PDF. Add markers manually with the button below.
            </p>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-3.5" /> Add a marker
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => prev.map((r) => ({ ...r, include: !allSelected })))}
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {selectedCount} of {rows.length} selected
              </span>
            </div>

            <ScrollArea className="-mx-1 max-h-[42dvh] px-1">
              <ul className="flex flex-col">
                {rows.map((r, i) => (
                  <li
                    key={i}
                    className={cn(
                      'grid grid-cols-[16px_minmax(0,1.8fr)_88px_72px_28px] items-center gap-2 border-b py-2 last:border-b-0',
                      !r.include && 'opacity-45',
                    )}
                  >
                    <Checkbox
                      checked={r.include}
                      onCheckedChange={(v) => updateRow(i, { include: v === true })}
                      aria-label="Include this row"
                    />
                    <Input
                      type="text"
                      className="h-8 text-xs font-medium"
                      value={r.marker}
                      onChange={(e) => updateRow(i, { marker: e.target.value })}
                      list="marker-suggestions"
                      placeholder="Marker name"
                      aria-label="Marker name"
                    />
                    <Input
                      type="number"
                      step="any"
                      className="h-8 font-mono text-xs tabular-nums"
                      value={Number.isFinite(r.value) ? r.value : ''}
                      onChange={(e) => updateRow(i, { value: Number(e.target.value) })}
                      placeholder="value"
                      aria-label={`${r.marker || 'marker'} value`}
                    />
                    <Input
                      type="text"
                      className="h-8 font-mono text-xs"
                      value={r.unit}
                      onChange={(e) => updateRow(i, { unit: e.target.value })}
                      placeholder="unit"
                      aria-label={`${r.marker || 'marker'} unit`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(i)}
                      aria-label={`Remove ${r.marker}`}
                      title="Remove row"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>

            <Button variant="outline" size="sm" className="self-start" onClick={addRow}>
              <Plus className="size-3.5" /> Add a marker
            </Button>

            <DialogFooter className="gap-2 border-t pt-3 sm:gap-0">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => commitImport(false)}
                disabled={selectedCount === 0 || saving}
              >
                Import {selectedCount} selected
              </Button>
              <Button onClick={() => commitImport(true)} disabled={rows.length === 0 || saving}>
                <Check className="size-4" /> Approve all &amp; import
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
