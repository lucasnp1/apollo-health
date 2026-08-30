import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useKeyboardInset } from '../lib/useKeyboardInset'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AddWeight({ onBack }: { onBack: () => void }) {
  const bodyMetrics = useLiveQuery(() => db.bodyMetrics.orderBy('measuredAt').reverse().limit(10).toArray(), [], [])
  const injections = useLiveQuery(() => db.injections.orderBy('takenAt').reverse().limit(40).toArray(), [], [])
  const last = useMemo(() => {
    let bestMs = -Infinity
    let w: number | undefined
    for (const b of bodyMetrics ?? []) if (b.weightKg !== undefined) { const ms = new Date(b.measuredAt).getTime(); if (ms > bestMs) { bestMs = ms; w = b.weightKg } }
    for (const i of injections ?? []) if (i.weightKg !== undefined) { const ms = new Date(i.takenAt).getTime(); if (ms > bestMs) { bestMs = ms; w = i.weightKg } }
    return w
  }, [bodyMetrics, injections])

  const [weight, setWeight] = useState('')
  const [busy, setBusy] = useState(false)
  const kbInset = useKeyboardInset()

  async function save() {
    if (!weight) return
    setBusy(true)
    try {
      await db.bodyMetrics.add({ measuredAt: new Date().toISOString(), source: 'manual', weightKg: Number(weight) })
      onBack()
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 pb-28">
      <section className="flex flex-col gap-3">
        <h2 className="px-0.5 eyebrow">Weight</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="w">Body weight</Label>
          <div className="relative">
            <Input id="w" inputMode="decimal" autoFocus className="pr-10 text-base" placeholder={last !== undefined ? String(last) : 'e.g. 82.5'} value={weight} onChange={(e) => setWeight(e.target.value)} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">kg</span>
          </div>
          {last !== undefined && <p className="text-xs text-muted-foreground">Last logged: {last} kg</p>}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-[bottom] duration-150" style={{ bottom: kbInset }}>
        <div className="mx-auto flex max-w-xl gap-2">
          <Button variant="outline" onClick={onBack} className="shrink-0">Cancel</Button>
          <Button size="lg" className="flex-1" onClick={save} disabled={busy || !weight}>{busy ? 'Saving…' : 'Log weight'}</Button>
        </div>
      </div>
    </div>
  )
}
