import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
  Edit2, FileText, FlaskConical, Plus, Trash2, X,
} from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis, ReferenceLine } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'
import { extractMarkersFromText } from '../lib/pdf'
import { useUndoableDelete } from '../lib/useUndoableDelete'
import { type EnrichedResult } from '../lib/insights'
import { canonicalize, metaForKey, PANEL_ORDER, type LabPanel } from '../lib/markers'
import { LabComposites } from '../components/LabComposites'
import { DashGrid, StatRow } from '../components/dashboard/Grid'
import { StatCard } from '../components/dashboard/StatCard'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type MarkerEntry = {
  resultId?: number
  examId: number
  examName: string
  date: string           // ISO string
  value: number | undefined
  rawValue: string
  unit?: string
  low?: number
  high?: number
}

type MarkerSummary = {
  key: string
  label: string
  panel: LabPanel
  unit?: string
  low?: number
  high?: number
  entries: MarkerEntry[]  // all exams, newest first
}

// ── Range helpers ─────────────────────────────────────────────────────────────

function rangeStatus(v: number | undefined, low?: number, high?: number): 'good' | 'warn' | 'none' {
  if (v === undefined) return 'none'
  // Without ANY reference range we can't claim in/out of range.
  if (low === undefined && high === undefined) return 'none'
  if (low !== undefined && v < low) return 'warn'
  if (high !== undefined && v > high) return 'warn'
  return 'good'
}

// 0–1 position within [low, high]; synthesises a band for single-bounded
// ranges ("< 5" → 0..5, "> 1" → 1..2) so the dot still renders sensibly.
function rangePos(v: number, low?: number, high?: number): number | null {
  if (low === undefined && high === undefined) return null
  let lo = low
  let hi = high
  if (lo === undefined && hi !== undefined) {
    lo = hi >= 0 ? 0 : hi * 2
  } else if (hi === undefined && lo !== undefined) {
    hi = lo > 0 ? lo * 2 : lo / 2
  }
  if (lo === undefined || hi === undefined) return null
  const range = hi - lo
  if (range <= 0) return null
  return Math.max(0, Math.min(1, (v - lo) / range))
}

