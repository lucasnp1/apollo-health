import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, CircleCheck, CircleDashed, Droplet, Edit2, FileText, FlaskConical,
  Lock, Plus, Sparkles, Trash2, TriangleAlert, X,
} from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis, ReferenceLine } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Compound, type InjectionLog, type LabExam, type VitalLog } from '../lib/db'
import { extractMarkersFromText } from '../lib/pdf'
import { useUndoableDelete } from '../lib/useUndoableDelete'
import { archiveRow, restoreRow } from '../lib/archive'
import { type EnrichedResult } from '../lib/insights'
import { canonicalize, metaForKey, PANEL_ORDER, type LabPanel } from '../lib/markers'
import { LabAnalysisCard, LabSummaryCard } from '../components/LabAnalysis'
import { useLabFindings } from '../lib/labFindings'
import { FeedList, FeedRow, type FeedStatus } from '../components/FeedList'
import { usePlan } from '../lib/plan'
import { DashGrid } from '../components/dashboard/Grid'
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

// Short number for range text: 0.37, 12, 159.
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

// ── Marker row — one structured line per marker: name + value · date, the
// range it was read against, a status chip, and a few facts underneath ────
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
  const above  = status === 'warn' && latest?.high !== undefined && val !== undefined && val > latest.high
  const delta  = val !== undefined && prev?.value !== undefined ? val - prev.value : undefined
  const pct    = delta !== undefined && prev?.value ? Math.round((delta / Math.abs(prev.value)) * 100) : undefined

  const lo = latest?.low !== undefined ? fmtNum(latest.low) : undefined
  const hi = latest?.high !== undefined ? fmtNum(latest.high) : undefined
  const sub =
    lo && hi ? (status === 'warn' ? `${above ? 'above' : 'below'} range ${lo} to ${hi}` : `range ${lo} to ${hi}`)
    : hi ? (status === 'warn' ? `over the ${hi} limit` : `under ${hi}`)
    : lo ? (status === 'warn' ? `under the ${lo} floor` : `over ${lo}`)
    : 'no reference range'
  const dateText = latest ? format(parseISO(latest.date), 'MMM d, yyyy') : undefined

  const chip: FeedStatus =
    status === 'good' ? { label: 'In range', tone: 'good', icon: CircleCheck }
    : status === 'warn' ? { label: above ? 'High' : 'Low', tone: 'bad', icon: TriangleAlert }
    : { label: 'No range', tone: 'neutral', icon: CircleDashed }

  const valueText = val !== undefined ? (latest.rawValue || String(val)) : '—'
  const title = `${summary.label} ${valueText}${summary.unit && val !== undefined ? ` ${summary.unit}` : ''}`
  const change = delta !== undefined && Math.abs(delta) > 0.05
    ? `${delta > 0 ? '▲' : '▼'} ${pct !== undefined && Math.abs(pct) >= 1 ? `${Math.abs(pct)}%` : Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}`
    : undefined
  const facts = [
    change,
    prev?.value !== undefined ? `prev ${prev.rawValue || prev.value}` : undefined,
    latest?.examName,
  ].filter((f): f is string => typeof f === 'string' && f.length > 0)

  return (
    <FeedRow
      icon={Droplet}
      iconTone={status === 'warn' ? 'bad' : 'neutral'}
      title={title}
      when={dateText}
      whenShort={latest ? format(parseISO(latest.date), 'MMM d') : undefined}
      sub={sub}
      status={chip}
      facts={facts}
      onClick={onClick}
      selected={selected}
    />
  )
}

