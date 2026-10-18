// Everything archived, grouped by type, each restorable: the web's views/Archive.tsx. Archived rows are hidden from
// the app but kept and synced, never deleted.
import * as Haptics from 'expo-haptics'
import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useMemo } from 'react'
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { db } from '@shared/lib/db'
import { restoreRow, setExamArchived } from '@shared/lib/archive'
import { compoundGroups, groupByCompoundId } from '@shared/lib/compounds'
import { fmtDay } from '@shared/lib/dates'
import { phlebotomyTitle } from '@shared/lib/phlebotomy'
import { Eyebrow } from '@/kit'
import { unitLabel } from '@/timeline'
import { showToast } from '@/toast'
import { C, F } from '@/theme'

type Item = { key: string; label: string; at?: string; restore: () => Promise<void> }

const archived = <T extends { archivedAt?: number; deletedAtSync?: number }>(r: T) => !!r.archivedAt && !r.deletedAtSync
const newest = (items: Item[]) => items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

export default function Archive() {
  const data = useLiveQuery(async () => ({
    injections: await db.injections.filter(archived).toArray(),
    bodyMetrics: await db.bodyMetrics.filter(archived).toArray(),
    vitals: await db.vitals.filter(archived).toArray(),
    symptoms: await db.symptoms.filter(archived).toArray(),
    exams: await db.exams.filter(archived).toArray(),
    bleeds: await db.phlebotomies.filter(archived).toArray(),
    compounds: await db.compounds.toArray(),
  }), [])

  const sections = useMemo(() => {
    if (!data) return []
    const byId = groupByCompoundId(compoundGroups(data.compounds))
    const groups: { title: string; data: Item[] }[] = [
      {
        title: 'Injections',
        data: data.injections.map((i) => {
          const dose = i.rawDose ?? (i.dose != null ? `${i.dose} ${unitLabel(i.unit)}` : undefined)
          const name = byId.get(i.compoundId)?.name ?? 'Injection'
          return { key: `i-${i.id}`, label: dose ? `${name} · ${dose}` : name, at: i.takenAt, restore: () => restoreRow('injections', i.id!) }
        }),
      },
      {
        title: 'Weight',
        data: data.bodyMetrics.filter((b) => b.weightKg != null).map((b) => ({ key: `w-${b.id}`, label: `${b.weightKg} kg`, at: b.measuredAt, restore: () => restoreRow('bodyMetrics', b.id!) })),
      },
      {
        title: 'Blood pressure',
        data: data.vitals.map((v) => ({ key: `v-${v.id}`, label: `${v.systolic}/${v.diastolic}`, at: v.measuredAt, restore: () => restoreRow('vitals', v.id!) })),
      },
      {
        title: 'Check-ins',
        data: data.symptoms.map((s) => ({ key: `s-${s.id}`, label: 'Check-in', at: s.recordedAt, restore: () => restoreRow('symptoms', s.id!) })),
      },
      {
        title: 'Blood tests',
        data: data.exams.map((e) => ({ key: `e-${e.id}`, label: e.name || 'Blood test', at: e.collectedAt, restore: () => setExamArchived(e.id!, false) })),
      },
      {
        title: 'Blood-lettings',
        data: data.bleeds.map((p) => ({ key: `p-${p.id}`, label: phlebotomyTitle(p), at: p.performedAt, restore: () => restoreRow('phlebotomies', p.id!) })),
      },
    ]
    return groups.filter((g) => g.data.length).map((g) => ({ ...g, data: newest(g.data) }))
  }, [data])

  return (
    <SectionList
      style={{ backgroundColor: C.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
      sections={sections}
      keyExtractor={(it) => it.key}
      stickySectionHeadersEnabled={false}
      initialNumToRender={20}
      windowSize={11}
      ListHeaderComponent={<Text style={a.intro}>Archived entries are hidden from your log but never deleted. Restore anything whenever you want.</Text>}
      renderSectionHeader={({ section }) => <Eyebrow style={a.head}>{`${section.title} · ${section.data.length}`}</Eyebrow>}
      renderItem={({ item }) => <Row item={item} />}
      ItemSeparatorComponent={() => <View style={a.sep} />}
      ListEmptyComponent={data ? <Text style={a.empty}>Nothing archived. Archived entries are kept here and can be brought back.</Text> : null}
    />
  )
}

const Row = memo(function Row({ item }: { item: Item }) {
  const restore = async () => {
    try {
      await item.restore()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showToast({ message: `Restored ${item.label}` })
    } catch (err) {
      console.error(err)
      showToast({ message: "Couldn't restore that. Try again." })
    }
  }
  return (
    <View style={a.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={a.label} numberOfLines={1}>{item.label}</Text>
        {item.at ? <Text style={a.sub}>{fmtDay(item.at)}</Text> : null}
      </View>
      <Pressable onPress={restore} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Restore ${item.label}`} style={({ pressed }) => [a.btn, pressed && { opacity: 0.7 }]}>
        <Text style={a.btnText}>Restore</Text>
      </Pressable>
    </View>
  )
})

const a = StyleSheet.create({
  intro: { fontFamily: F.body, fontSize: 14, color: C.muted, lineHeight: 19, paddingTop: 12, paddingBottom: 4 },
  head: { paddingTop: 24, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
  label: { fontFamily: F.semi, fontSize: 16, color: C.fg },
  sub: { fontFamily: F.mono, fontSize: 12, color: C.muted },
  btn: { borderRadius: 999, borderWidth: 1, borderColor: C.input, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.secondary },
  btnText: { fontFamily: F.semi, fontSize: 13, color: C.fg },
  empty: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21, paddingVertical: 24 },
})
