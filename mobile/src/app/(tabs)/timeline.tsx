// Every entry, newest first, by day. Filter by kind (and by compound under Injections); tap an entry to edit it, press
// and hold to archive it with Undo (kept and restorable, as on the web: Archive is never a delete).
import { useLiveQuery } from 'dexie-react-hooks'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { memo, useCallback, useMemo, useState } from 'react'
import { ActionSheetIOS, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { archiveRow, restoreRow, setExamArchived } from '@shared/lib/archive'
import { compoundGroups } from '@shared/lib/compounds'
import { db } from '@shared/lib/db'
import { useTests } from '@/labs/useTests'
import { dedupeInjections, useCompounds } from '@/data/useLog'
import { EventRow } from '@/EventRow'
import { Chips, Eyebrow } from '@/kit'
import { buildEvents, byDay, type Event, KIND_LABEL, type Kind } from '@/timeline'
import { withUndo } from '@/toast'
import { C, F } from '@/theme'

type Filter = Kind | 'all'
const KINDS = Object.keys(KIND_LABEL) as Kind[]
const ALL = 'all'

// The whole history, not the latest few hundred the logging screens read
const useAllInjections = () =>
  useLiveQuery(async () => dedupeInjections(await db.injections.filter((i) => !i.deletedAtSync && !i.archivedAt).toArray()), [], [])
const useAllVitals = () => useLiveQuery(() => db.vitals.filter((v) => !v.archivedAt).toArray(), [], [])
const useAllBody = () => useLiveQuery(() => db.bodyMetrics.filter((b) => !b.archivedAt).toArray(), [], [])
const useAllSymptoms = () => useLiveQuery(() => db.symptoms.filter((s) => !s.archivedAt).toArray(), [], [])

const FORM: Partial<Record<Kind, '/log/injection' | '/log/weight' | '/log/bp' | '/log/checkin'>> = {
  injection: '/log/injection', weight: '/log/weight', bp: '/log/bp', symptom: '/log/checkin',
}

function open(e: Event) {
  if (e.kind === 'lab') return router.push({ pathname: '/labs/[id]', params: { id: String(e.rowId) } })
  const pathname = FORM[e.kind]
  if (pathname) router.push({ pathname, params: { id: String(e.rowId) } })
}

function archive(e: Event) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: e.title, message: 'Archived entries leave your timeline and charts. They are kept, and you can bring them back.',
      options: ['Archive', e.kind === 'lab' ? 'Open' : 'Edit', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 2, userInterfaceStyle: 'dark',
    },
    (i) => {
      if (i === 1) return open(e)
      if (i !== 0) return
      const run = e.table === 'test'
        ? withUndo('Test archived', () => setExamArchived(e.rowId, true), () => setExamArchived(e.rowId, false))
        : withUndo('Entry archived', () => archiveRow(e.table as Exclude<Event['table'], 'test'>, e.rowId), () => restoreRow(e.table as Exclude<Event['table'], 'test'>, e.rowId))
      void run.catch(console.error)
    },
  )
}

// One row, re-rendered only when its event or its place on the day's card changes
const Row = memo(function Row({ e, first }: { e: Event; first: boolean }) {
  return (
    <Pressable onPress={() => open(e)} onLongPress={() => archive(e)} delayLongPress={350} accessibilityRole="button" accessibilityHint="Opens it to edit. Press and hold to archive." style={({ pressed }) => [t.item, first && t.first, pressed && { opacity: 0.75 }]}>
      {first ? null : <View style={t.sep} />}
      <EventRow e={e} />
    </Pressable>
  )
})

const renderItem = ({ item, index }: { item: Event; index: number }) => <Row e={item} first={index === 0} />
const renderSectionHeader = ({ section }: { section: { title: string } }) => <Eyebrow style={t.day}>{section.title}</Eyebrow>
const renderSectionFooter = () => <View style={t.foot} />
const keyExtractor = (e: Event) => e.id

/** A row of chips that scrolls sideways instead of wrapping, edge to edge. */
function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  )
}

