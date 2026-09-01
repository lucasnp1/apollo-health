/**
 * ExportSheet — doctor-friendly export. The user picks a date range and which
 * sections to include, then exports as:
 *   • CSV  — one file, section blocks, opens in Sheets/Excel, easy to share.
 *   • PDF  — a clean printable document (Print → Save as PDF).
 *
 * Sections: injections (filterable by compound), lab results, blood pressure,
 * weight, symptoms.
 */

import { useMemo, useState } from 'react'
import { format, parseISO, subMonths } from 'date-fns'
import { Download, FileText, Share2 } from 'lucide-react'
import type { BodyMetric, Compound, InjectionLog, LabExam, Symptom, VitalLog } from '../lib/db'
import type { EnrichedResult } from '../lib/insights'
import { ALL_SYMPTOMS } from '../lib/symptoms'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type DateRange = '1M' | '3M' | '6M' | '1Y' | 'ALL'

const RANGE_LABELS: Record<DateRange, string> = {
  '1M': 'Last month', '3M': 'Last 3 months',
  '6M': 'Last 6 months', '1Y': 'Last year', 'ALL': 'All time',
}

function cutoffFor(range: DateRange): Date | null {
  if (range === 'ALL') return null
  const n = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range]
  return subMonths(new Date(), n)
}

// A section is built once as plain data, then rendered to either HTML or CSV.
type Section = { title: string; headers: string[]; rows: string[][] }

// ── Section builders (plain data) ───────────────────────────────────────────

function injectionsSection(injections: InjectionLog[], compounds: Compound[], compoundIds: number[], cutoff: Date | null): Section {
  const compMap = new Map(compounds.map((c) => [c.id!, c]))
  const rows = injections
    .filter((i) => compoundIds.includes(i.compoundId))
    .filter((i) => !cutoff || parseISO(i.takenAt) >= cutoff)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, 1000)
    .map((i) => {
      const c = compMap.get(i.compoundId)
      return [
        format(parseISO(i.takenAt), 'dd/MM/yyyy HH:mm'),
        c?.name ?? '',
        i.rawDose ?? (i.dose != null ? `${i.dose} ${i.unit}` : ''),
        i.route ?? 'IM',
        i.site ?? '',
        i.notes ?? '',
      ]
    })
  return { title: 'Injections', headers: ['Date & time', 'Compound', 'Dose', 'Route', 'Site', 'Notes'], rows }
}

function labsSection(exams: LabExam[], results: EnrichedResult[], cutoff: Date | null): Section {
  const examById = new Map(exams.map((e) => [e.id, e]))
  const rows = results
    .filter((r) => {
      const e = examById.get(r.examId)
      return e && (!cutoff || parseISO(e.collectedAt) >= cutoff)
    })
    .sort((a, b) => (examById.get(b.examId)?.collectedAt ?? '').localeCompare(examById.get(a.examId)?.collectedAt ?? ''))
    .map((r) => {
      const e = examById.get(r.examId)!
      const flag = r.value != null && r.low != null && r.value < r.low ? 'LOW'
        : r.value != null && r.high != null && r.value > r.high ? 'HIGH'
        : (r.low != null || r.high != null) ? 'OK' : ''
      return [
        format(parseISO(e.collectedAt), 'dd/MM/yyyy'),
        e.name,
        r.marker,
        `${r.rawValue}${r.unit ? ' ' + r.unit : ''}`,
        r.low != null || r.high != null ? `${r.low ?? ''}-${r.high ?? ''}` : '',
        flag,
      ]
    })
  return { title: 'Lab results', headers: ['Date', 'Panel', 'Marker', 'Result', 'Reference', 'Flag'], rows }
}

function bpSection(vitals: VitalLog[], cutoff: Date | null): Section {
  const rows = vitals
    .filter((v) => !cutoff || parseISO(v.measuredAt) >= cutoff)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .slice(0, 1000)
    .map((v) => [
      format(parseISO(v.measuredAt), 'dd/MM/yyyy HH:mm'),
      String(v.systolic),
      String(v.diastolic),
      v.pulse ? String(v.pulse) : '',
      v.notes ?? '',
    ])
  return { title: 'Blood pressure', headers: ['Date & time', 'Systolic', 'Diastolic', 'Pulse', 'Notes'], rows }
}

function weightSection(bodyMetrics: BodyMetric[], cutoff: Date | null): Section {
  const rows = bodyMetrics
    .filter((b) => b.weightKg !== undefined)
    .filter((b) => !cutoff || parseISO(b.measuredAt) >= cutoff)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .slice(0, 1000)
    .map((b) => [format(parseISO(b.measuredAt), 'dd/MM/yyyy HH:mm'), String(b.weightKg), b.notes ?? ''])
  return { title: 'Weight', headers: ['Date & time', 'Weight (kg)', 'Notes'], rows }
}