// ── Marker row — portfolio-statement style line item ─────────────────────
function MarkerRow({
  summary,
  selected,
  onClick,
}: {
  summary: MarkerSummary
  selected: boolean
  onClick: () => void
}) {
  const latest = summary.entries[0]
  const prev   = summary.entries[1]
  const val    = latest?.value
  const status = rangeStatus(val, latest?.low, latest?.high)
  const pos    = val !== undefined ? rangePos(val, latest?.low, latest?.high) : null
  const delta  = val !== undefined && prev?.value !== undefined ? val - prev.value : undefined

  const badgeLabel =
    status === 'good' ? 'OK'
    : status === 'warn' && latest?.high !== undefined && val !== undefined && val > latest.high ? 'HIGH'
    : status === 'warn' ? 'LOW'
    : null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${summary.label}: ${latest?.rawValue ?? '—'}${summary.unit ? ' ' + summary.unit : ''}`}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1.4fr)_minmax(110px,auto)_minmax(110px,1fr)_52px_64px_16px] items-center gap-3.5 border-b py-3 text-left transition-colors last:border-b-0 hover:bg-accent/50',
        'max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1.5',
        selected && 'bg-accent/50',
      )}
    >
      <span className="truncate text-sm font-medium">{summary.label}</span>

      <span className="flex items-baseline gap-1.5 tabular-nums">
        <span className="font-mono text-[15px] font-medium">{val !== undefined ? (latest.rawValue || String(val)) : '—'}</span>
        {summary.unit && val !== undefined && <span className="text-[11px] text-muted-foreground">{summary.unit}</span>}
        {delta !== undefined && Math.abs(delta) > 0.05 && (
          <span className="ml-1 inline-flex items-center text-[11px] font-semibold text-muted-foreground">
            {delta > 0 ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
          </span>
        )}
      </span>

      <span aria-hidden="true" className="max-md:col-span-2 max-md:order-3">
        {pos !== null ? (
          <span className="relative block h-1.5 rounded-full bg-secondary">
            <span className="absolute inset-y-0 left-0 rounded-full bg-primary/55" style={{ width: `${pos * 100}%` }} />
            <span
              className={cn(
                'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-sm',
                status === 'warn' ? 'bg-destructive' : 'bg-foreground',
              )}
              style={{ left: `${pos * 100}%` }}
            />
          </span>
        ) : (
          <span className="block h-1.5 rounded-full bg-secondary/60" />
        )}
      </span>

      <span className="flex justify-center max-md:order-4 max-md:justify-start">
        {badgeLabel && (
          <Badge
            variant="secondary"
            className={cn(
              'px-2 text-[10px] font-bold tracking-wide',
              status === 'good' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/12 text-destructive',
            )}
          >
            {badgeLabel}
          </Badge>
        )}
      </span>

      <span className="text-right text-[11px] tabular-nums text-muted-foreground max-md:order-5 max-md:text-left">
        {latest ? format(parseISO(latest.date), 'MMM d, yy') : '—'}
      </span>

      <span aria-hidden="true" className="text-muted-foreground max-md:hidden">
        {selected ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </span>
    </button>
  )
}

// ── History pane (shown below a panel when a marker is selected) ──────────

const historyChartConfig = {
  value: { label: 'Value', color: 'var(--chart-1)' },
} satisfies ChartConfig

function MarkerHistoryPane({
  summary,
  onClose,
  onDelete,
  onEditTarget,
  hasPersonalTarget,
}: {
  summary: MarkerSummary
  onClose: () => void
  onDelete: (resultId: number) => void
  onEditTarget: () => void
  hasPersonalTarget: boolean
}) {
  const meta = metaForKey(summary.key)
  const chartData = [...summary.entries]
    .filter(e => e.value !== undefined)
    .reverse()
    .map(e => ({ date: format(parseISO(e.date), 'MMM d yy'), value: e.value }))

  const min = Math.min(...chartData.map(d => d.value!))
  const max = Math.max(...chartData.map(d => d.value!))
  const pad = (max - min) * 0.25 || 5
  const yMin = Math.max(0, Math.floor(min - pad))
  const yMax = Math.ceil(max + pad)

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{summary.panel} · all tests</p>
          <h3 className="flex items-baseline gap-2 font-display text-lg font-semibold">
            {summary.label}
            {summary.unit && <span className="text-sm font-normal text-muted-foreground">{summary.unit}</span>}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onEditTarget}>
            <Edit2 className="size-3" /> {hasPersonalTarget ? 'Edit range' : 'Set range'}
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {meta?.optimal?.note && (
        <p className="mb-3 text-xs text-muted-foreground">{meta.optimal.note}</p>
      )}

      {chartData.length > 1 ? (
        <ChartContainer config={historyChartConfig} className="h-[170px] w-full">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis domain={[yMin, yMax]} tickLine={false} axisLine={false} width={36} tick={{ fontSize: 10 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {summary.low !== undefined && (
              <ReferenceLine y={summary.low} stroke="#c5821e" strokeDasharray="3 3" strokeWidth={1} />
            )}
            {summary.high !== undefined && (
              <ReferenceLine y={summary.high} stroke="#c5821e" strokeDasharray="3 3" strokeWidth={1} />
            )}
            <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ChartContainer>
      ) : (
        <p className="text-xs text-muted-foreground">Need at least 2 tests to show a trend.</p>
      )}

      <div className="mt-3 flex flex-col">
        {summary.entries.map((entry, i) => {
          const status = rangeStatus(entry.value, summary.low, summary.high)
          const nextEntry = summary.entries[i + 1]
          const delta = entry.value !== undefined && nextEntry?.value !== undefined
            ? entry.value - nextEntry.value
            : undefined
          return (
            <div
              key={entry.resultId ?? i}
              className={cn('group flex items-center gap-3 border-t py-2.5 first:border-t-0', status === 'warn' && 'rounded-sm bg-destructive/4 px-1.5')}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{format(parseISO(entry.date), 'MMM d, yyyy')}</p>
                <p className="truncate text-[11px] text-muted-foreground">{entry.examName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('font-mono text-sm font-medium tabular-nums', status === 'warn' && 'text-destructive')}>
                  {entry.rawValue}
                  {entry.unit && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{entry.unit}</span>}
                </span>
                {delta !== undefined && Math.abs(delta) > 0.05 && (
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
                  </span>
                )}
                {status !== 'none' && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'px-1.5 text-[10px] font-bold',
                      status === 'good' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/12 text-destructive',
                    )}
                  >
                    {status === 'good' ? 'OK' : entry.value !== undefined && summary.high !== undefined && entry.value > summary.high ? 'HIGH' : 'LOW'}
                  </Badge>
                )}
                {entry.resultId !== undefined && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground opacity-40 hover:text-destructive group-hover:opacity-100"
                    title="Delete this result"
                    aria-label="Delete result"
                    onClick={() => onDelete(entry.resultId!)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Labs component ────────────────────────────────────────────────────────

export function Labs({
  exams,
  results,
  files,
  addOpen,
  onAddClose,
  onReviewFile,
  compounds: _c,
  injections: _i,
  vitals: _v,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  files: Array<{ id?: number; name: string; status: string; extractedText?: string }>
  addOpen?: boolean
  onAddClose?: () => void
  onReviewFile?: (id: number) => void
}) {
  const deleteWithUndo = useUndoableDelete()
  const markerTargets = useLiveQuery(() => db.markerTargets.toArray(), [], [])
  const targetByKey   = useMemo(() => new Map((markerTargets ?? []).map(t => [t.marker, t])), [markerTargets])

  // Build marker summaries from ALL exams (newest first per entry)
  const markersByPanel = useMemo<Map<LabPanel, MarkerSummary[]>>(() => {
    if (exams.length === 0) return new Map()

    const examById = new Map(exams.map(e => [e.id, e]))
    const keyOrder: string[] = []
    const summaryMap = new Map<string, MarkerSummary>()

    const sorted = [...results].sort((a, b) => {
      const ea = examById.get(a.examId)
      const eb = examById.get(b.examId)
      if (!ea || !eb) return 0
      return eb.collectedAt.localeCompare(ea.collectedAt)
    })

    for (const r of sorted) {
      const exam = examById.get(r.examId)
      if (!exam) continue
      const canon    = canonicalize(r.marker)
      const key      = canon?.key ?? r.marker.toLowerCase().trim()
      const personal = canon ? targetByKey.get(canon.key) : undefined

      // Confirmed range: lab-provided or user personal only — NEVER catalog.
      const confirmedLow  = personal?.low  ?? r.low
      const confirmedHigh = personal?.high ?? r.high

      const cleanRaw = r.rawValue
        ?.replace(/\s*[\[\(][0-9].*$/, '')
        ?.replace(/\s*;.*$/, '')
        ?.trim()

      if (!summaryMap.has(key)) {
        keyOrder.push(key)
        summaryMap.set(key, {
          key,
          label:   canon?.label ?? r.marker,
          panel:   canon?.panel ?? 'Other',
          // Row's actual lab unit wins; catalog only fills gaps.
          unit:    r.unit ?? canon?.unit,
          low:     confirmedLow,
          high:    confirmedHigh,
          entries: [],
        })
      }
      const summary = summaryMap.get(key)!
      const dupKey = `${exam.name}|${exam.collectedAt.slice(0, 10)}`
      if (summary.entries.some(e => `${e.examName}|${e.date.slice(0, 10)}` === dupKey)) continue

      summary.entries.push({
        resultId: r.id,
        examId:   r.examId,
        examName: exam.name,
        date:     exam.collectedAt,
        value:    r.value,
        rawValue: cleanRaw ?? r.rawValue,
        unit:     r.unit ?? canon?.unit,
        low:      confirmedLow,
        high:     confirmedHigh,
      })
    }

    const grouped = new Map<LabPanel, MarkerSummary[]>()
    for (const panel of PANEL_ORDER) grouped.set(panel, [])
    for (const key of keyOrder) {
      const s = summaryMap.get(key)!
      const list = grouped.get(s.panel) ?? []
      list.push(s)
      grouped.set(s.panel, list)
    }
    return grouped
  }, [exams, results, targetByKey])

  const hasData = exams.length > 0

  const [selectedKey,      setSelectedKey]      = useState<string | null>(null)
  const [showAddForm,      setShowAddForm]       = useState(false)
  const [collapsedPanels,  setCollapsedPanels]   = useState<Set<LabPanel>>(new Set())
  const [editingTargetKey, setEditingTargetKey]  = useState<string | null>(null)
  const [targetLow,        setTargetLow]         = useState('')
  const [targetHigh,       setTargetHigh]        = useState('')

  useEffect(() => { if (addOpen) { setShowAddForm(true); onAddClose?.() } }, [addOpen, onAddClose])

  function togglePanel(panel: LabPanel) {
    setCollapsedPanels(prev => {
      const next = new Set(prev)
      if (next.has(panel)) next.delete(panel)
      else next.add(panel)
      return next
    })
  }

  function openTargetEdit(key: string) {
    const ex = targetByKey.get(key)
    setTargetLow(ex?.low   !== undefined ? String(ex.low)  : '')
    setTargetHigh(ex?.high !== undefined ? String(ex.high) : '')
    setEditingTargetKey(key)
  }

  async function saveTarget(key: string, unit?: string) {
    const data = { marker: key, low: targetLow ? Number(targetLow) : undefined, high: targetHigh ? Number(targetHigh) : undefined, unit }
    const existing = targetByKey.get(key)
    if (existing?.id) await db.markerTargets.update(existing.id, data)
    else await db.markerTargets.add(data)
    setEditingTargetKey(null); setTargetLow(''); setTargetHigh('')
  }

  // Manual add
  const [examName, setExamName] = useState('Blood panel')
  const [marker,   setMarker]   = useState('Total Testosterone')
  const [value,    setValue]    = useState('')
  const [unit,     setUnit]     = useState('ng/dL')
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10))

  async function addManual() {
    const id = await db.exams.add({ name: examName || 'Blood panel', collectedAt: new Date(manualDate).toISOString(), labName: 'Manual entry' })
    await db.results.add({ examId: id, marker, value: Number(value), rawValue: value, unit })
    setValue('')
  }

  const latestFile = files.find(f => f.status === 'Needs review' && f.extractedText)
  const extractedCount = latestFile?.extractedText ? extractMarkersFromText(latestFile.extractedText).length : 0

  const selectedSummary = selectedKey
    ? [...markersByPanel.values()].flat().find(s => s.key === selectedKey)
    : null

  const allSummaries = useMemo(
    () => [...markersByPanel.values()].flat(),
    [markersByPanel],
  )
  const outOfRangeSummaries = useMemo(
    () => allSummaries.filter(s => rangeStatus(s.entries[0]?.value, s.entries[0]?.low, s.entries[0]?.high) === 'warn'),
    [allSummaries],
  )
  const inRangeCount = useMemo(
    () => allSummaries.filter(s => rangeStatus(s.entries[0]?.value, s.entries[0]?.low, s.entries[0]?.high) === 'good').length,
    [allSummaries],
  )
  const lastTestDate = useMemo(
    () => exams.length > 0 ? [...exams].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0]?.collectedAt : undefined,
    [exams],
  )

  return (
    <div className="flex flex-col gap-5">
      {/* ── PDF pending banner ── */}
      {latestFile && extractedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3">
          <FileText className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">PDF ready to review</p>
            <p className="truncate text-xs text-muted-foreground">
              {latestFile.name} · {extractedCount} marker{extractedCount === 1 ? '' : 's'} detected
            </p>
          </div>
          <Button size="sm" onClick={() => latestFile.id && onReviewFile?.(latestFile.id)}>
            Review markers
          </Button>
        </div>
      )}

      {/* ── KPI row ── */}
      {hasData && (
        <StatRow className="md:grid-cols-4 2xl:grid-cols-4">
          <StatCard icon={FlaskConical} label="Markers tracked" value={allSummaries.length} tone="primary" />
          <StatCard icon={CheckCircle2} label="In range" value={inRangeCount} tone="good" colorValue />
          <StatCard icon={AlertTriangle} label="Out of range" value={outOfRangeSummaries.length} tone={outOfRangeSummaries.length > 0 ? 'bad' : 'neutral'} colorValue={outOfRangeSummaries.length > 0} />
          <StatCard icon={CalendarDays} label="Last test" value={lastTestDate ? format(parseISO(lastTestDate), 'MMM d') : '—'} tone="info" />
        </StatRow>
      )}

      <DashGrid>
      {/* ── Health composites ── */}
      {hasData && (
        <div className="md:col-span-2 xl:col-span-3">
          <LabComposites results={results} exams={exams} />
        </div>
      )}

      {/* ── Needs attention ── */}
      {hasData && outOfRangeSummaries.length > 0 && (
        <PanelCard className="md:col-span-2 xl:col-span-3 border-l-2 border-l-destructive" title={`${outOfRangeSummaries.length} out of range`} subtitle="Needs attention">
          <div className="flex flex-col">
            {outOfRangeSummaries.map(s => (
              <MarkerRow
                key={`attn-${s.key}`}
                summary={s}
                selected={selectedKey === s.key}
                onClick={() => setSelectedKey(selectedKey === s.key ? null : s.key)}
              />
            ))}
          </div>
        </PanelCard>
      )}

      {/* ── No data ── */}
      {!hasData && (
        <PanelCard className="md:col-span-2 xl:col-span-6">
          <PanelEmpty icon={FlaskConical} title="No lab results yet" detail="Upload a PDF or add markers manually using the buttons in the top right." />
        </PanelCard>
      )}

      {/* ── All markers, grouped by panel ── */}
      {hasData && PANEL_ORDER.map(panel => {
        const summaries = markersByPanel.get(panel)
        if (!summaries || summaries.length === 0) return null
        const collapsed = collapsedPanels.has(panel)

        const outCount = summaries.filter(s => {
          const v = s.entries[0]?.value
          return rangeStatus(v, s.low, s.high) === 'warn'
        }).length

        const selectedInPanel = selectedSummary?.panel === panel

        return (
          <PanelCard key={panel} className="md:col-span-2 xl:col-span-6">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => togglePanel(panel)}
              aria-expanded={!collapsed}
            >
              {collapsed
                ? <ChevronRight className="size-3.5 text-muted-foreground" />
                : <ChevronDown className="size-3.5 text-muted-foreground" />}
              <h3 className="font-display text-lg font-semibold">{panel}</h3>
              <span className="text-[11px] text-muted-foreground">· {summaries.length} marker{summaries.length === 1 ? '' : 's'}</span>
              {outCount > 0 && (
                <Badge variant="secondary" className="bg-destructive/12 text-[10px] text-destructive">
                  {outCount} out of range
                </Badge>
              )}
            </button>

            {!collapsed && (
              <div className="mt-2 flex flex-col">
                {summaries.map(s => (
                  <MarkerRow
                    key={s.key}
                    summary={s}
                    selected={selectedKey === s.key}
                    onClick={() => setSelectedKey(selectedKey === s.key ? null : s.key)}
                  />
                ))}
              </div>
            )}

            {!collapsed && selectedInPanel && selectedSummary && (
              <div className="mt-4 border-t pt-4">
                <MarkerHistoryPane
                  summary={selectedSummary}
                  onClose={() => setSelectedKey(null)}
                  onDelete={async (id) => {
                    const snapshot = await db.results.get(id)
                    if (!snapshot) return
                    void deleteWithUndo({
                      label: 'Lab result deleted',
                      remove: () => db.results.delete(id),
                      restore: () => db.results.put(snapshot),
                    })
                  }}
                  onEditTarget={() => openTargetEdit(selectedSummary.key)}
                  hasPersonalTarget={targetByKey.has(selectedSummary.key)}
                />
                {editingTargetKey === selectedSummary.key && (
                  <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/50 p-3">
                    <p className="w-full text-xs font-medium">Personal range for {selectedSummary.label}</p>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="t-low" className="text-[11px]">Low</Label>
                      <Input id="t-low" inputMode="decimal" placeholder="e.g. 700" className="h-8 w-24 text-xs" value={targetLow} onChange={e => setTargetLow(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="t-high" className="text-[11px]">High</Label>
                      <Input id="t-high" inputMode="decimal" placeholder="e.g. 1000" className="h-8 w-24 text-xs" value={targetHigh} onChange={e => setTargetHigh(e.target.value)} />
                    </div>
                    <Button size="sm" className="h-8" onClick={() => void saveTarget(selectedSummary.key, selectedSummary.unit)}>Save</Button>
                    {targetByKey.has(selectedSummary.key) && (
                      <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => { void db.markerTargets.where('marker').equals(selectedSummary.key).delete(); setEditingTargetKey(null) }}>
                        Remove custom
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingTargetKey(null)} aria-label="Close range editor">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </PanelCard>
        )
      })}
      </DashGrid>

      {/* ── Manual add dialog ── */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add result</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="m-exam">Exam / panel name</Label>
              <Input id="m-exam" value={examName} onChange={e => setExamName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-date">Date</Label>
              <Input id="m-date" type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-marker">Marker</Label>
              <Input id="m-marker" value={marker} onChange={e => setMarker(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-value">Value</Label>
              <Input id="m-value" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-unit">Unit</Label>
              <Input id="m-unit" value={unit} onChange={e => setUnit(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => { await addManual(); setShowAddForm(false) }}
              disabled={!value}
            >
              <Plus className="size-4" /> Save marker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
