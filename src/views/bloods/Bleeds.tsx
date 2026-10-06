// Blood-letting on the Bloods page: venesections and donations, kept beside
// the tests (not inside them) and read against hematocrit before and after.

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { db, type Phlebotomy } from '../../lib/db'
import { archiveRow, restoreRow } from '../../lib/archive'
import { dayOf } from '../../lib/dates'
import type { LabTest } from '../../lib/labTests'
import { bleedRowProps, useBleeds } from './bleedFeed'
import { useUndoableDelete } from '../../lib/useUndoableDelete'
import { FeedList, FeedRow } from '../../components/FeedList'
import { PanelCard } from '../../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segmented } from '@/components/ui/segmented'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const today = () => dayOf(new Date().toISOString())
const SHOWN = 3

export function BleedsCard({ tests }: { tests: LabTest[] }) {
  const bleeds = useBleeds()
  const [open, setOpen] = useState<Phlebotomy | 'new'>()
  const [all, setAll] = useState(false)
  if (bleeds === undefined) return null
  const list = all ? bleeds : bleeds.slice(0, SHOWN)
  return (
    <PanelCard title="Blood-letting" subtitle={bleeds.length ? 'Venesections and donations, read against your hematocrit' : undefined}>
      <FeedList>
        {list.map((p) => <FeedRow key={p.id} {...bleedRowProps(p, tests)} onClick={() => setOpen(p)} />)}
        <FeedRow
          icon={Plus}
          title="Log a blood-letting"
          sub={bleeds.length ? undefined : 'A venesection or donation, so your next test shows what it did'}
          onClick={() => setOpen('new')}
        />
      </FeedList>
      {bleeds.length > SHOWN && (
        <Button variant="ghost" className="mt-1 h-10 w-full text-muted-foreground" onClick={() => setAll((a) => !a)}>
          {all ? 'Show less' : `Show ${bleeds.length - SHOWN} more`}
        </Button>
      )}
      {open && <PhlebotomyDialog row={open === 'new' ? undefined : open} onClose={() => setOpen(undefined)} />}
    </PanelCard>
  )
}

export function PhlebotomyDialog({ row, onClose }: { row?: Phlebotomy; onClose: () => void }) {
  const undo = useUndoableDelete()
  const [date, setDate] = useState(row?.performedAt ?? today())
  const [kind, setKind] = useState<Phlebotomy['kind']>(row?.kind ?? 'therapeutic')
  const [volume, setVolume] = useState(row?.volumeMl ? String(row.volumeMl) : '')
  const [place, setPlace] = useState(row?.place ?? '')
  const [notes, setNotes] = useState(row?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const ml = Number(volume.replace(',', '.'))
  const valid = !!date && date <= today() && (!volume || (ml > 0 && ml <= 2000))

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    const fields = { performedAt: date, kind, volumeMl: volume ? ml : undefined, place: place.trim() || undefined, notes: notes.trim() || undefined }
    try {
      if (row?.id !== undefined) await db.phlebotomies.update(row.id, fields)
      else await db.phlebotomies.add(fields)
      onClose()
    } finally { setBusy(false) }
  }

  async function archive() {
    if (row?.id === undefined) return
    const id = row.id
    onClose()
    await undo({ label: 'Blood-letting archived', remove: () => archiveRow('phlebotomies', id), restore: () => restoreRow('phlebotomies', id) })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>{row ? 'Edit blood-letting' : 'Log a blood-letting'}</DialogTitle>
          <DialogDescription>Your next test shows what it did to your hematocrit.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <Segmented
            ariaLabel="Kind"
            value={kind}
            onChange={setKind}
            options={[{ value: 'therapeutic', label: 'Venesection' }, { value: 'donation', label: 'Donation' }]}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pb-date">Date</Label>
              <Input id="pb-date" type="date" required max={today()} className="h-10" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pb-ml">Amount <span className="font-normal text-muted-foreground">mL</span></Label>
              <Input id="pb-ml" inputMode="numeric" className="h-10 text-base" placeholder={kind === 'donation' ? '470' : '500'} value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^\d.,]/g, ''))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pb-place">Where <span className="font-normal text-muted-foreground">optional</span></Label>
            <Input id="pb-place" className="h-10 text-base" placeholder="NHS, a clinic, a donor centre" value={place} onChange={(e) => setPlace(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pb-notes">Notes <span className="font-normal text-muted-foreground">optional</span></Label>
            <Input id="pb-notes" className="h-10 text-base" placeholder="How you felt, what they said" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            {row && <Button type="button" variant="ghost" className="h-10 text-muted-foreground sm:mr-auto" onClick={() => void archive()} disabled={busy}>Archive</Button>}
            <Button type="button" variant="outline" className="h-10" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" className="h-10" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