function symptomsSection(symptoms: Symptom[], cutoff: Date | null): Section {
  const rows = symptoms
    .filter((s) => !cutoff || parseISO(s.recordedAt) >= cutoff)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 1000)
    .map((s) => [
      format(parseISO(s.recordedAt), 'dd/MM/yyyy'),
      ...ALL_SYMPTOMS.map((def) => (typeof s[def.key] === 'number' ? String(s[def.key]) : '')),
      s.notes ?? '',
    ])
  return { title: 'Symptoms (1-5)', headers: ['Date', ...ALL_SYMPTOMS.map((d) => d.label), 'Notes'], rows }
}

// ── HTML rendering (fixed: forces a light document so print isn't all-black) ─

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

function htmlTable(section: Section): string {
  if (!section.rows.length) return '<p class="empty">No data in this range.</p>'
  const th = `<tr>${section.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
  const body = section.rows.map((r) => `<tr>${r.map((c) => {
    if (c === 'HIGH') return '<td class="flag-high">HIGH</td>'
    if (c === 'LOW') return '<td class="flag-low">LOW</td>'
    return `<td>${esc(c)}</td>`
  }).join('')}</tr>`).join('')
  return `<table><thead>${th}</thead><tbody>${body}</tbody></table>`
}

function buildHtml(title: string, subtitle: string, sections: Section[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <meta name="color-scheme" content="light">
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { background: #ffffff; color: #000000; }
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 32px 40px; font-size: 14px; line-height: 1.5; }
    @media print { body { padding: 16px 24px; } }
    header { border-bottom: 2px solid #000; padding-bottom: 14px; margin-bottom: 24px; }
    header h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
    header p  { margin: 0; color: #555; font-size: 12px; }
    .section  { margin-bottom: 32px; page-break-inside: avoid; }
    .section h2 { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px; }
    .empty { color: #666; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
    th { background: #f2f2f2; text-align: left; padding: 6px 10px; border: 1px solid #ddd; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 6px 10px; border: 1px solid #ddd; }
    tr:nth-child(even) td { background: #fafafa; }
    .flag-high { color: #dc2626; font-weight: 700; }
    .flag-low  { color: #2563eb; font-weight: 700; }
    footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ddd; color: #888; font-size: 11px; }
  </style>
</head>
<body>
  <header><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></header>
  ${sections.map((s) => `<div class="section"><h2>${esc(s.title)}</h2>${htmlTable(s)}</div>`).join('')}
  <footer>Generated by Apollo Health · ${format(new Date(), 'MMMM d, yyyy')} · Based on self-reported data, for informational purposes only. Please discuss with your healthcare provider.</footer>
</body>
</html>`
}

// ── CSV rendering ────────────────────────────────────────────────────────────

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(title: string, sections: Section[]): string {
  const blocks = sections.map((s) => {
    const head = `${csvCell(s.title.toUpperCase())}`
    if (!s.rows.length) return `${head}\nNo data in this range.`
    const headerRow = s.headers.map(csvCell).join(',')
    const bodyRows = s.rows.map((r) => r.map(csvCell).join(',')).join('\n')
    return `${head}\n${headerRow}\n${bodyRows}`
  })
  return `${csvCell(title)}\n\n${blocks.join('\n\n')}\n`
}

// ── Component ─────────────────────────────────────────────────────────────

