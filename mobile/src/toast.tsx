// A short message at the bottom with one action ("Undo"), over everything. showToast from anywhere; <Toaster/> is
// mounted once in app/_layout.tsx.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, F } from '@/theme'

type Toast = { id: number; message: string; action?: { label: string; run: () => void | Promise<unknown> } }
let current: Toast | undefined
let seq = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function showToast(t: Omit<Toast, 'id'>) {
  current = { ...t, id: ++seq }
  emit()
}
export const hideToast = () => void ((current = undefined), emit())

/** Archive-style change with an Undo: runs `remove` now, `restore` if Undo is tapped. */
export async function withUndo(message: string, remove: () => Promise<unknown>, restore: () => Promise<unknown>) {
  await remove()
  showToast({ message, action: { label: 'Undo', run: restore } })
}

export function Toaster() {
  const t = useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => current)
  const insets = useSafeAreaInsets()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!t) return
    const id = t.id
    const timer = setTimeout(() => current?.id === id && hideToast(), 5000)
    return () => clearTimeout(timer)
  }, [t])
  if (!t) return null
  return (
    <Animated.View key={t.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)} style={[s.wrap, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
      <View style={s.toast}>
        <Text style={s.text} numberOfLines={2}>{t.message}</Text>
        {t.action ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              const run = t.action!.run
              hideToast()
              tick((n) => n + 1)
              void Promise.resolve(run()).catch(console.error)
            }}
          >
            <Text style={s.action}>{t.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#2a2d33', borderWidth: StyleSheet.hairlineWidth, borderColor: C.line, maxWidth: 520, alignSelf: 'stretch',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  text: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.fg },
  action: { fontFamily: F.semi, fontSize: 15, color: C.accentInk },
})
