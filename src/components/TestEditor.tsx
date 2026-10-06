// The one editor for a blood test: checking an imported PDF or photo ('file'),
// typing results in ('manual'), confirming a /read result after sign-up
// ('read') and editing a saved test ('edit'). The draw date is required and
// the saved name is never the file name.

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, ScanText, Trash2, TriangleAlert } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ExamMeta, type HealthFile } from '../lib/db'
import { extractMarkersFromText, wasOcr } from '../lib/pdf'
import { dateFromFileName, dayOf, extractCollectionDate, fmtDay } from '../lib/dates'
import { allMarkerMeta, canonicalize, SECTION_ORDER } from '../lib/markers'
import { UK_UNIT } from '../lib/labUnits'
import { labFlag } from '../lib/labRules'
import { canonicalKey, defaultTestName, detectProvider, findSameDraw, parseEntry, parseRange, splitNewRows, type DateSource, type LabTest } from '../lib/labTests'
import { saveTest, type Draft, type DraftRow, type SaveTarget } from '../lib/bloodTestsDb'
import { useBloodTests } from '../lib/useBloodTests'
import { clearPendingRead, type PendingRead } from '../lib/pendingRead'
import { useToast } from '../lib/toast'
import { printedValue } from '../views/bloods/feed'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type EditorOpen =
  | { mode: 'file'; fileId: number }
  | { mode: 'manual' }
  | { mode: 'read'; pending: PendingRead }
  | { mode: 'edit'; examId: number }

const LABS = ['Lola', 'Medichecks', 'e-Val', 'Randox', 'Thriva', 'Forth', 'Bluecrest', 'London Medical Laboratory', 'NHS']
const CONDITIONS = ['Hard training', 'Alcohol', 'Unwell', 'Gave blood in last 8 weeks', 'Cycling or sex in last 48 h']
const MARKER_LABELS = [...new Set(allMarkerMeta().map((m) => m.label))].sort()

type Fasted = 'yes' | 'no' | 'unsure'
type Row = {
  key: number
  resultId?: number
  marker: string
  value: string
  unit: string
  low: string
  high: string
  flag?: 'H' | 'L'
  check?: boolean
  /** A stored row's value as first shown, so an untouched "Negative" still saves. */
  orig?: string
}
type Form = {
  date: string
  dateSource?: DateSource
  lab: string
  name: string
  drawTime: string
  fasted: Fasted
  conditions: string[]
  notes: string
}
type Init = { form: Form; rows: Row[]; source: Draft['source']; fromFile?: string; ocr?: string; fileId?: number }

let nextKey = 1
const str = (v?: number) => (v === undefined || Number.isNaN(v) ? '' : String(v))
const blankRow = (): Row => ({ key: nextKey++, marker: '', value: '', unit: '', low: '', high: '' })
const stripExt = (s: string) => s.replace(/\.(csv|tsv|xlsx|pdf|jpe?g|png|webp|heic|gif|bmp|tiff?)$/i, '')
const sectionRank = new Map(SECTION_ORDER.map((s, i) => [s, i]))
// A stored value as printed, minus a glued-on range ("0.51 (0.40-0.50)" -> "0.51").
const seedValue = (x: { rawValue: string; value?: number }) => {
  const p = printedValue(x)
  return parseEntry(p).value !== undefined || x.value === undefined ? p : str(x.value)
}
// An edit-mode row whose value was not touched saves as it is, number or not.
const untouched = (r: Row) => r.resultId !== undefined && r.value === r.orig

const EMPTY_FORM: Form = { date: '', lab: '', name: '', drawTime: '', fasted: 'unsure', conditions: [], notes: '' }

