// The few building blocks every screen uses, in the web's look: hairline cards, mono eyebrows, amber for the one action.
import * as Haptics from 'expo-haptics'
import { forwardRef, type ReactNode } from 'react'
import { Pressable, type StyleProp, StyleSheet, Text, TextInput, type TextInputProps, type TextStyle, View, type ViewStyle } from 'react-native'
import { C, F } from '@/theme'

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
      <TextInput ref={ref} placeholderTextColor={C.faint} keyboardAppearance="dark" selectionColor={C.primary} style={[s.input, style]} {...props} />
      {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
    </View>
  )
})

/** A choice among a few: tap to pick, tap the picked one again to clear it (when `clearable`). */
export function Chips<T extends string>({ options, value, onChange, clearable }: {
  options: { value: T; label: string; dot?: string }[]
  value: T | undefined
  onChange: (v: T | undefined) => void
  clearable?: boolean
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
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
  chipOn: { borderColor: C.primary, backgroundColor: 'rgba(251,182,54,0.12)' },
  chipText: { fontFamily: F.medium, fontSize: 15, color: C.muted },
  chipTextOn: { color: C.fg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  seg: { flexDirection: 'row', backgroundColor: C.secondary, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  segOn: { backgroundColor: '#2c3036' },
  segText: { fontFamily: F.semi, fontSize: 15, color: C.muted },
})
