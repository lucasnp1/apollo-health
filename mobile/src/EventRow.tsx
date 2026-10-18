// One logged entry, as a row: kind icon, title and when, the facts under it, its status on the right, and the note.
import { format } from 'date-fns'
import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Event, Kind } from '@/timeline'
import { C, F, TONE } from '@/theme'

export const KIND_ICON: Record<Kind, { sf: SymbolViewProps['name']; color: string }> = {
  injection: { sf: 'syringe.fill', color: C.primary },
  weight: { sf: 'scalemass.fill', color: C.blue },
  bp: { sf: 'heart.fill', color: C.rose },
  symptom: { sf: 'brain.head.profile', color: C.violet },
}

export const EventRow = memo(function EventRow({ e, showDay }: { e: Event; showDay?: string }) {
  const icon = KIND_ICON[e.kind]
  const tone = TONE[e.status.tone]
  return (
    <View style={r.row}>
      <View style={[r.icon, { backgroundColor: icon.color + '1f' }]}>
        <SymbolView name={icon.sf} tintColor={icon.color} size={17} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={r.top}>
          {e.dot ? <View style={[r.dot, { backgroundColor: e.dot }]} /> : null}
          <Text style={r.title} numberOfLines={1}>{e.title}</Text>
        </View>
        <Text style={r.sub} numberOfLines={2}>
          {[showDay, format(e.date, 'HH:mm'), e.sub].filter(Boolean).join(' · ')}
        </Text>
        {e.note ? <Text style={r.note} numberOfLines={3}>{e.note}</Text> : null}
      </View>
      {e.status.tone !== 'neutral' ? (
        <View style={[r.status, { backgroundColor: tone + '1f' }]}>
          <Text style={[r.statusText, { color: tone }]}>{e.status.label}</Text>
        </View>
      ) : null}
    </View>
  )
})

const r = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flexShrink: 1, fontFamily: F.semi, fontSize: 16, color: C.fg },
  sub: { fontFamily: F.mono, fontSize: 12, color: C.muted, lineHeight: 17 },
  note: { fontFamily: F.body, fontSize: 14, color: C.fg, opacity: 0.8, lineHeight: 19, marginTop: 2 },
  status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 2 },
  statusText: { fontFamily: F.semi, fontSize: 12 },
})