function initFrom(open: EditorOpen, file: HealthFile | undefined, test: LabTest | undefined): Init {
  if (open.mode === 'file' && file) {
    const text = file.extractedText ?? ''
    const found = text ? extractCollectionDate(text) : undefined
    const fromName = found ? undefined : dateFromFileName(file.name)
    const rows = (text ? extractMarkersFromText(text) : [])
      .map((m) => ({
        key: nextKey++, marker: m.marker, value: m.rawValue ?? str(m.value), unit: m.unit, low: str(m.low), high: str(m.high),
        flag: m.flag, check: (m.confidence ?? 'low') !== 'high',
      }))
      // Grouped by section once, at load, so rows stay put while being edited.
      .sort((a, b) => (sectionRank.get(canonicalKey(a.marker, a.unit).section) ?? 99) - (sectionRank.get(canonicalKey(b.marker, b.unit).section) ?? 99))
    const isImage = file.type.startsWith('image/')
    return {
      form: { ...EMPTY_FORM, date: found?.date ?? fromName ?? '', dateSource: found?.source ?? (fromName ? 'filename' : undefined), lab: detectProvider(text, file.name) ?? '' },
      rows: rows.length ? rows : [blankRow()],
      source: isImage ? 'photo' : 'pdf',
      fromFile: file.name,
      ocr: wasOcr(text) ? (isImage ? 'Read from your photo with OCR.' : 'Read with OCR because this PDF has no text layer.') : undefined,
      fileId: file.id,
    }
  }
  if (open.mode === 'read') {
    const p = open.pending
    const date = p.exam.collectedAt ? dayOf(p.exam.collectedAt) : ''
    return {
      form: { ...EMPTY_FORM, date, dateSource: date ? p.exam.meta?.dateSource : undefined, lab: p.exam.company ?? '' },
      rows: p.results.map((r) => ({
        key: nextKey++, marker: r.marker, value: r.rawValue || str(r.value), unit: r.unit ?? '', low: str(r.low), high: str(r.high),
        flag: r.status === 'H' || r.status === 'L' ? r.status : undefined,
      })),
      source: 'read',
      fromFile: p.exam.name,
    }
  }
  if (open.mode === 'edit' && test) {
    const e = test.exam
    const m = e.meta
    return {
      form: {
        date: dayOf(e.collectedAt),
        dateSource: m?.dateSource,
        lab: e.company ?? test.provider ?? '',
        // The default name stays empty so a new lab renames it.
        name: test.title === defaultTestName(test.provider) ? '' : test.title,
        drawTime: m?.drawTime ?? '',
        fasted: m?.fasted === true ? 'yes' : m?.fasted === false ? 'no' : 'unsure',
        conditions: m?.conditions ?? [],
        notes: e.notes ?? '',
      },
      rows: test.markers.map((x) => {
        const value = seedValue(x)
        return {
          key: nextKey++, resultId: x.resultId, marker: x.printedName, value, orig: value, unit: x.unit, low: str(x.low), high: str(x.high),
          flag: x.labFlag === 'high' ? 'H' : x.labFlag === 'low' ? 'L' : undefined,
        }
      }),
      source: 'manual',
    }
  }
  return { form: EMPTY_FORM, rows: [blankRow(), blankRow(), blankRow()], source: 'manual' }
}

const DATE_HINT: Partial<Record<DateSource | 'none', string>> = {
  report: 'Found next to the collection date in the report.',
  'report-date': 'This is the report date. The draw is usually a day or two earlier.',
  filename: 'Taken from the file name. Check it.',
  'import-time': 'This was the day of the import, not the draw. Check it against the report.',
  none: 'We could not find the draw date. Check the report.',
}

/** Loads what the chosen mode needs, then mounts the form once. */
export function TestEditor({ open, onClose, onOpenTest }: { open: EditorOpen; onClose: () => void; onOpenTest: (id: number) => void }) {
  const tests = useBloodTests()
  const fileId = open.mode === 'file' ? open.fileId : 0
  // undefined while loading, null when the file is gone.
  const file = useLiveQuery(async () => (fileId ? (await db.files.get(fileId)) ?? null : null), [fileId])
  if (!tests || (open.mode === 'file' && !file)) return null
  const test = open.mode === 'edit' ? tests.find((t) => t.id === open.examId) : undefined
  if (open.mode === 'edit' && !test) return null
  return <EditorForm open={open} file={file ?? undefined} test={test} tests={tests} onClose={onClose} onOpenTest={onOpenTest} />
}