export function ExportSheet({
  compounds, injections, vitals, exams, results, bodyMetrics, symptoms, onClose,
}: {
  compounds: Compound[]
  injections: InjectionLog[]
  vitals: VitalLog[]
  exams: LabExam[]
  results: EnrichedResult[]
  bodyMetrics: BodyMetric[]
  symptoms: Symptom[]
  onClose: () => void
}) {
  const [range, setRange] = useState<DateRange>('ALL')
  const [incl, setIncl] = useState({ injections: true, labs: true, bp: false, weight: false, symptoms: false })
  const [selectedCompounds, setSelectedCompounds] = useState<number[]>([])
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null)

  const compoundsWithHistory = useMemo(() => {
    const ids = new Set(injections.map((i) => i.compoundId))
    const all = compounds.filter((c) => ids.has(c.id!))
    const countById = new Map<number, number>()
    for (const inj of injections) countById.set(inj.compoundId, (countById.get(inj.compoundId) ?? 0) + 1)
    const seen = new Map<string, Compound>()
    for (const c of all) {
      const key = c.name.toLowerCase().split(/[\s-]/)[0]
      const existing = seen.get(key)
      if (!existing || (countById.get(c.id!) ?? 0) > (countById.get(existing.id!) ?? 0)) seen.set(key, c)
    }
    return [...seen.values()]
  }, [compounds, injections])

  useMemo(() => {
    if (selectedCompounds.length === 0 && compoundsWithHistory.length > 0) {
      setSelectedCompounds(compoundsWithHistory.map((c) => c.id!))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compoundsWithHistory.length])

  const anySelected = incl.injections || incl.labs || incl.bp || incl.weight || incl.symptoms

  function buildSections(): { sections: Section[]; titleParts: string[] } {
    const cutoff = cutoffFor(range)
    const sections: Section[] = []
    const titleParts: string[] = []
    if (incl.injections && selectedCompounds.length > 0) {
      sections.push(injectionsSection(injections, compounds, selectedCompounds, cutoff)); titleParts.push('Injections')
    }
    if (incl.labs) { sections.push(labsSection(exams, results, cutoff)); titleParts.push('Labs') }
    if (incl.bp) { sections.push(bpSection(vitals, cutoff)); titleParts.push('BP') }
    if (incl.weight) { sections.push(weightSection(bodyMetrics, cutoff)); titleParts.push('Weight') }
    if (incl.symptoms) { sections.push(symptomsSection(symptoms, cutoff)); titleParts.push('Symptoms') }
    return { sections, titleParts }
  }

  function docTitle(titleParts: string[]) {
    return `Apollo Health · ${titleParts.join(', ')}`
  }

  async function exportCsv() {
    const { sections, titleParts } = buildSections()
    if (!sections.length) return
    setBusy('csv')
    try {
      const csv = buildCsv(`${docTitle(titleParts)} · ${RANGE_LABELS[range]}`, sections)
      const filename = `apollo-health-${format(new Date(), 'yyyy-MM-dd')}.csv`
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }) // BOM for Excel
      const file = new File([blob], filename, { type: 'text/csv' })
      // Prefer the native share sheet on mobile; fall back to a download.
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Apollo Health export' }); return } catch { /* cancelled → download */ }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } finally {
      setBusy(null)
    }
  }

  function exportPdf() {
    const { sections, titleParts } = buildSections()
    if (!sections.length) return
    setBusy('pdf')
    try {
      const html = buildHtml(docTitle(titleParts), `Period: ${RANGE_LABELS[range]} · Patient health record`, sections)
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
        setTimeout(() => win.print(), 500)
      }
    } finally {
      setBusy(null)
    }
  }

  function toggleCompound(id: number) {
    setSelectedCompounds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare

  const rows: Array<{ key: keyof typeof incl; label: string; detail: string }> = [
    { key: 'injections', label: 'Injections', detail: 'All logged doses' },
    { key: 'labs', label: 'Lab results', detail: `${exams.length} panel${exams.length !== 1 ? 's' : ''} on file` },
    { key: 'bp', label: 'Blood pressure', detail: `${vitals.length} reading${vitals.length !== 1 ? 's' : ''}` },
    { key: 'weight', label: 'Weight', detail: `${bodyMetrics.filter((b) => b.weightKg !== undefined).length} entries` },
    { key: 'symptoms', label: 'Symptoms', detail: `${symptoms.length} check-in${symptoms.length !== 1 ? 's' : ''}` },
  ]

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export your data</DialogTitle>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
          {/* Date range */}
          <div>
            <p className="mb-2 eyebrow">Date range</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.entries(RANGE_LABELS) as [DateRange, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  aria-pressed={range === k}
                  className={cn('rounded-md border px-1.5 py-2 text-xs font-medium transition-colors',
                    range === k ? 'border-foreground bg-accent text-foreground' : 'border-border text-muted-foreground hover:bg-accent/60')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* What to include */}
          <div>
            <p className="mb-2 eyebrow">Include</p>
            <div className="flex flex-col gap-2">
              {rows.map(({ key, label, detail }) => (
                <div key={key}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3">
                    <Checkbox checked={incl[key]} onCheckedChange={(v) => setIncl((p) => ({ ...p, [key]: v === true }))} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    </div>
                  </label>

                  {key === 'injections' && incl.injections && compoundsWithHistory.length > 0 && (
                    <div className="mt-1.5 flex flex-col gap-1.5 pl-4">
                      <span className="eyebrow">Filter by compound</span>
                      <div className="flex flex-wrap gap-1.5">
                        {compoundsWithHistory.map((c) => {
                          const on = selectedCompounds.includes(c.id!)
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleCompound(c.id!)}
                              aria-pressed={on}
                              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                on ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:bg-accent')}
                              style={on ? { background: c.color ?? 'var(--primary)' } : undefined}
                            >
                              {c.name}{c.ester ? ` (${c.ester})` : ''}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button size="lg" className="w-full" onClick={exportCsv} disabled={!anySelected || busy !== null}>
              {canShareFiles ? <Share2 className="size-4" /> : <Download className="size-4" />}
              {busy === 'csv' ? 'Preparing…' : canShareFiles ? 'Share as CSV' : 'Download CSV'}
            </Button>
            <Button size="lg" variant="outline" className="w-full" onClick={exportPdf} disabled={!anySelected || busy !== null}>
              <FileText className="size-4" /> {busy === 'pdf' ? 'Opening…' : 'Save as PDF'}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              CSV opens in Sheets or Excel and is easy to share. PDF opens a clean document to save or print.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
