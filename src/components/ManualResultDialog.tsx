import { useState } from 'react'
import { Plus } from 'lucide-react'
import { db } from '../lib/db'
import { canonicalKey } from '../lib/labTests'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ponytail: one marker per save; typed results from one day share one test
// until TestEditor (with its same-draw choice) replaces this dialog.
export function ManualResultDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (examId: number) => void }) {
  const [examName, setExamName] = useState('')
  const [marker, setMarker] = useState('Total Testosterone')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('nmol/L')
  // No silent today date: Save stays off until a draw date is picked.
  const [date, setDate] = useState('')

  async function save() {
    // A calendar day at noon UTC, the same stamp an import writes.
    const collectedAt = `${date}T12:00:00.000Z`
    // Only typed-in tests are reused, so typed values never mix into a same-day PDF import.
    const same = (await db.exams.where('collectedAt').equals(collectedAt).toArray())
      .find((e) => e.labName === 'Manual entry' && !e.archivedAt && !e.deletedAtSync)
    const id = same?.id ?? await db.exams.add({ name: examName.trim() || 'Blood test', collectedAt, labName: 'Manual entry' })
    const row = { examId: id, marker, value: Number(value), rawValue: value, unit }
    // A re-typed marker replaces the old row, so the correction wins (buildTests keeps the oldest duplicate).
    const key = canonicalKey(marker, unit).key
    const had = same && (await db.results.where('examId').equals(id).toArray())
      .find((r) => !r.archivedAt && !r.deletedAtSync && canonicalKey(r.marker, r.unit).key === key)
    if (had?.id !== undefined) await db.results.update(had.id, row)
    else await db.results.add(row)
    setValue('')
    onClose()
    onSaved?.(id)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Type a result in</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="m-exam">Test name (optional)</Label>
            <Input id="m-exam" placeholder="Blood test" value={examName} onChange={(e) => setExamName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-date">Draw date</Label>
            <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-marker">Marker</Label>
            <Input id="m-marker" value={marker} onChange={(e) => setMarker(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-value">Value</Label>
            <Input id="m-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="m-unit">Unit</Label>
            <Input id="m-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void save()} disabled={!value || !date || !Number.isFinite(Number(value))}>
            <Plus className="size-4" /> Save result
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
