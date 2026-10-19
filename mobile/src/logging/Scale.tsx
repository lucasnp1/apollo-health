// The web's SymptomScale: 0 to 5, tap the picked value again to clear it. Used by the check-in and the injection logger.
import * as Haptics from 'expo-haptics'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { chipTone, type SymptomDef } from '@shared/lib/symptoms'
import { C, F, toneHex, usePalette } from '@/theme'

export function Scale({ def, value, onChange }: { def: SymptomDef; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const pal = usePalette()
  return (
    <View style={{ gap: 8 }}>
      <Text style={k.label}>{def.label}</Text>
      <View style={k.scale} accessibilityRole="radiogroup" accessibilityLabel={def.label}>
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const on = value === n
          const t = on ? chipTone(n, def.direction) : 'neutral'
          const ink = t === 'neutral' ? pal.fg : toneHex(pal, t)
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${def.label} ${n}`}
              onPress={() => {
                void Haptics.selectionAsync()
                onChange(on ? undefined : n)
              }}
              style={[k.step, on && { borderColor: ink, backgroundColor: ink + '1f' }]}
            >
              <Text style={[k.stepText, on && { color: ink, fontFamily: F.monoSemi }]}>{n}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const k = StyleSheet.create({
  label: { fontFamily: F.medium, fontSize: 16, color: C.fg },
  scale: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: C.input, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: F.mono, fontSize: 15, color: C.muted },
})
