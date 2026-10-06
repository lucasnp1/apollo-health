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
import { Field, InputWithUnit } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { Dialog, DialogBar, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
      <DialogContent sheet className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? 'Edit blood-letting' : 'Log a blood-letting'}</DialogTitle>
          <DialogDescription>Your next test shows what it did to your hematocrit.</DialogDescription>
        </DialogHeader>
        <form id="pb-form" className="contents" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <DialogBody className="gap-4">
            <Field label="Type">
              <Segmented
                ariaLabel="Type"
                value={kind}
                onChange={setKind}
                className="w-full [&>button]:min-h-9"
                options={[{ value: 'therapeutic', label: 'Venesection' }, { value: 'donation', label: 'Donation' }]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="pb-date">
                <Input id="pb-date" type="date" required max={today()} className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Amount" htmlFor="pb-ml">
                <InputWithUnit id="pb-ml" unit="mL" inputMode="numeric" className="h-11 font-mono tabular-nums placeholder:font-sans" placeholder={kind === 'donation' ? 'e.g. 470' : 'e.g. 500'} value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^\d.,]/g, ''))} />
              </Field>
            </div>
            <Field label="Where" htmlFor="pb-place" optional>
              <Input id="pb-place" className="h-11" placeholder="NHS, a clinic, a donor centre" value={place} onChange={(e) => setPlace(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="pb-notes" optional>
              <textarea
                id="pb-notes"
                rows={2}
                className="w-full min-w-0 resize-none rounded-md border border-input bg-transparent px-3 py-2.5 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                placeholder="How you felt, what they said"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </DialogBody>
        </form>
        <DialogBar>
          {row && <Button type="button" variant="ghost" className="text-muted-foreground sm:mr-auto" onClick={() => void archive()} disabled={busy}>Archive</Button>}
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="pb-form" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogBar>
      </DialogContent>
    </Dialog>
  )
}
