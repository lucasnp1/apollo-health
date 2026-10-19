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
import { LogForm } from '@/LogForm'
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
  const [place, setPlace] = useState(row?.place ?? '')
  const editing = row?.id !== undefined

  // Amount and notes from earlier entries (or the web) are kept as they were
  const save = async () => {
    const fields = { performedAt: format(date, 'yyyy-MM-dd'), kind, place: place.trim() || undefined }
    if (row?.id !== undefined) await db.phlebotomies.update(row.id, fields)
    else await db.phlebotomies.add(fields)
  }

  // ?. not !: React Compiler reads what a callback uses during render, and a new entry has no row
  const archive = () => {
    const pid = row?.id
    if (pid === undefined) return
    router.back()
    void withUndo('Blood-letting archived', () => archiveRow('phlebotomies', pid), () => restoreRow('phlebotomies', pid)).catch(console.error)
  }

  return (
    <LogForm canSave onSave={save} title={editing ? 'Edit blood-letting' : undefined}>
      <Section title="Where" hint="The clinic, the company or the donor centre.">
        <Input autoFocus={!editing} placeholder="e.g. NHS Blood and Transplant" value={place} onChangeText={setPlace} autoCapitalize="words" />
      </Section>
      <Section title="Type" hint="Your next test shows what it did to your hematocrit.">
        <Segmented options={[{ value: 'therapeutic', label: 'Venesection' }, { value: 'donation', label: 'Blood donation' }]} value={kind} onChange={setKind} />
      </Section>
      <When value={date} onChange={setDate} time={false} />
      {editing ? (
        <Pressable onPress={archive} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [{ alignSelf: 'center', paddingVertical: 10 }, pressed && { opacity: 0.6 }]}>
          <Text style={{ fontFamily: F.semi, fontSize: 16, color: C.muted }}>Archive</Text>
        </Pressable>
      ) : null}
    </LogForm>
  )
}