function EditorForm({ open, file, test, tests, onClose, onOpenTest }: {
  open: EditorOpen
  file?: HealthFile
  test?: LabTest
  tests: LabTest[]
  onClose: () => void
  onOpenTest: (id: number) => void
}) {
  const { showToast } = useToast()
  const [init] = useState(() => initFrom(open, file, test))
  const [form, setForm] = useState<Form>(init.form)
  const [rows, setRows] = useState<Row[]>(init.rows)
  const [removed, setRemoved] = useState<number[]>([])
  const [detailsOpen, setDetailsOpen] = useState(!!(form.drawTime || form.conditions.length || form.notes || form.fasted !== 'unsure'))
  const [dupDismissed, setDupDismissed] = useState(false)
  const [choice, setChoice] = useState<{ target: number; value: 'add' | 'separate' }>()
  const [saving, setSaving] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  // The row "Add a marker" just added, focused once when its Marker box mounts.
  const focusKey = useRef<number | undefined>(undefined)
  const mode = open.mode
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const lab = form.lab.trim()

  // Rows as they would be saved. Blank rows are ignored; half-filled ones block saving.
  const parsed = useMemo(() => rows
    .filter((r) => r.marker.trim() || r.value.trim())
    .map((r) => {
      const { value } = parseEntry(r.value)
      const { low, high } = parseRange(r.low, r.high)
      const f = labFlag(value, low, high, r.flag)
      const row: DraftRow = {
        resultId: r.resultId, marker: r.marker.trim(), value, rawValue: r.value.trim(), unit: r.unit.trim(), low, high,
        status: f === 'high' ? 'H' : f === 'low' ? 'L' : undefined,
      }
      return { row, ok: !!row.marker && (value !== undefined || untouched(r)) }
    }), [rows])
  const valid = useMemo(() => parsed.filter((p) => p.ok).map((p) => p.row), [parsed])
  const invalid = parsed.length - valid.length

  // Live duplicate and same-draw check, against every other test.
  const same = useMemo(() => {
    if (mode === 'edit' || !form.date) return undefined
    return findSameDraw({ date: form.date, provider: lab || undefined, rows: valid.map((r) => ({ marker: r.marker, unit: r.unit, value: r.value! })) }, tests)
  }, [mode, form.date, lab, valid, tests])
  const dupTest = same?.duplicateOf !== undefined ? tests.find((t) => t.id === same.duplicateOf) : undefined
  const sameTest = same?.sameDrawAs !== undefined ? tests.find((t) => t.id === same.sameDrawAs) : undefined
  const addTo = sameTest && (choice?.target === sameTest.id ? choice.value : lab && lab === sameTest.provider ? 'add' : 'separate') === 'add' ? sameTest : undefined
  const split = useMemo(() => (addTo
    ? splitNewRows(valid, addTo.markers.map((m) => ({ marker: m.printedName, unit: m.unit, value: m.value, high: m.high })))
    : { add: valid, skipped: 0 }), [addTo, valid])
  // The same-draw question shows once the duplicate banner is gone; the skip notes refer to it.
  const showSame = !!sameTest && (!dupTest || dupDismissed)
  const skipKeys = useMemo(() => new Set(showSame ? addTo?.markers.map((m) => m.key) : undefined), [addTo, showSame])

  const verb = mode === 'manual' || mode === 'edit' ? 'save' : 'import'
  const blocked = !form.date ? `Add the draw date to ${verb}`
    : invalid ? `Fix ${invalid} row${invalid === 1 ? '' : 's'} to ${verb}`
      : valid.length === 0 ? `Add a marker to ${verb}`
        : dupTest && !dupDismissed ? `Open it, or ${verb} anyway`
          : addTo && split.add.length === 0 ? 'Nothing new to add'
            : undefined
  const n = addTo ? split.add.length : valid.length
  const label = blocked ?? (mode === 'edit' ? 'Save changes'
    : addTo ? `Add ${n} to the ${fmtDay(addTo.date)} test`
      : `${verb === 'save' ? 'Save' : 'Import'} ${n} marker${n === 1 ? '' : 's'}`)

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function removeRow(r: Row) {
    setRows((prev) => prev.filter((x) => x.key !== r.key))
    if (r.resultId !== undefined) setRemoved((prev) => [...prev, r.resultId!])
  }
  // A known marker typed in with no unit gets the unit UK labs print.
  function fillUnit(r: Row) {
    if (mode !== 'manual' || r.unit.trim()) return
    const key = canonicalize(r.marker)?.key
    if (key && UK_UNIT[key]) updateRow(r.key, { unit: UK_UNIT[key] })
  }

  async function save() {
    if (blocked || saving) return
    setSaving(true)
    // Saving an edit confirms a date that was never confirmed.
    const dateSource: DateSource | undefined = mode === 'edit' && (!form.dateSource || form.dateSource === 'import-time') ? 'user' : form.dateSource
    const meta: ExamMeta = {
      dateSource,
      drawTime: form.drawTime || undefined,
      fasted: form.fasted === 'yes' ? true : form.fasted === 'no' ? false : null,
      conditions: form.conditions.length ? form.conditions : undefined,
    }
    const draft: Draft = {
      date: form.date,
      name: form.name.trim() || defaultTestName(lab || undefined),
      company: lab,
      notes: form.notes.trim(),
      meta,
      rows: addTo ? split.add : valid,
      source: init.source,
      sourceFileId: init.fileId,
    }
    const target: SaveTarget = mode === 'edit' ? { kind: 'edit', examId: test!.id, removed } : addTo ? { kind: 'add', examId: addTo.id } : { kind: 'new' }
    try {
      const saved = await saveTest(draft, target)
      if (mode === 'read') clearPendingRead()
      onClose()
      onOpenTest(saved.examId)
      const count = (k: number) => `${k} marker${k === 1 ? '' : 's'}`
      showToast({
        message: target.kind === 'edit' ? 'Test saved.'
          : target.kind === 'add' ? `Added ${count(saved.added)} to the ${fmtDay(addTo!.date)} test.${saved.skipped ? ` ${saved.skipped} already in it, skipped.` : ''}`
            : `${verb === 'save' ? 'Saved' : 'Imported'} ${count(saved.added)}.`,
        action: { label: 'Undo', onClick: () => saved.undo().catch(() => showToast({ tone: 'error', message: 'Could not undo.' })) },
      })
    } catch (err) {
      console.error('Saving the test failed', err)
      showToast({ tone: 'error', message: 'Could not save this test. Try again.' })
      setSaving(false)
    }
  }

  function openDuplicate(id: number) {
    // A duplicate report is not waiting for review any more.
    if (init.fileId !== undefined) void db.files.update(init.fileId, { status: 'Stored' })
    // The read is already on file as that test.
    if (mode === 'read') clearPendingRead()
    onClose()
    onOpenTest(id)
  }

  const title = mode === 'file' ? 'Check the import' : mode === 'read' ? 'Save your read' : mode === 'edit' ? 'Edit test' : 'Type results in'
  const unconfirmed = mode === 'edit' && !!test?.needsCheck.includes('Draw date not confirmed') && form.dateSource !== 'user'
  const hint = !form.date ? (mode === 'manual' ? 'The day the blood was taken.' : DATE_HINT.none)
    : unconfirmed ? 'Check this date against the report. Saving confirms it.'
      : form.dateSource ? DATE_HINT[form.dateSource] : undefined
  const toCheck = rows.filter((r) => r.check).length
  const labUnknown = (mode === 'file' || mode === 'read') && !init.form.lab && !lab
  // State starts as init.form / init.rows and every setter makes a new object, so references tell.
  const dirty = removed.length > 0 || form !== init.form || rows !== init.rows
  const requestClose = () => { if (!saving && (!dirty || confirm('Discard these results?'))) onClose() }
  const details = [form.fasted === 'yes' ? 'Fasted' : form.fasted === 'no' ? 'Not fasted' : '', form.drawTime, ...form.conditions].filter(Boolean).join(' · ')

  return (
    <Dialog open onOpenChange={(o) => { if (!o) requestClose() }}>
      <DialogContent
        ref={contentRef}
        // A stray tap beside the sheet should never discard typed results.
        onInteractOutside={(e) => e.preventDefault()}
        // Focus the dialog, not the date field: on a phone that would open the picker at once.
        onOpenAutoFocus={(e) => { e.preventDefault(); contentRef.current?.focus() }}
        className="flex max-h-[92dvh] flex-col gap-4 overflow-y-auto p-4 pb-0 sm:max-w-2xl sm:p-6 sm:pb-0"
      >
        <DialogHeader className="gap-1 pr-8 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'file' || mode === 'read'
              ? <>{init.rows.filter((r) => r.marker).length} markers found. Check them against the report.{toCheck > 0 && ` ${toCheck} to look at closely.`}</>
              : mode === 'edit' ? 'Fix a value, the date or the lab. Removed rows go to the archive.'
                : 'One test is one blood draw. Add every marker from the report.'}
          </DialogDescription>
        </DialogHeader>

        {init.ocr && (
          <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <ScanText className="mt-0.5 size-3.5 shrink-0" />
            <span>{init.ocr} Numbers can be misread, so compare each row with the report.</span>
          </p>
        )}

        {/* About this test */}
        <section className="flex flex-col gap-3" aria-label="About this test">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="te-date">Draw date</Label>
              <Input
                id="te-date"
                type="date"
                required
                className="h-10"
                max={dayOf(new Date().toISOString())}
                value={form.date}
                aria-describedby="te-date-hint"
                onChange={(e) => set({ date: e.target.value, dateSource: 'user' })}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="te-lab">Lab</Label>
              <Input id="te-lab" className="h-10" list="te-labs" value={form.lab} placeholder="Pick or type" autoComplete="off" aria-describedby={labUnknown ? 'te-lab-hint' : undefined} onChange={(e) => set({ lab: e.target.value })} />
              <datalist id="te-labs">{LABS.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
          </div>
          {hint && <p id="te-date-hint" className={cn('-mt-1 text-xs', form.date || mode === 'manual' ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>{hint}</p>}
          {labUnknown && <p id="te-lab-hint" className="-mt-1 text-xs text-muted-foreground">We could not tell which lab this is.</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="te-name">Test name <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="te-name" className="h-10" value={form.name} placeholder={defaultTestName(lab || undefined)} onChange={(e) => set({ name: e.target.value })} />
          </div>
          {init.fromFile && <p className="truncate text-xs text-muted-foreground">From file: {stripExt(init.fromFile)}</p>}

          <div>
            <button
              type="button"
              className="-mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 text-left text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen(!detailsOpen)}
            >
              {detailsOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
              Draw details
              {!detailsOpen && details && <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{details}</span>}
            </button>
            {detailsOpen && (
              <div className="mt-2 flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="te-time">Time</Label>
                    <Input id="te-time" type="time" className="h-10" value={form.drawTime} onChange={(e) => set({ drawTime: e.target.value })} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-sm font-medium leading-none" id="te-fasted">Fasted</span>
                    <Segmented
                      value={form.fasted}
                      onChange={(v) => set({ fasted: v })}
                      ariaLabel="Fasted"
                      className="w-full [&>button]:min-h-10"
                      options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }]}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium leading-none">Before the draw</span>
                  <div className="flex flex-wrap gap-2">
                    {CONDITIONS.map((c) => {
                      const on = form.conditions.includes(c)
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ conditions: on ? form.conditions.filter((x) => x !== c) : [...form.conditions, c] })}
                          className={cn(
                            'min-h-10 rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            on ? 'border-foreground/40 bg-secondary text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {c}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="te-notes">Notes</Label>
                  <textarea
                    id="te-notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                    className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {dupTest && !dupDismissed && (
          <div role="alert" className="flex flex-col gap-2 rounded-md bg-amber-500/12 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>This looks like your {dupTest.provider ? `${dupTest.provider} ` : ''}test from {fmtDay(dupTest.date)} ({same!.matched} of {same!.overlap} values match).</span>
            </p>
            <div className="flex gap-2 pl-6">
              <Button variant="outline" className="h-10" onClick={() => openDuplicate(dupTest.id)}>Open it</Button>
              <Button
                variant="ghost"
                className="h-10"
                // Nothing new for the duplicate itself: go straight to importing as a separate test.
                onClick={() => { setDupDismissed(true); if (addTo?.id === dupTest.id && split.add.length === 0) setChoice({ target: dupTest.id, value: 'separate' }) }}
              >
                {verb === 'save' ? 'Save' : 'Import'} anyway
              </Button>
            </div>
          </div>
        )}

        {showSame && sameTest && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              You have a {sameTest.provider ? `${sameTest.provider} ` : ''}test from {fmtDay(sameTest.date)}. Is this the same blood draw?
            </p>
            <Segmented
              value={addTo ? 'add' : 'separate'}
              onChange={(v) => setChoice({ target: sameTest.id, value: v })}
              ariaLabel="Same blood draw"
              className="w-full [&>button]:min-h-10 [&>button]:leading-tight"
              options={[{ value: 'add', label: `Add to the ${fmtDay(sameTest.date)} test` }, { value: 'separate', label: 'Keep as a separate test' }]}
            />
            {addTo && split.skipped > 0 && <p className="text-xs text-muted-foreground">{split.skipped} already in that test, skipped.</p>}
          </div>
        )}

        {/* Rows. Phones get two lines per row: the marker, then its numbers. */}
        <section aria-label="Results" className="flex flex-col">
          <div className="sticky -top-4 z-10 -mx-4 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-x-1.5 border-b bg-card px-4 py-1.5 sm:-top-6 sm:-mx-6 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_2.5rem] sm:px-6" aria-hidden="true">
            {['Marker', 'Value', 'Unit', 'Low', 'High'].map((h, i) => (
              <span key={h} className={cn('eyebrow text-[12px]', i === 0 && 'col-span-4 sm:col-span-1')}>{h}</span>
            ))}
          </div>
          <datalist id="te-markers">{MARKER_LABELS.map((l) => <option key={l} value={l} />)}</datalist>
          <ul className="flex flex-col">
            {rows.map((r) => {
              const p = parseEntry(r.value)
              const filled = !!(r.marker.trim() || r.value.trim())
              const bad = filled && ((p.value === undefined && !untouched(r)) || !r.marker.trim())
              const name = r.marker || 'marker'
              const skip = !!r.marker.trim() && skipKeys.has(canonicalKey(r.marker, r.unit).key)
              const checkId = r.check ? `te-chk-${r.key}` : undefined
              const typing = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false } as const
              return (
                <li
                  key={r.key}
                  className={cn('grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-1.5 border-b py-2 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_2.5rem]', r.check && '-ml-2.5 border-l-2 border-l-amber-500/70 pl-2')}
                >
                  <Input
                    ref={(el) => { if (el && focusKey.current === r.key) { focusKey.current = undefined; el.focus() } }}
                    className="col-span-3 h-10 sm:col-span-1"
                    value={r.marker}
                    list="te-markers"
                    placeholder="Marker"
                    aria-label="Marker"
                    aria-invalid={!!r.value.trim() && !r.marker.trim()}
                    aria-describedby={checkId}
                    onChange={(e) => updateRow(r.key, { marker: e.target.value })}
                    onBlur={() => fillUnit(r)}
                  />
                  <Input className="h-10 px-1.5 font-mono tabular-nums" {...typing} value={r.value} placeholder="Value" aria-label={`${name} value`} aria-invalid={bad} aria-describedby={checkId} onChange={(e) => updateRow(r.key, { value: e.target.value })} />
                  <Input className="h-10 px-2 font-mono" value={r.unit} placeholder="Unit" aria-label={`${name} unit`} onChange={(e) => updateRow(r.key, { unit: e.target.value })} />
                  <Input className="h-10 px-1.5 font-mono tabular-nums" {...typing} value={r.low} placeholder="Low" aria-label={`${name} range low`} onChange={(e) => updateRow(r.key, { low: e.target.value })} />
                  <Input className="h-10 px-1.5 font-mono tabular-nums" {...typing} value={r.high} placeholder="High" aria-label={`${name} range high`} onChange={(e) => updateRow(r.key, { high: e.target.value })} />
                  {/* After High for tab order; phones pin it beside the marker. */}
                  <Button variant="ghost" size="icon" className="size-10 justify-self-end text-muted-foreground hover:text-destructive max-sm:col-start-4 max-sm:row-start-1" onClick={() => removeRow(r)} aria-label={`Remove ${name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                  {r.check && <p id={checkId} className="col-span-4 text-xs text-muted-foreground sm:col-span-6">Check this one against the report.</p>}
                  {skip && <p className="col-span-4 text-xs text-muted-foreground sm:col-span-6">Already in that test, skipped.</p>}
                </li>
              )
            })}
          </ul>
          <Button variant="outline" className="mt-2 h-10 self-start" onClick={() => { const row = blankRow(); focusKey.current = row.key; setRows((prev) => [...prev, row]) }}>
            <Plus className="size-4" /> Add a marker
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">A value like &lt;0.5 is kept as printed. Type &lt;5 in a range box for an upper limit only.</p>
        </section>

        <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex flex-col-reverse gap-2 border-t bg-card px-4 py-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="outline" className="h-10" onClick={requestClose} disabled={saving}>Cancel</Button>
          <Button className="h-10" onClick={() => void save()} disabled={!!blocked || saving}>
            {saving ? 'Saving…' : label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
