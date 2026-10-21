// Every entry, newest first, by day. Filter by kind (and by compound under Injections) and by date range, in Apple's
// pull-down menus; Export takes what's shown to the doctor export. Home's widgets open it filtered (params kind, range).
// Tap an entry to edit it, press and hold to archive it with Undo (kept and restorable: Archive is never a delete).
import * as Haptics from 'expo-haptics'
import { SymbolView } from 'expo-symbols'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { router, useLocalSearchParams } from 'expo-router'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ActionSheetIOS, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { archiveRow, restoreRow, setExamArchived } from '@shared/lib/archive'
import { compoundGroups } from '@shared/lib/compounds'
import { useTests } from '@/labs/useTests'
import { useBodyMetrics, useCompounds, useInjections, useSymptoms, useVitals } from '@/data/useLog'
import { EventRow } from '@/EventRow'
import { Eyebrow, MenuPicker, PageHeader, Pill, RANGE_LABEL, RangeMenu, type RangeId, rangeDomain, useInsets } from '@/kit'
import { buildEvents, byDay, type Event, KIND_LABEL, type Kind } from '@/timeline'
import { withUndo } from '@/toast'
import { useUnits } from '@/units'
import { C, F } from '@/theme'

type Filter = Kind | 'all'
const KINDS = Object.keys(KIND_LABEL) as Kind[]
const ALL = 'all'

const FORM: Partial<Record<Kind, '/log/injection' | '/log/ancillary' | '/log/weight' | '/log/bp' | '/log/checkin'>> = {
  injection: '/log/injection', ancillary: '/log/ancillary', weight: '/log/weight', bp: '/log/bp', symptom: '/log/checkin',
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
      options: ['Archive', e.kind === 'lab' ? 'Open' : 'Edit', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 2,
    },
    (i) => {
      if (i === 1) return open(e)
      if (i === 0) archiveNow(e)
    },
  )
}

// Archived with Undo in a toast: kept and restorable, so a swipe needs no confirmation
function archiveNow(e: Event) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  const run = e.table === 'test'
    ? withUndo('Test archived', () => setExamArchived(e.rowId, true), () => setExamArchived(e.rowId, false))
    : withUndo('Entry archived', () => archiveRow(e.table as Exclude<Event['table'], 'test'>, e.rowId), () => restoreRow(e.table as Exclude<Event['table'], 'test'>, e.rowId))
  void run.catch(console.error)
}

// One row, re-rendered only when its event or its place on the day's card changes. Swipe left for Archive, as in Mail;
// press and hold for the same choice in a menu.
const Row = memo(function Row({ e, first }: { e: Event; first: boolean }) {
  const swipe = useRef<SwipeableMethods>(null)
  return (
    <View style={[t.item, first && t.first]}>
      <ReanimatedSwipeable
        ref={swipe}
        friction={1.6}
        rightThreshold={48}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            onPress={() => (swipe.current?.close(), archiveNow(e))}
            accessibilityRole="button"
            accessibilityLabel="Archive"
            style={({ pressed }) => [t.swipeAction, pressed && { opacity: 0.8 }]}
          >
            <SymbolView name="archivebox.fill" tintColor="#fff" size={18} />
            <Text style={t.swipeText}>Archive</Text>
          </Pressable>
        )}
      >
        <Pressable
          onPress={() => open(e)}
          onLongPress={() => archive(e)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityHint="Opens it to edit. Swipe left or press and hold to archive."
          accessibilityActions={[{ name: 'archive', label: 'Archive' }]}
          onAccessibilityAction={(a) => a.nativeEvent.actionName === 'archive' && archiveNow(e)}
          style={({ pressed }) => [t.content, pressed && { opacity: 0.75 }]}
        >
          {first ? null : <View style={t.sep} />}
          <EventRow e={e} />
        </Pressable>
      </ReanimatedSwipeable>
    </View>
  )
})

const renderItem = ({ item, index }: { item: Event; index: number }) => <Row e={item} first={index === 0} />
const renderSectionHeader = ({ section }: { section: { title: string } }) => <Eyebrow style={t.day}>{section.title}</Eyebrow>
const renderSectionFooter = () => <View style={t.foot} />
const keyExtractor = (e: Event) => e.id

