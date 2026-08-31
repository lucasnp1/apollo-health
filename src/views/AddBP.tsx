import { useLayoutEffect, useRef, useState } from 'react'
import { db } from '../lib/db'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AddBP({ onBack }: { onBack: () => void }) {
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [pulse, setPulse] = useState('')
  const [busy, setBusy] = useState(false)
  const kbInset = useKeyboardInset()

  const sysRef = useRef<HTMLInputElement>(null)
  const diaRef = useRef<HTMLInputElement>(null)
  const pulseRef = useRef<HTMLInputElement>(null)

  // Open the numeric keyboard the moment the screen appears. Runs in the commit
  // phase — still inside the tap that navigated here — so iOS honours it.
  useLayoutEffect(() => { sysRef.current?.focus() }, [])

  // Three digits fills systolic / diastolic → hop to the next field with the
  // keyboard still up. Pulse is where the flow ends, so it never auto-advances.
  function handleDigits(
    raw: string,
    prev: string,
    set: (v: string) => void,
    next?: React.RefObject<HTMLInputElement | null>,
  ) {
    const v = raw.replace(/\D/g, '').slice(0, 3)
    set(v)
    if (next && v.length === 3 && prev.length < 3) next.current?.focus()
  }

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
        <h2 className="px-0.5 eyebrow">Blood pressure</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sys">Systolic</Label>
            <Input id="sys" ref={sysRef} inputMode="numeric" maxLength={3} className="text-base" placeholder="120" value={sys} onChange={(e) => handleDigits(e.target.value, sys, setSys, diaRef)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dia">Diastolic</Label>
            <Input id="dia" ref={diaRef} inputMode="numeric" maxLength={3} className="text-base" placeholder="80" value={dia} onChange={(e) => handleDigits(e.target.value, dia, setDia, pulseRef)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="pulse">Pulse <span className="font-normal text-muted-foreground">bpm</span></Label>
            <Input id="pulse" ref={pulseRef} inputMode="numeric" maxLength={3} className="text-base" placeholder="65" value={pulse} onChange={(e) => handleDigits(e.target.value, pulse, setPulse)} />
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-[bottom] duration-150" style={{ bottom: kbInset }}>
        <div className="mx-auto flex max-w-xl gap-2">
          <Button variant="outline" onClick={onBack} className="shrink-0">Cancel</Button>
          <Button size="lg" className="flex-1" onClick={save} disabled={busy || !sys || !dia}>{busy ? 'Saving…' : 'Save reading'}</Button>
        </div>
      </div>
    </div>
  )
}
