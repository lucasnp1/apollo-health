/**
 * ProtocolWizard — simplified single-screen form.
 *
 * Creates (or edits) a compound + protocol in one step.
 * No vials, no multi-step pagination.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { db, type Compound, type Protocol, type ProtocolCadence, type TestosteroneEster, type Unit } from '../lib/db'
import { esterProfiles } from '../lib/insights'
import { PK_COMPOUND_NAMES, formsForCompound } from '../lib/pk'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const UNITS: Unit[] = ['mg', 'mcg', 'iu', 'ml', 'tablet', 'capsule']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Compound-differentiation palette — used for the colored left border on
// protocol rows. Brand yellow first, then complementary hues.
const COLORS = ['#f4c95c', '#c5821e', '#c43c2f', '#9b4ec2', '#2f8b54', '#2566c4', '#d97706', '#8b5cf6', '#1a1611', '#ec4899']
const ESTERS: TestosteroneEster[] = ['Enanthate', 'Cypionate', 'Propionate', 'Undecanoate', 'Custom']

export function ProtocolWizard({
  open,
  onClose,
  compounds,
  editProtocol,
}: {
  open: boolean
  onClose: () => void
  compounds: Compound[]
  editProtocol?: Protocol & { id: number }
}) {
  const isEdit = !!editProtocol

  // Compound
  const [compoundMode, setCompoundMode] = useState<'existing' | 'new'>('existing')
  const [selectedCompoundId, setSelectedCompoundId] = useState('')
  const [presetQuery, setPresetQuery]   = useState('')
  const [presetForm, setPresetForm]     = useState('')
  const [cName, setCName]       = useState('')
  const [cEster, setCEster]     = useState<TestosteroneEster>('Enanthate')
  const [cColor, setCColor]     = useState(COLORS[0])
  const [cCategory, setCCategory] = useState<Compound['category']>('TRT')

  const filteredPresets = useMemo(() => {
    if (!presetQuery.trim()) return []
    const q = presetQuery.toLowerCase()
    return PK_COMPOUND_NAMES.filter(n => n.toLowerCase().includes(q)).slice(0, 6)
  }, [presetQuery])

  const formOptions = useMemo(() => {
    if (!cName) return []
    return formsForCompound(cName)
  }, [cName])

  // Protocol
  const [pName,  setPName]  = useState('')
  const [pDose,  setPDose]  = useState('')
  const [pUnit,  setPUnit]  = useState<Unit>('mg')
  const [pKind,  setPKind]  = useState<ProtocolCadence['kind']>('everyNDays')
  const [pN,     setPN]     = useState('3.5')
  const [pDow,   setPDow]   = useState<number[]>([1, 4])
  const [pTime,  setPTime]  = useState('09:00')
  const [pPhase, setPPhase] = useState<Protocol['phase']>('Maintenance')
  const [saving, setSaving] = useState(false)

  // Init / reset
  useEffect(() => {
    if (!open) return
    if (isEdit && editProtocol) {
      setCompoundMode('existing')
      setSelectedCompoundId(String(editProtocol.compoundId))
      setPName(editProtocol.name)
      setPDose(String(editProtocol.dose))
      setPUnit(editProtocol.unit)
      setPPhase(editProtocol.phase ?? 'Maintenance')
      const cad = editProtocol.cadence
      setPKind(cad.kind)
      if (cad.kind === 'everyNDays') setPN(String(cad.n))
      if (cad.kind === 'weekly')     setPDow(cad.daysOfWeek)
      if ((cad.kind === 'everyNDays' || cad.kind === 'weekly')) setPTime(cad.timeOfDay ?? '09:00')
      if (cad.kind === 'daily') setPTime(cad.timesOfDay?.[0] ?? '09:00')
    } else {
      setCompoundMode(compounds.length === 0 ? 'new' : 'existing')
      setSelectedCompoundId('')
      setCName(''); setCEster('Enanthate'); setCColor(COLORS[0]); setCCategory('TRT')
      setPresetQuery(''); setPresetForm('')
      setPName(''); setPDose(''); setPUnit('mg')
      setPKind('everyNDays'); setPN('3.5'); setPDow([1, 4]); setPTime('09:00')
      setPPhase('Maintenance')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editProtocol?.id])

  const selectedCompound = compounds.find(c => String(c.id) === selectedCompoundId)
  const isTRT = compoundMode === 'new'
    ? cCategory === 'TRT'
    : selectedCompound?.category === 'TRT'

  const canSave = pDose && (
    (compoundMode === 'existing' && selectedCompoundId) ||
    (compoundMode === 'new' && cName)
  )

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      let compoundId: number
      if (compoundMode === 'new') {
        const detectedEster = ESTERS.find(e => presetForm.toLowerCase().includes(e.toLowerCase()))
        const effectiveEster = detectedEster ?? cEster
        compoundId = await db.compounds.add({
          name: cName,
          category: cCategory,
          defaultDose: Number(pDose) || 100,
          unit: pUnit,
          color: cColor,
          schedule: '',
          ester: isTRT ? effectiveEster : undefined,
          halfLifeDays: isTRT ? esterProfiles[effectiveEster]?.halfLifeDays : undefined,
          peakHours:    isTRT ? esterProfiles[effectiveEster]?.peakHours    : undefined,
        })
      } else {
        compoundId = Number(selectedCompoundId)
      }

      let cadence: ProtocolCadence
      if      (pKind === 'everyNDays') cadence = { kind: 'everyNDays', n: Number(pN) || 1, timeOfDay: pTime }
      else if (pKind === 'weekly')     cadence = { kind: 'weekly', daysOfWeek: pDow, timeOfDay: pTime }
      else if (pKind === 'daily')      cadence = { kind: 'daily', timesOfDay: [pTime] }
      else                             cadence = { kind: 'asNeeded' }

      const name = pName.trim() || (
        compoundMode === 'new' ? `${cName}` : `${selectedCompound?.name ?? ''}`
      )
      const proto = { name, compoundId, dose: Number(pDose), unit: pUnit, cadence, phase: pPhase }

      if (isEdit && editProtocol.id) {
        await db.protocols.update(editProtocol.id, proto)
      } else {
        await db.protocols.add({ ...proto, startedAt: new Date().toISOString() })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[88dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit protocol' : 'New protocol'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="-mx-1 max-h-[64dvh] px-1">
        <div className="flex flex-col gap-6 py-0.5">

          {/* ── Compound section ── */}
          {!isEdit && (
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compound</span>
                {compounds.length > 0 && (
                  <Tabs value={compoundMode} onValueChange={(v) => setCompoundMode(v as 'existing' | 'new')}>
                    <TabsList className="h-8">
                      <TabsTrigger value="existing" className="px-3 text-xs">Existing</TabsTrigger>
                      <TabsTrigger value="new" className="px-3 text-xs">New</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
              </div>

              {compoundMode === 'existing' ? (
                <Select
                  value={selectedCompoundId}
                  onValueChange={(v) => {
                    setSelectedCompoundId(v)
                    const c = compounds.find(x => String(x.id) === v)
                    if (c && !pDose) { setPDose(String(c.defaultDose)); setPUnit(c.unit) }
                  }}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select compound…" /></SelectTrigger>
                  <SelectContent>
                    {compounds.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}{c.ester ? ` (${c.ester})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Preset search */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={presetQuery}
                      onChange={e => { setPresetQuery(e.target.value); if (!e.target.value) setPresetForm('') }}
                      placeholder="Search compound (e.g. Testosterone)…"
                      className="pl-9"
                    />
                    {filteredPresets.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                        {filteredPresets.map(name => (
                          <button
                            key={name}
                            type="button"
                            className="block w-full border-b px-3.5 py-2.5 text-left text-sm font-medium last:border-b-0 hover:bg-accent"
                            onClick={() => {
                              setCName(name)
                              setPresetQuery(name)
                              setPresetForm('')
                              setTimeout(() => setPresetQuery(''), 0)
                              const forms = formsForCompound(name)
                              if (forms.length === 1) setPresetForm(forms[0])
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Manual name if no preset selected */}
                  {!filteredPresets.length && (
                    <Input
                      value={cName}
                      onChange={e => setCName(e.target.value)}
                      placeholder="Compound name"
                    />
                  )}

                  <div className="flex gap-3">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label>Category</Label>
                      <Select value={cCategory} onValueChange={(v) => setCCategory(v as Compound['category'])}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(['TRT', 'Ancillary', 'Peptide', 'Supplement', 'Other'] as Compound['category'][]).map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isTRT && (
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Label>Ester</Label>
                        {formOptions.length > 0 ? (
                          <Select value={presetForm || cEster} onValueChange={(v) => { setPresetForm(v); setCEster(v as TestosteroneEster) }}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {formOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select value={cEster} onValueChange={(v) => setCEster(v as TestosteroneEster)}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ESTERS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Color swatches */}
                  <div>
                    <Label className="mb-2 block">Colour</Label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCColor(c)}
                          aria-label={c}
                          aria-pressed={cColor === c}
                          className={cn(
                            'size-7 shrink-0 rounded-full transition-shadow',
                            cColor === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                          )}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── Schedule section ── */}
          <section>
            <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Schedule
            </span>
            <div className="flex flex-col gap-3.5">

              {/* Dose row */}
              <div className="flex gap-3">
                <div className="flex flex-[2] flex-col gap-1.5">
                  <Label htmlFor="pw-dose">Dose</Label>
                  <Input id="pw-dose" inputMode="decimal" value={pDose} onChange={e => setPDose(e.target.value)} placeholder="200" />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>Unit</Label>
                  <Select value={pUnit} onValueChange={(v) => setPUnit(v as Unit)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>Phase</Label>
                  <Select value={pPhase} onValueChange={(v) => setPPhase(v as Protocol['phase'])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['TRT', 'Blast', 'Cruise', 'PCT', 'Maintenance', 'Bridge', 'Trial'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Frequency */}
              <div className="flex flex-col gap-1.5">
                <Label>Frequency</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { kind: 'everyNDays', label: 'Every N days' },
                    { kind: 'weekly',     label: 'Days of week' },
                    { kind: 'daily',      label: 'Daily' },
                    { kind: 'asNeeded',   label: 'As needed' },
                  ] as const).map(opt => (
                    <button
                      key={opt.kind}
                      type="button"
                      onClick={() => setPKind(opt.kind)}
                      aria-pressed={pKind === opt.kind}
                      className={cn(
                        'rounded-md border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
                        pKind === opt.kind
                          ? 'border-foreground bg-accent text-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Cadence detail */}
                {pKind === 'everyNDays' && (
                  <div className="mt-1 flex items-center gap-2.5">
                    <span className="whitespace-nowrap text-[13px] text-muted-foreground">Every</span>
                    <Input inputMode="decimal" value={pN} onChange={e => setPN(e.target.value)} className="w-20" />
                    <span className="whitespace-nowrap text-[13px] text-muted-foreground">days</span>
                  </div>
                )}
                {pKind === 'weekly' && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {DOW.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPDow(cur => cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort())}
                        aria-pressed={pDow.includes(i)}
                        className={cn(
                          'size-10 rounded-full text-xs font-bold transition-colors',
                          pDow.includes(i)
                            ? 'bg-foreground text-background'
                            : 'bg-secondary text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
                {pKind !== 'asNeeded' && (
                  <div className="mt-1 flex items-center gap-2.5">
                    <span className="text-[13px] text-muted-foreground">Time</span>
                    <Input type="time" value={pTime} onChange={e => setPTime(e.target.value)} className="w-32" />
                  </div>
                )}
              </div>

              {/* Optional protocol name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pw-label">Label <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  id="pw-label"
                  value={pName}
                  onChange={e => setPName(e.target.value)}
                  placeholder={compoundMode === 'new' ? cName || 'e.g. Test E 200mg' : selectedCompound?.name || 'e.g. Test E 200mg'}
                />
              </div>
            </div>
          </section>
        </div>
        </ScrollArea>

        {/* Save */}
        <Button className="w-full" size="lg" onClick={save} disabled={!canSave || saving}>
          <Plus className="size-4" /> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add protocol'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