export default function Timeline() {
  const insets = useInsets()
  const compounds = useCompounds()
  const injections = useInjections()
  const vitals = useVitals()
  const bodyMetrics = useBodyMetrics()
  const symptoms = useSymptoms()
  const tests = useTests()
  const units = useUnits()
  const params = useLocalSearchParams<{ kind?: string; range?: string; at?: string }>()
  const [kind, setKind] = useState<Filter>(ALL)
  const [compound, setCompound] = useState<string | undefined>()
  const [range, setRange] = useState<RangeId>('ALL')
  // Opened from a Home widget: take its filter (`at` changes on every tap, so the same link works twice)
  useEffect(() => {
    if (params.kind && (params.kind === ALL || params.kind in KIND_LABEL)) (setKind(params.kind as Filter), setCompound(undefined))
    if (params.range && params.range in RANGE_LABEL) setRange(params.range as RangeId)
  }, [params.kind, params.range, params.at])

  const everything = useMemo(() => buildEvents({ compounds, injections, vitals, bodyMetrics, symptoms, tests, units }), [units, compounds, injections, vitals, bodyMetrics, symptoms, tests])
  const from = rangeDomain(range, everything.map((e) => e.date.getTime()))[0]
  const inRange = useMemo(() => (range === 'ALL' ? everything : everything.filter((e) => e.date.getTime() >= from)), [everything, range, from])
  // Search reads what each row says: the name and dose, the facts under it, and the note
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const all = useMemo(
    () => (needle ? inRange.filter((e) => [e.title, e.sub, e.note].some((x) => x?.toLowerCase().includes(needle))) : inRange),
    [inRange, needle],
  )

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

  const count = sections.reduce((n, s) => n + s.data.length, 0)
  // Export what's on screen: the same kinds, compound and range, ready to change on the export sheet
  const exportShown = () =>
    router.push({ pathname: '/export', params: { range, kinds: kind === ALL ? '' : kind, group: shown ?? '' } })

  const header = (
    <View style={{ gap: 10, marginBottom: 8 }}>
      <PageHeader eyebrow={`${count} entr${count === 1 ? 'y' : 'ies'}`} title="Timeline" action={count ? <Pill label="Export" icon="square.and.arrow.up" onPress={exportShown} /> : undefined} />
      <View style={t.search}>
        <SymbolView name="magnifyingglass" tintColor={C.muted} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search entries"
          placeholderTextColor={C.faint}
          style={t.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search entries"
        />
      </View>
      <View style={t.filters}>
        <MenuPicker value={kind} onChange={(v) => (setKind(v), setCompound(undefined))} options={kinds} />
        {kind === 'injection' && groups.length > 1 ? (
          <MenuPicker value={shown ?? ALL} onChange={(v) => setCompound(v === ALL ? undefined : v)} options={[{ value: ALL, label: 'All compounds' }, ...groups]} />
        ) : null}
        <RangeMenu value={range} onChange={setRange} />
      </View>
    </View>
  )

  return (
    <SectionList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 90 }}
      sections={sections}
      keyExtractor={keyExtractor}
      stickySectionHeadersEnabled={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      initialNumToRender={14}
      maxToRenderPerBatch={16}
      updateCellsBatchingPeriod={40}
      windowSize={9}
      ListHeaderComponent={header}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      renderSectionFooter={renderSectionFooter}
      ListEmptyComponent={
        <Text style={t.empty}>{needle ? `Nothing matches "${query.trim()}".` : range !== 'ALL' ? 'Nothing in this range.' : kind !== ALL ? `No ${KIND_LABEL[kind].toLowerCase()} logged yet.` : 'Nothing logged yet. What you log on Home shows up here, newest first.'}</Text>
      }
    />
  )
}

// Each day's rows sit on one card: first row rounds the top, the footer rounds the bottom
const t = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.secondary, borderRadius: 12, paddingHorizontal: 12, minHeight: 40 },
  searchInput: { flex: 1, fontFamily: F.body, fontSize: 16, color: C.fg, paddingVertical: 9 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, marginLeft: -8 },
  day: { marginTop: 22, marginBottom: 8 },
  item: { backgroundColor: C.card, overflow: 'hidden', borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  first: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2 },
  content: { backgroundColor: C.card, paddingHorizontal: 14 },
  swipeAction: { width: 88, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeText: { fontFamily: F.semi, fontSize: 13, color: '#fff' },
  foot: {
    height: 8, backgroundColor: C.card, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: C.line,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 46 },
  empty: { fontFamily: F.body, fontSize: 15, color: C.muted, lineHeight: 21, paddingVertical: 24 },
})
