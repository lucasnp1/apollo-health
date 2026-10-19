// The few building blocks every screen uses, in the web's look: hairline cards, mono eyebrows, amber for the one action.
import { DatePicker, Host, Picker, Text as SText } from '@expo/ui/swift-ui'
import { datePickerStyle, pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers'
import * as Haptics from 'expo-haptics'
import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import { forwardRef, type ReactNode } from 'react'
import { Pressable, type StyleProp, StyleSheet, Text, TextInput, type TextInputProps, type TextStyle, View, type ViewStyle } from 'react-native'
import { C, F, usePalette, useScheme } from '@/theme'

export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.eyebrow, style]}>{children}</Text>
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>
}

/** A section of a form: eyebrow, then its fields. */
export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Eyebrow>{title}</Eyebrow>
      {children}
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  )
}

export const Input = forwardRef<TextInput, TextInputProps & { suffix?: string }>(function Input({ suffix, style, ...props }, ref) {
  return (
    <View style={s.inputWrap}>
      <TextInput ref={ref} placeholderTextColor={C.faint} selectionColor={C.primary} style={[s.input, suffix ? { paddingRight: 18 + suffix.length * 9 } : null, style]} {...props} />
      {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
    </View>
  )
})

/** A choice among a few: tap to pick, tap the picked one again to clear it (when `clearable`). */
export function Chips<T extends string>({ options, value, onChange, clearable, selected }: {
  options: { value: T; label: string; dot?: string }[]
  value: T | undefined
  onChange: (v: T | undefined) => void
  clearable?: boolean
  /** Several picked at once (then `value` is ignored) */
  selected?: T[]
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = selected ? selected.includes(o.value) : o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole={selected ? 'checkbox' : 'radio'}
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync()
              onChange(on && clearable ? undefined : o.value)
            }}
            style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.7 }]}
          >
            {o.dot ? <View style={[s.dot, { backgroundColor: o.dot }]} /> : null}
            <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Two or three options that fill the row, like the web's Segmented. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync()
              onChange(o.value)
            }}
            style={[s.segItem, on && s.segOn]}
          >
            <Text style={[s.segText, on && { color: C.fg }]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export const s = StyleSheet.create({
  eyebrow: { fontFamily: F.monoMedium, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, padding: 16 },
  hint: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  inputWrap: { justifyContent: 'center' },
  input: {
    fontFamily: F.body, fontSize: 17, color: C.fg, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.input,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  suffix: { position: 'absolute', right: 14, fontFamily: F.mono, fontSize: 14, color: C.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: C.input, backgroundColor: C.card,
  },
  chipOn: { borderColor: C.primary, backgroundColor: C.primaryTint },
  chipText: { fontFamily: F.medium, fontSize: 15, color: C.muted },
  chipTextOn: { color: C.fg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  seg: { flexDirection: 'row', backgroundColor: C.secondary, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  segOn: { backgroundColor: C.segOn },
  segText: { fontFamily: F.semi, fontSize: 15, color: C.muted },
  widgetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  widgetTitle: { fontFamily: F.semi, fontSize: 19, color: C.fg, letterSpacing: -0.2 },
  widgetSub: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  // One size for every small button: 34 high, text centred both ways
  pill: { minHeight: 34, minWidth: 34, borderRadius: 999, borderWidth: 1, borderColor: C.input, paddingHorizontal: 14, backgroundColor: C.secondary, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  pageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  h1: { flexShrink: 1, fontFamily: F.semi, fontSize: 32, letterSpacing: -0.6, color: C.fg },
  pillPrimary: { backgroundColor: C.primary, borderColor: C.primary },
  pillText: { fontFamily: F.semi, fontSize: 14, color: C.fg, textAlign: 'center' },
  when: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 54, paddingVertical: 6, paddingRight: 8, borderRadius: 12 },
  whenLabel: { fontFamily: F.medium, fontSize: 16, color: C.fg },
})

/** A settings-style row: a label on the left, its control (a menu, a picker) on the right, centred. */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={[s.card, s.when]}>
      <Text style={s.whenLabel} numberOfLines={1}>{label}</Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end', justifyContent: 'center' }}>{children}</View>
    </View>
  )
}

/** When it happened: now by default, any moment up to now. The native compact picker (SwiftUI DatePicker). */
export function When({ value, onChange, time = true }: { value: Date; onChange: (d: Date) => void; time?: boolean }) {
  const scheme = useScheme()
  const pal = usePalette()
  return (
    <View style={[s.card, s.when]}>
      <Text style={s.whenLabel}>{time ? 'When' : 'Date'}</Text>
      <Host matchContents ignoreSafeArea="all" colorScheme={scheme} style={{ alignSelf: 'center' }}>
        <DatePicker
          selection={value}
          range={{ end: new Date() }}
          displayedComponents={time ? ['date', 'hourAndMinute'] : ['date']}
          onDateChange={onChange}
          modifiers={[datePickerStyle('compact'), tint(pal.primary)]}
        />
      </Host>
    </View>
  )
}

/**
 * Every Home widget wears the same head: a mono eyebrow naming what it is, the title (the number or verdict that
 * matters), a muted line under it, and one action on the right. Keep widgets consistent by building them on this.
 */
export function Widget({ eyebrow, title, sub, action, children, onPress }: {
  eyebrow: string
  title?: ReactNode
  sub?: ReactNode
  action?: ReactNode
  children?: ReactNode
  onPress?: () => void
}) {
  const head = (
    <View style={s.widgetHead}>
      <View style={{ flex: 1, gap: 4 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        {title ? <Text style={s.widgetTitle}>{title}</Text> : null}
        {sub ? <Text style={s.widgetSub}>{sub}</Text> : null}
      </View>
      {action}
    </View>
  )
  return (
    <View style={[s.card, { gap: 14 }]}>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
          {head}
        </Pressable>
      ) : (
        head
      )}
      {children}
    </View>
  )
}

/** Every tab's heading: a mono eyebrow, the big title, and one optional button on the title's line, centred on it. */
export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <View>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <View style={s.pageRow}>
        <Text style={s.h1} numberOfLines={1}>{title}</Text>
        {action}
      </View>
    </View>
  )
}