// The list used by both the "Needs attention" panel and each lab panel.
function MarkerList({
  summaries,
  selectedKey,
  onSelect,
  keyPrefix = '',
}: {
  summaries: MarkerSummary[]
  selectedKey: string | null
  onSelect: (key: string) => void
  keyPrefix?: string
}) {
  return (
    <FeedList>
      {summaries.map(s => (
        <MarkerRow
          key={keyPrefix + s.key}
          summary={s}
          selected={selectedKey === s.key}
          onClick={() => onSelect(s.key)}
        />
      ))}
    </FeedList>
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
          <p className="eyebrow">{summary.panel} · all tests</p>
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
                <p className="truncate text-xs text-muted-foreground">{entry.examName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('font-mono text-sm font-medium tabular-nums', status === 'warn' && 'text-destructive')}>
                  {entry.rawValue}
                  {entry.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{entry.unit}</span>}
                </span>
                {delta !== undefined && Math.abs(delta) > 0.05 && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}
                  </span>
                )}
                {status !== 'none' && (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'px-1.5 text-xs font-bold',
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
                    title="Archive this result"
                    aria-label="Archive result"
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

// Locked stand-in for the Composites card when the user isn't on Pro.
function ProCompositesTeaser({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <PanelCard
      title="Composites"
      subtitle="Smart analysis"
      action={<Badge variant="secondary" className="bg-primary/12 text-primary">Pro</Badge>}
    >
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/12 text-primary">
          <Lock className="size-5" />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">
          Unlock smart analysis of your bloodwork: heart, hormones, blood, and liver, with plain-language guidance from your latest results.
        </p>
        <Button size="sm" onClick={onUpgrade}>
          <Sparkles className="size-4" /> Unlock with Pro
        </Button>
      </div>
    </PanelCard>
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
  const { isPro, openUpgrade } = usePlan()
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
        ?.replace(/\s*[[(][0-9].*$/, '')
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
      // Per-result dedupe ONLY — keep different exams' entries even when
      // they happen to share a name + day (e.g. user re-uploading a corrected
      // PDF). The previous name+day check silently dropped real entries.
      if (r.id !== undefined && summary.entries.some(e => e.resultId === r.id)) continue

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
  const latestExam = useMemo(
    () => exams.length > 0 ? [...exams].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0] : undefined,
    [exams],
  )
  const lastTestDate = latestExam?.collectedAt
  const findings = useLabFindings(results, exams)

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

      <DashGrid>
      {/* ── The read: disclaimer, written summary, counts ── */}
      {hasData && (
        <div className="md:col-span-2 xl:col-span-6">
          <LabSummaryCard
            stats={{ markers: allSummaries.length, inRange: inRangeCount, outOfRange: outOfRangeSummaries.length, lastTest: lastTestDate ? format(parseISO(lastTestDate), 'MMM d') : undefined }}
            findings={isPro ? findings : null}
            subtitle={latestExam ? [latestExam.name, latestExam.labName, format(parseISO(latestExam.collectedAt), 'MMM d, yyyy')].filter(Boolean).join(' · ') : undefined}
          />
        </div>
      )}

      {/* ── Panel-by-panel analysis (Pro) ── */}
      {hasData && (
        <div className="md:col-span-2 xl:col-span-6">
          {isPro ? (
            <LabAnalysisCard findings={findings} />
          ) : (
            <ProCompositesTeaser onUpgrade={() => openUpgrade('Smart lab analysis')} />
          )}
        </div>
      )}

      {/* ── Needs attention ── */}
      {hasData && outOfRangeSummaries.length > 0 && (
        <PanelCard className="md:col-span-2 xl:col-span-6 border-l border-l-destructive" title={`${outOfRangeSummaries.length} out of range`} subtitle="Needs attention">
          <MarkerList
            summaries={outOfRangeSummaries}
            selectedKey={selectedKey}
            keyPrefix="attn-"
            onSelect={(key) => setSelectedKey(selectedKey === key ? null : key)}
          />
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
              className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left"
              onClick={() => togglePanel(panel)}
              aria-expanded={!collapsed}
            >
              {collapsed
                ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
              <h3 className="whitespace-nowrap font-display text-lg font-semibold">{panel}</h3>
              <span className="whitespace-nowrap text-xs text-muted-foreground">· {summaries.length} marker{summaries.length === 1 ? '' : 's'}</span>
              {outCount > 0 && (
                <Badge variant="secondary" className="ml-auto whitespace-nowrap bg-destructive/12 text-xs text-destructive">
                  {outCount} out of range
                </Badge>
              )}
            </button>

            {!collapsed && (
              <div className="mt-2">
                <MarkerList
                  summaries={summaries}
                  selectedKey={selectedKey}
                  onSelect={(key) => setSelectedKey(selectedKey === key ? null : key)}
                />
              </div>
            )}

            {!collapsed && selectedInPanel && selectedSummary && (
              <div className="mt-4 border-t pt-4">
                <MarkerHistoryPane
                  summary={selectedSummary}
                  onClose={() => setSelectedKey(null)}
                  onDelete={(id) => {
                    void deleteWithUndo({
                      label: 'Lab result archived',
                      remove: () => archiveRow('results', id),
                      restore: () => restoreRow('results', id),
                    })
                  }}
                  onEditTarget={() => openTargetEdit(selectedSummary.key)}
                  hasPersonalTarget={targetByKey.has(selectedSummary.key)}
                />
                {editingTargetKey === selectedSummary.key && (
                  <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/50 p-3">
                    <p className="w-full text-xs font-medium">Personal range for {selectedSummary.label}</p>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="t-low" className="text-xs">Low</Label>
                      <Input id="t-low" inputMode="decimal" placeholder="e.g. 700" className="h-8 w-24 text-xs" value={targetLow} onChange={e => setTargetLow(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="t-high" className="text-xs">High</Label>
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
              <Label htmlFor="m-exam">Panel name</Label>
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
