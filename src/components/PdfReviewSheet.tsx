import { useMemo, useState } from 'react'
import { AlertTriangle, Check, FileText, Plus, ScanText, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { extractMarkersFromText, extractCollectionDate, wasOcr, type Confidence, type ExtractedMarker } from '../lib/pdf'
import { db, type HealthFile } from '../lib/db'
import { canonicalize, PANEL_ORDER, type LabPanel } from '../lib/markers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type Row = ExtractedMarker & { id: number; include: boolean; panel: LabPanel }

let nextId = 1

// Suggestion list beneath an edited marker name field: canonical markers we
// know plus markers the user already has on file, so a rename lands on the
// same history line instead of creating a near-duplicate.
function useMarkerSuggestions() {
  return useLiveQuery(async () => {
    const all = await db.results.toArray()
    const set = new Set<string>()
    for (const r of all) set.add(canonicalize(r.marker)?.label ?? r.marker)
    return [...set].sort()
  }, [], [])
}

const CONF_DOT: Record<Confidence, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-destructive',
}
const CONF_TITLE: Record<Confidence, string> = {
  high: 'Read cleanly: value, unit and range all found',
  medium: 'Probably right, worth a glance',
  low: 'Uncertain: check this against the report',
}

function panelOf(marker: string): LabPanel {
  return canonicalize(marker)?.panel ?? 'Other'
}