export default function Timeline() {
  const insets = useSafeAreaInsets()
  const compounds = useCompounds()
  const injections = useAllInjections()
  const vitals = useAllVitals()
  const bodyMetrics = useAllBody()
  const symptoms = useAllSymptoms()
  const tests = useTests()
  const [kind, setKind] = useState<Filter>(ALL)
  const [compound, setCompound] = useState<string | undefined>()

  const all = useMemo(() => buildEvents({ compounds, injections, vitals, bodyMetrics, symptoms, tests }), [compounds, injections, vitals, bodyMetrics, symptoms, tests])

  // Counts per kind and per compound, in one pass
  const { kinds, groups } = useMemo(() => {
    const byKind = new Map<Kind, number>()
    const byGroup = new Map<string, number>()
    for (const e of all) {
      byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1)
      if (e.group) byGroup.set(e.group, (byGroup.get(e.group) ?? 0) + 1)
    }
    return {
      kinds: [
        { value: ALL as Filter, label: `All ${all.length}` },
        ...KINDS.filter((k) => byKind.get(k) || k === kind).map((k) => ({ value: k as Filter, label: `${KIND_LABEL[k]} ${byKind.get(k) ?? 0}` })),
      ],
      groups: compoundGroups(compounds, injections)
        .filter((g) => byGroup.get(g.key))
        .sort((a, b) => byGroup.get(b.key)! - byGroup.get(a.key)!)
        .map((g) => ({ value: g.key, label: `${g.name} ${byGroup.get(g.key)}`, dot: g.color })),
    }
  }, [all, compounds, injections, kind])

  const shown = kind === 'injection' && compound && groups.some((g) => g.value === compound) ? compound : undefined
  const sections = useMemo(
    () => byDay(kind === ALL ? all : all.filter((e) => e.kind === kind && (!shown || e.group === shown))),
    [all, kind, shown],
  )

  const pickKind = useCallback((v: Filter | undefined) => {
    setKind(v ?? ALL)
    setCompound(undefined)
  }, [])

  const header = (
    <View style={{ gap: 12, marginBottom: 8 }}>
      <View style={{ marginBottom: 4 }}>
        <Eyebrow>{all.length} entr{all.length === 1 ? 'y' : 'ies'}</Eyebrow>
        <Text style={t.h1}>Timeline</Text>
      </View>
      <ChipRow>
        <Chips options={kinds} value={kind} onChange={pickKind} />
      </ChipRow>
      {kind === 'injection' && groups.length > 1 ? (
        <ChipRow>
          <Chips options={[{ value: ALL, label: 'All compounds' }, ...groups]} value={shown ?? ALL} onChange={(v) => setCompound(v === ALL ? undefined : v)} />
        </ChipRow>
      ) : null}
    </View>
  )

  return (
    <SectionList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 }}
      sections={sections}
      keyExtractor={keyExtractor}
      stickySectionHeadersEnabled={false}
      initialNumToRender={14}
      maxToRenderPerBatch={16}
      updateCellsBatchingPeriod={40}
      windowSize={9}
      ListHeaderComponent={header}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      renderSectionFooter={renderSectionFooter}
      ListEmptyComponent={
        <Text style={t.empty}>{kind !== ALL ? `No ${KIND_LABEL[kind].toLowerCase()} logged yet.` : 'Nothing logged yet. What you log on Home shows up here, newest first.'}</Text>
      }
    />
  )
}

// Each day's rows sit on one card: first row rounds the top, the footer rounds the bottom
const t = StyleSheet.create({
  h1: { fontFamily: F.semi, fontSize: 32, letterSpacing: -0.6, color: C.fg, marginTop: 6 },
  day: { marginTop: 22, marginBottom: 8 },
  item: { backgroundColor: C.card, paddingHorizontal: 14, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2 },
  foot: {
    height: 8, backgroundColor: C.card, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: C.line,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 46 },
  empty: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21, paddingVertical: 24 },
})