/** A small pill button for a widget's head: "3M", "+ Check in". */
export function Pill({ label, onPress, primary, icon }: { label: string; onPress: () => void; primary?: boolean; icon?: SymbolViewProps['name'] }) {
  const pal = usePalette()
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [s.pill, primary && s.pillPrimary, pressed && { opacity: 0.7 }]}>
      {icon ? <SymbolView name={icon} size={14} tintColor={primary ? pal.primaryFg : pal.fg} /> : null}
      <Text style={[s.pillText, primary && { color: C.primaryFg }]}>{label}</Text>
    </Pressable>
  )
}

export type RangeId = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'
export const RANGE_LABEL: Record<RangeId, string> = { '1W': 'Week', '1M': 'Month', '3M': '3 months', '6M': '6 months', '1Y': 'Year', ALL: 'All time' }
const RANGE_DAYS: Record<RangeId, number | null> = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365, ALL: null }
/** The time span a range covers, ending now; `ALL` starts at the earliest of `times`. */
export function rangeDomain(r: RangeId, times: number[]): [number, number] {
  const now = Date.now()
  const days = RANGE_DAYS[r]
  if (days !== null) return [now - days * 86_400_000, now]
  const first = times.length ? Math.min(...times) : now - 30 * 86_400_000
  return [Math.min(first, now - 7 * 86_400_000), now]
}

/** A pull-down choice in Apple's own menu (SwiftUI Picker, menu style): shows the picked label, ticks it in the menu. */
export function MenuPicker<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label?: string
}) {
  const scheme = useScheme()
  const pal = usePalette()
  return (
    <Host matchContents ignoreSafeArea="all" colorScheme={scheme}>
      <Picker label={label} selection={value} onSelectionChange={(v) => onChange(v as T)} modifiers={[pickerStyle('menu'), tint(pal.accentInk)]}>
        {options.map((o) => (
          <SText key={o.value} modifiers={[tag(o.value)]}>{o.label}</SText>
        ))}
      </Picker>
    </Host>
  )
}

/** Week, month, 3 months... */
export function RangeMenu({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return <MenuPicker value={value} onChange={onChange} options={(Object.keys(RANGE_LABEL) as RangeId[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }))} />
}
