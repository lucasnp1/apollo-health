/**
 * DoseCalculator — syringe volume calculator.
 *
 * Given a vial concentration (mg/mL) and desired dose (mg), shows the volume
 * in mL and (optionally) the unit mark on a 1mL insulin syringe. A small
 * syringe diagram visualizes the fill level so the user can sanity-check
 * the number before drawing.
 */
import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type SyringeKind = '100' | '40' | '0'

const SYRINGE_OPTIONS: Array<{ label: string; value: SyringeKind }> = [
  { label: '1mL / 100u', value: '100' },
  { label: '1mL / 40u', value: '40' },
  { label: 'No syringe', value: '0' },
]

export function DoseCalculator({ onClose }: { onClose: () => void }) {
  const [concentration, setConcentration] = useState('') // mg/mL
  const [dose, setDose]                   = useState('') // mg
  const [syringeUnits, setSyringeUnits]   = useState<SyringeKind>('100')

  const conc   = parseFloat(concentration)
  const doseN  = parseFloat(dose)
  const syrN   = parseFloat(syringeUnits) || 100

  const valid = conc > 0 && doseN > 0
  const ml    = valid ? doseN / conc : null
  const units = ml !== null ? ml * syrN : null

  // For the SVG: fill fraction is volume / 1mL, capped at 1 (overdraw is
  // possible — when ml > 1 we show a full barrel + warning ribbon).
  const fillFraction = ml !== null ? Math.min(ml, 1) : 0
  const overdraw = ml !== null && ml > 1

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="size-4" /> Dose calculator
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dc-conc">
                Vial concentration <span className="font-normal text-muted-foreground">mg/mL</span>
              </Label>
              <Input
                id="dc-conc"
                inputMode="decimal"
                value={concentration}
                onChange={e => setConcentration(e.target.value)}
                placeholder="e.g. 300"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dc-dose">
                Dose needed <span className="font-normal text-muted-foreground">mg</span>
              </Label>
              <Input
                id="dc-dose"
                inputMode="decimal"
                value={dose}
                onChange={e => setDose(e.target.value)}
                placeholder="e.g. 200"
              />
            </div>
          </div>

          {/* Syringe type */}
          <div className="flex flex-col gap-1.5">
            <Label>Syringe markings</Label>
            <Tabs value={syringeUnits} onValueChange={(v) => setSyringeUnits(v as SyringeKind)}>
              <TabsList className="w-full">
                {SYRINGE_OPTIONS.map(opt => (
                  <TabsTrigger key={opt.value} value={opt.value} className="flex-1 text-xs">
                    {opt.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Result */}
          {valid && ml !== null ? (
            <div className={cn(
              'flex flex-col gap-3 rounded-lg border-l-2 bg-muted/50 px-4 py-3.5',
              overdraw ? 'border-l-destructive' : 'border-l-primary',
            )}>
              <SyringeIllustration fillFraction={fillFraction} units={units ?? 0} syringe={syringeUnits} overdraw={overdraw} />
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">Volume to draw</span>
                  <span className="font-mono text-2xl font-semibold tabular-nums">{ml.toFixed(3)} mL</span>
                </div>
                {syringeUnits !== '0' && units !== null && (
                  <div className="flex items-baseline justify-between gap-3 border-t pt-2">
                    <span className="text-sm font-medium">On {syringeUnits}u syringe</span>
                    <span className="font-mono text-xl font-semibold tabular-nums">{units.toFixed(1)} units</span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {doseN}mg ÷ {conc}mg/mL = {ml.toFixed(3)}mL
                </p>
                {overdraw && (
                  <p className="text-xs font-medium text-destructive">
                    This dose needs more than 1mL — split across two syringes or use a larger barrel.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 px-4 py-5 text-center text-sm text-muted-foreground">
              Enter concentration and dose to calculate
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Always double-check calculations before injecting. When in doubt, consult your prescribing physician.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Syringe illustration. Renders a 1mL barrel with the calculated fill level
// shaded in accent. Pure SVG — no extra deps, scales cleanly.
function SyringeIllustration({
  fillFraction,
  syringe,
  overdraw,
}: {
  fillFraction: number
  units: number
  syringe: SyringeKind
  overdraw: boolean
}) {
  // Barrel geometry — width-based so it scales with the container.
  const W = 220
  const H = 56
  const barrelX = 26
  const barrelY = 14
  const barrelW = 150
  const barrelH = H - barrelY - 14
  const fillW = barrelW * fillFraction
  const tickCount = syringe === '100' ? 10 : syringe === '40' ? 8 : 0

  return (
    <svg
      className="dose-calc-syringe"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Syringe approximately ${Math.round(fillFraction * 100)}% full`}
    >
      {/* Plunger end */}
      <rect x={2} y={barrelY + 4} width={20} height={barrelH - 8} rx={2} fill="currentColor" opacity={0.25} />
      <rect x={22} y={barrelY + 6} width={4} height={barrelH - 12} fill="currentColor" opacity={0.35} />
      {/* Barrel outline */}
      <rect x={barrelX} y={barrelY} width={barrelW} height={barrelH} rx={4} fill="var(--surface)" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} />
      {/* Fill */}
      {fillW > 0 && (
        <rect
          x={barrelX}
          y={barrelY}
          width={fillW}
          height={barrelH}
          rx={4}
          fill={overdraw ? 'var(--bad, #b91c1c)' : 'var(--accent)'}
          opacity={overdraw ? 0.85 : 0.78}
        />
      )}
      {/* Tick marks */}
      {Array.from({ length: tickCount + 1 }).map((_, i) => {
        const x = barrelX + (barrelW * i) / tickCount
        const major = i % 5 === 0
        return (
          <line
            key={i}
            x1={x}
            y1={barrelY + (major ? 0 : 4)}
            x2={x}
            y2={barrelY + barrelH - (major ? 0 : 4)}
            stroke="currentColor"
            strokeOpacity={major ? 0.5 : 0.25}
            strokeWidth={1}
          />
        )
      })}
      {/* Needle */}
      <line x1={barrelX + barrelW} y1={H / 2} x2={W - 4} y2={H / 2} stroke="currentColor" strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
      <polygon points={`${W - 6},${H / 2 - 2} ${W - 1},${H / 2} ${W - 6},${H / 2 + 2}`} fill="currentColor" opacity={0.6} />
    </svg>
  )
}