export function PdfReviewSheet({
  file,
  duplicateWarning,
  onImport,
  onClose,
}: {
  file: HealthFile
  duplicateWarning?: string
  onImport: (markers: ExtractedMarker[], collectedAt: string) => Promise<void>
  onClose: () => void
}) {
  const ocr = wasOcr(file.extractedText)
  const isImage = file.type.startsWith('image/')

  const initial = useMemo<Row[]>(() => {
    const markers = file.extractedText ? extractMarkersFromText(file.extractedText) : []
    // Grouped by panel once, at load. Rows stay put while being edited.
    const rows = markers.map((m) => ({ ...m, id: nextId++, include: true, panel: panelOf(m.marker) }))
    const order = new Map(PANEL_ORDER.map((p, i) => [p, i]))
    return rows.sort((a, b) => (order.get(a.panel) ?? 99) - (order.get(b.panel) ?? 99))
  }, [file.extractedText])

  const detectedDate = useMemo(
    () => (file.extractedText ? extractCollectionDate(file.extractedText) : undefined),
    [file.extractedText],
  )
  const fallbackDate = new Date().toISOString().slice(0, 10)
  const [collectedAt, setCollectedAt] = useState<string>(detectedDate ?? fallbackDate)
  const usingDetected = collectedAt === detectedDate

  const [rows, setRows] = useState<Row[]>(initial)
  const [saving, setSaving] = useState(false)
  const suggestions = useMarkerSuggestions()

  // Reset the editable copy when a different file arrives (derived-state
  // pattern, no effect needed).
  const [seenInitial, setSeenInitial] = useState(initial)
  if (initial !== seenInitial) {
    setSeenInitial(initial)
    setRows(initial)
    setCollectedAt(detectedDate ?? fallbackDate)
  }

  const selected = rows.filter((r) => r.include)
  const allSelected = selected.length === rows.length && rows.length > 0
  const uncertain = rows.filter((r) => r.include && (r.confidence ?? 'low') !== 'high').length

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }
  function addRow() {
    setRows((prev) => [...prev, { id: nextId++, marker: '', value: NaN, unit: '', include: true, panel: 'Other', confidence: 'high' }])
  }

  async function commitImport() {
    if (saving) return
    const items: ExtractedMarker[] = rows
      .filter((r) => r.include && Number.isFinite(r.value) && r.marker.trim().length > 0)
      .map((r) => {
        // Canonicalise so "Alanine Aminotransferase" merges with existing "ALT" history.
        const canon = canonicalize(r.marker)
        return {
          marker: canon?.label ?? r.marker.trim(),
          value: r.value,
          unit: r.unit.trim(),
          low: r.low,
          high: r.high,
          rawValue: r.rawValue,
          flag: r.flag,
        }
      })
    if (items.length === 0) return
    setSaving(true)
    try {
      // Noon UTC so the chosen date survives every timezone.
      const iso = new Date(`${collectedAt}T12:00:00Z`).toISOString()
      await onImport(items, iso)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const num = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : v)
  const setNum = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s))

  // A panel header goes above the first row of each panel group.
  const withHeaders = rows.map((r, i) => ({ r, header: i === 0 || rows[i - 1].panel !== r.panel }))

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-h-[92dvh] gap-3 p-4 sm:max-w-xl sm:p-6">
        <DialogHeader className="gap-1">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name.replace(/\.(pdf|jpe?g|png|webp|heic|gif|bmp|tiff?)$/i, '')}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {rows.length} marker{rows.length === 1 ? '' : 's'} found · {selected.length} selected
            {uncertain > 0 && <> · <span className="text-amber-600 dark:text-amber-400">{uncertain} to check</span></>}
          </p>
        </DialogHeader>

        {ocr && (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-l-amber-500 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            <ScanText className="mt-0.5 size-3.5 shrink-0" />
            <span>{isImage ? 'Read from your photo with OCR.' : 'Read with OCR because this PDF has no text layer.'} Numbers can be misread, so compare each row against the report before importing.</span>
          </div>
        )}

        {duplicateWarning && (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-l-amber-500 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{duplicateWarning}</span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pdf-date" className="eyebrow">Collection date</Label>
            <Input id="pdf-date" type="date" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} className="h-8 w-40 text-sm" />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {usingDetected ? "Found in the report. Edit if it's wrong." : detectedDate ? 'Set by you.' : "Not found in the report, so today's date is filled in."}
          </span>
        </div>

        <datalist id="marker-suggestions">
          {(suggestions ?? []).map((s) => <option key={s} value={s} />)}
        </datalist>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">
              No known lab markers were found in this file. You can add them by hand below.
            </p>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-3.5" /> Add a marker
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" onClick={() => setRows((prev) => prev.map((r) => ({ ...r, include: !allSelected })))}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
              <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> clean</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> glance</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-destructive" /> check</span>
              </span>
            </div>

            <ScrollArea className="-mx-1 max-h-[44dvh] px-1">
              <ul className="flex flex-col">
                {withHeaders.map(({ r, header }) => {
                  const conf = r.confidence ?? 'low'
                  return (
                    <li key={r.id} className={cn('flex flex-col gap-1.5 border-b py-2.5 last:border-b-0', !r.include && 'opacity-45')}>
                      {header && <p className="eyebrow -mb-0.5 pt-1 text-[10px]">{r.panel}</p>}
                      <div className="flex items-center gap-2">
                        <Checkbox checked={r.include} onCheckedChange={(v) => updateRow(r.id, { include: v === true })} aria-label="Include this row" />
                        <span className={cn('size-2 shrink-0 rounded-full', CONF_DOT[conf])} title={CONF_TITLE[conf]} aria-label={CONF_TITLE[conf]} />
                        <Input
                          type="text"
                          className="h-8 min-w-0 flex-1 text-xs font-medium"
                          value={r.marker}
                          onChange={(e) => updateRow(r.id, { marker: e.target.value })}
                          list="marker-suggestions"
                          placeholder="Marker name"
                          aria-label="Marker name"
                        />
                        {r.flag && (
                          <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold', r.flag === 'H' ? 'bg-destructive/12 text-destructive' : 'bg-blue-500/12 text-blue-600 dark:text-blue-400')} title={r.flag === 'H' ? 'Flagged high by the lab' : 'Flagged low by the lab'}>
                            {r.flag}
                          </span>
                        )}
                        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeRow(r.id)} aria-label={`Remove ${r.marker || 'row'}`} title="Remove row">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[1.2fr_1.1fr_1fr_1fr] gap-1.5 pl-6">
                        <Input type="number" step="any" inputMode="decimal" className="h-8 font-mono text-xs tabular-nums" value={num(r.value)} onChange={(e) => updateRow(r.id, { value: Number(e.target.value), rawValue: undefined })} placeholder="value" aria-label={`${r.marker || 'marker'} value`} />
                        <Input type="text" className="h-8 font-mono text-xs" value={r.unit} onChange={(e) => updateRow(r.id, { unit: e.target.value })} placeholder="unit" aria-label={`${r.marker || 'marker'} unit`} />
                        <Input type="number" step="any" inputMode="decimal" className="h-8 font-mono text-xs tabular-nums" value={num(r.low)} onChange={(e) => updateRow(r.id, { low: setNum(e.target.value) })} placeholder="low" aria-label={`${r.marker || 'marker'} range low`} />
                        <Input type="number" step="any" inputMode="decimal" className="h-8 font-mono text-xs tabular-nums" value={num(r.high)} onChange={(e) => updateRow(r.id, { high: setNum(e.target.value) })} placeholder="high" aria-label={`${r.marker || 'marker'} range high`} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </ScrollArea>

            <Button variant="outline" size="sm" className="self-start" onClick={addRow}>
              <Plus className="size-3.5" /> Add a marker
            </Button>

            <DialogFooter className="gap-2 border-t pt-3 sm:gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={commitImport} disabled={selected.length === 0 || saving}>
                <Check className="size-4" /> {saving ? 'Importing…' : `Import ${selected.length} marker${selected.length === 1 ? '' : 's'}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
