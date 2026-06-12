import { useMemo, useState } from 'react'
import { Activity, Edit2, HeartPulse, Trash2 } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { db, type VitalLog } from '../lib/db'
import { TimeRangePicker } from '../components/TimeRangePicker'
import { filterByRange, type TimeRange } from '../lib/timeRange'
import { useUndoableDelete } from '../lib/useUndoableDelete'
import { DashGrid, StatRow } from '../components/dashboard/Grid'
import { StatCard } from '../components/dashboard/StatCard'
import { ChartCard } from '../components/dashboard/ChartCard'
import { PanelCard, PanelEmpty } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

// ── BP classification — ranges calibrated for steroid/TRT users ─────────────
type BpStatus = 'optimal' | 'good' | 'monitor' | 'high' | 'danger'

function classifyBp(systolic: number, diastolic: number): BpStatus {
  if (systolic >= 160 || diastolic >= 105) return 'danger'
  if (systolic >= 145 || diastolic >= 95)  return 'high'
  if (systolic >= 135 || diastolic >= 88)  return 'monitor'
  if (systolic >= 125 || diastolic >= 82)  return 'good'
  return 'optimal'
}

const BP_META: Record<BpStatus, { label: string; variant: 'good' | 'warn' | 'bad' }> = {
  optimal: { label: 'Optimal', variant: 'good' },
  good:    { label: 'Good',    variant: 'good' },
  monitor: { label: 'Monitor', variant: 'warn' },
  high:    { label: 'High',    variant: 'bad' },
  danger:  { label: 'Action',  variant: 'bad' },
}

const TONE_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  bad:  'bg-destructive/12 text-destructive',
}

const chartConfig = {
  systolic:  { label: 'Systolic',  color: 'var(--foreground)' },
  diastolic: { label: 'Diastolic', color: 'var(--muted-foreground)' },
  pulse:     { label: 'Pulse',     color: 'var(--chart-2)' },
} satisfies ChartConfig

const emptyForm = () => ({ systolic: '', diastolic: '', pulse: '', measuredAt: new Date().toISOString().slice(0, 16), notes: '' })

