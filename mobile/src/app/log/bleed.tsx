// Log or edit a blood-letting (venesection or donation): the web's PhlebotomyDialog (views/bloods/Bleeds.tsx).
// Pass `id` to edit one; edit mode also offers Archive, with an Undo.
import { format, parseISO } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { db, type Phlebotomy } from '@shared/lib/db'
import { archiveRow, restoreRow } from '@shared/lib/archive'
import { Input, Section, Segmented, When } from '@/kit'
import { LogForm, num } from '@/LogForm'
import { withUndo } from '@/toast'
import { C, F } from '@/theme'

export default function LogBleed() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const rowId = id ? Number(id) : undefined
  // null while an edit's row loads
  const row = useLiveQuery(async () => (rowId === undefined ? undefined : await db.phlebotomies.get(rowId)), [rowId], null)
  if (rowId !== undefined && !row) return null
  return <BleedForm row={row ?? undefined} />
}

function BleedForm({ row }: { row?: Phlebotomy }) {
  const [kind, setKind] = useState<Phlebotomy['kind']>(row?.kind ?? 'therapeutic')
  const [date, setDate] = useState(() => (row ? parseISO(row.performedAt) : new Date()))
  const [volume, setVolume] = useState(row?.volumeMl ? String(row.volumeMl) : '')
  const [place, setPlace] = useState(row?.place ?? '')
  const [notes, setNotes] = useState(row?.notes ?? '')
  const ml = num(volume)
  const ok = !volume.trim() || (ml > 0 && ml <= 2000)

  const save = async () => {
    const fields = { performedAt: format(date, 'yyyy-MM-dd'), kind, volumeMl: volume.trim() ? ml : undefined, place: place.trim() || undefined, notes: notes.trim() || undefined }
    if (row?.id !== undefined) await db.phlebotomies.update(row.id, fields)
    else await db.phlebotomies.add(fields)
  }

  const archive = () => {
    const pid = row!.id!
    router.back()
    void withUndo('Blood-letting archived', () => archiveRow('phlebotomies', pid), () => restoreRow('phlebotomies', pid)).catch(console.error)
  }

  return (
    <LogForm canSave={ok} onSave={save}>
      <Section title="Type" hint="Your next test shows what it did to your hematocrit.">
        <Segmented options={[{ value: 'therapeutic', label: 'Venesection' }, { value: 'donation', label: 'Blood donation' }]} value={kind} onChange={setKind} />
      </Section>
      <When value={date} onChange={setDate} time={false} />
      <Section title="Amount">
        <Input keyboardType="number-pad" suffix="mL" placeholder={kind === 'donation' ? 'e.g. 470' : 'e.g. 500'} value={volume} onChangeText={(t) => setVolume(t.replace(/[^\d.,]/g, ''))} accessibilityLabel="Amount in millilitres" />
      </Section>
      <Section title="Where">
        <Input placeholder="NHS, a clinic, a donor centre" value={place} onChangeText={setPlace} />
      </Section>
      <Section title="Notes">
        <Input placeholder="How you felt, what they said" value={notes} onChangeText={setNotes} multiline />
      </Section>
      {row?.id !== undefined ? (
        <Pressable onPress={archive} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [{ alignSelf: 'center', paddingVertical: 10 }, pressed && { opacity: 0.6 }]}>
          <Text style={{ fontFamily: F.semi, fontSize: 16, color: C.muted }}>Archive</Text>
        </Pressable>
      ) : null}
    </LogForm>
  )
}
