import { useState } from 'react'
import { db } from '../lib/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AddBP({ onBack }: { onBack: () => void }) {
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [pulse, setPulse] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!sys || !dia) return
    setBusy(true)
    try {
      await db.vitals.add({
        measuredAt: new Date().toISOString(),
        systolic: Number(sys),
        diastolic: Number(dia),
        pulse: pulse ? Number(pulse) : undefined,
      })
      onBack()
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 pb-28">
      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground">Blood pressure</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sys">Systolic</Label>
            <Input id="sys" inputMode="numeric" autoFocus className="text-base" placeholder="120" value={sys} onChange={(e) => setSys(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dia">Diastolic</Label>
            <Input id="dia" inputMode="numeric" className="text-base" placeholder="80" value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="pulse">Pulse <span className="font-normal text-muted-foreground">bpm</span></Label>
            <Input id="pulse" inputMode="numeric" placeholder="65" value={pulse} onChange={(e) => setPulse(e.target.value)} />
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          <Button variant="outline" onClick={onBack} className="shrink-0">Cancel</Button>
          <Button size="lg" className="flex-1" onClick={save} disabled={busy || !sys || !dia}>{busy ? 'Saving…' : 'Save reading'}</Button>
        </div>
      </div>
    </div>
  )
}