export function Vitals({ vitals }: { vitals: VitalLog[] }) {
  const deleteWithUndo = useUndoableDelete()
  const [range, setRange] = useState<TimeRange>('3M')
  const [form, setForm] = useState(emptyForm)
  const [editingVital, setEditingVital] = useState<VitalLog | null>(null)

  const filtered = useMemo(
    () => filterByRange(vitals, range, (v) => parseISO(v.measuredAt)).slice().reverse(),
    [vitals, range],
  )
  const chart = filtered.map((v) => ({
    date: format(parseISO(v.measuredAt), 'MMM d'),
    systolic: v.systolic,
    diastolic: v.diastolic,
    pulse: v.pulse,
  }))

  const stats = useMemo(() => {
    if (filtered.length === 0) return undefined
    const sys = filtered.map((v) => v.systolic)
    const dia = filtered.map((v) => v.diastolic)
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    return { meanSys: avg(sys), meanDia: avg(dia), n: filtered.length }
  }, [filtered])

  function startEditVital(v: VitalLog) {
    setEditingVital(v)
    setForm({
      systolic: String(v.systolic),
      diastolic: String(v.diastolic),
      pulse: v.pulse !== undefined ? String(v.pulse) : '',
      measuredAt: v.measuredAt.slice(0, 16),
      notes: v.notes ?? '',
    })
  }

  async function save() {
    if (!form.systolic || !form.diastolic) return
    const data = {
      measuredAt: new Date(form.measuredAt).toISOString(),
      systolic: Number(form.systolic),
      diastolic: Number(form.diastolic),
      pulse: form.pulse ? Number(form.pulse) : undefined,
      notes: form.notes || undefined,
    }
    if (editingVital?.id !== undefined) {
      await db.vitals.update(editingVital.id, data)
    }
    setEditingVital(null)
    setForm(emptyForm())
  }

  const meanStatus = stats ? classifyBp(Math.round(stats.meanSys), Math.round(stats.meanDia)) : undefined
  const insight = stats && meanStatus ? bpInsight(meanStatus, stats.meanSys, stats.meanDia) : undefined

  const latest = vitals[0]

  return (
    <div className="flex flex-col gap-5">
      {/* ── KPI row ── */}
      {stats && latest && (
        <StatRow className="md:grid-cols-3 2xl:grid-cols-3">
          <StatCard
            icon={HeartPulse}
            label="Latest reading"
            value={`${latest.systolic}/${latest.diastolic}`}
            sub={format(parseISO(latest.measuredAt), 'MMM d, HH:mm')}
            tone={BP_META[classifyBp(latest.systolic, latest.diastolic)].variant === 'bad' ? 'bad' : BP_META[classifyBp(latest.systolic, latest.diastolic)].variant === 'warn' ? 'primary' : 'good'}
          />
          <StatCard
            icon={Activity}
            label={`Mean (${stats.n} readings)`}
            value={`${stats.meanSys.toFixed(0)}/${stats.meanDia.toFixed(0)}`}
            sub={meanStatus ? BP_META[meanStatus].label : undefined}
            tone={meanStatus && (meanStatus === 'high' || meanStatus === 'danger') ? 'bad' : meanStatus === 'monitor' ? 'primary' : 'good'}
          />
          <StatCard
            icon={HeartPulse}
            label="Pulse"
            value={latest.pulse ? `${latest.pulse} bpm` : '—'}
            tone="info"
          />
        </StatRow>
      )}

      <DashGrid>
      {/* ── BP trend ── */}
      <ChartCard
        className="md:col-span-2 xl:col-span-6"
        title="Blood pressure trend"
        subtitle={stats ? `Mean ${stats.meanSys.toFixed(0)}/${stats.meanDia.toFixed(0)} over ${stats.n} readings` : undefined}
        action={<TimeRangePicker value={range} onChange={setRange} />}
      >
        {chart.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="fillSys" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-systolic)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-systolic)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <ReferenceArea y1={160} y2={200} fill="var(--destructive)" fillOpacity={0.07} />
              <ReferenceArea y1={145} y2={160} fill="var(--destructive)" fillOpacity={0.04} />
              <ReferenceArea y1={135} y2={145} fill="#c5821e" fillOpacity={0.05} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis domain={[60, 180]} tickLine={false} axisLine={false} tickMargin={4} tick={{ fontSize: 11 }} width={32} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <Area type="monotone" dataKey="systolic" stroke="var(--color-systolic)" strokeWidth={2} fill="url(#fillSys)" dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="diastolic" stroke="var(--color-diastolic)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="pulse" stroke="var(--color-pulse)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <PanelEmpty icon={HeartPulse} title="No readings in this range" detail="Use Log reading above to add one." />
        )}

        {insight && (
          <div className={`mt-4 rounded-lg border-l-2 px-3.5 py-2.5 ${insight.cls}`}>
            <p className="text-sm font-medium">{insight.title} — avg {stats!.meanSys.toFixed(0)}/{stats!.meanDia.toFixed(0)}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
          </div>
        )}
      </ChartCard>

      {/* ── Recent readings ── */}
      <PanelCard className="md:col-span-2 xl:col-span-6" title="Recent readings">
        {filtered.length > 0 ? (
          <Table>
            <TableBody>
              {filtered.slice().reverse().slice(0, 20).map((v) => {
                const meta = BP_META[classifyBp(v.systolic, v.diastolic)]
                return (
                  <TableRow key={v.id}>
                    <TableCell className="w-px py-3">
                      <span className={`inline-block size-2 rounded-full ${meta.variant === 'good' ? 'bg-emerald-500' : meta.variant === 'warn' ? 'bg-amber-500' : 'bg-destructive'}`} />
                    </TableCell>
                    <TableCell className="py-3 font-mono tabular-nums font-medium">
                      {v.systolic}/{v.diastolic}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="secondary" className={TONE_CLASS[meta.variant]}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      {v.pulse ? `${v.pulse} bpm` : '—'}{v.notes ? ` · ${v.notes}` : ''}
                    </TableCell>
                    <TableCell className="py-3 text-right text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                      {format(parseISO(v.measuredAt), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell className="w-px py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => startEditVital(v)} aria-label="Edit">
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label="Delete"
                          onClick={() => {
                            const snapshot = { ...v }
                            void deleteWithUndo({
                              label: 'Reading deleted',
                              remove: () => db.vitals.delete(v.id!),
                              restore: () => db.vitals.put(snapshot),
                            })
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <PanelEmpty icon={HeartPulse} title="No readings yet" detail="Tap Log reading above to add your first." />
        )}
      </PanelCard>
      </DashGrid>

      {/* ── Edit reading dialog ── */}
      <Dialog open={!!editingVital} onOpenChange={(o) => { if (!o) { setEditingVital(null); setForm(emptyForm()) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit reading</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sys">Systolic</Label>
              <Input id="sys" inputMode="numeric" value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dia">Diastolic</Label>
              <Input id="dia" inputMode="numeric" value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pulse">Pulse</Label>
              <Input id="pulse" inputMode="numeric" value={form.pulse} onChange={(e) => setForm({ ...form, pulse: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="when">Measured at</Label>
              <Input id="when" type="datetime-local" value={form.measuredAt} onChange={(e) => setForm({ ...form, measuredAt: e.target.value })} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={!form.systolic || !form.diastolic}>
              <Edit2 className="size-4" /> Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function bpInsight(status: BpStatus, _sys: number, _dia: number): { title: string; body: string; cls: string } {
  void _sys; void _dia
  if (status === 'optimal' || status === 'good') {
    return {
      title: '✓ BP well controlled',
      body: 'Keep logging — anabolics can push it up over time.',
      cls: 'border-emerald-500 bg-emerald-500/8',
    }
  }
  if (status === 'danger') {
    return {
      title: '⚠ Action needed',
      body: 'This is too high on-cycle. Consider a blast break, reduce dose/compound count, add cardio, and see a doctor. Check haematocrit ASAP.',
      cls: 'border-destructive bg-destructive/8',
    }
  }
  if (status === 'high') {
    return {
      title: 'BP is high',
      body: 'Common on high-dose blasts or compounds like Tren, Anadrol, or Deca. Reduce sodium, increase cardio, consider an AI or dose cut. Check haematocrit next bloods.',
      cls: 'border-destructive bg-destructive/8',
    }
  }
  return {
    title: 'BP needs monitoring',
    body: 'Expected on anabolic protocols. Stay hydrated, manage sodium, log consistently. If climbing, review compound selection or dose.',
    cls: 'border-amber-500 bg-amber-500/8',
  }
}
