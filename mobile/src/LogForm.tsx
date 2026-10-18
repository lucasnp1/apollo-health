// The shell every log sheet shares: Cancel and Save in the native header, a scrolling form that clears the keyboard.
import * as Haptics from 'expo-haptics'
import { router, Stack } from 'expo-router'
import { type ReactNode, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, Text } from 'react-native'
import { C, F } from '@/theme'

export function LogForm({ canSave, onSave, children }: { canSave: boolean; onSave: () => Promise<unknown>; children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  // The header button is set up after a render, so a tap right after the last keystroke could run the previous one:
  // it always calls the latest save through this ref
  const latest = useRef({ canSave, onSave })
  latest.current = { canSave, onSave }
  const save = async () => {
    if (!latest.current.canSave || busy) return
    setBusy(true)
    try {
      await latest.current.onSave()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch (err) {
      console.error(err)
      Alert.alert("Couldn't save that", 'Nothing was lost: what you typed is still here. Try again.')
      setBusy(false)
    }
  }
  const ready = canSave && !busy
  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <Text style={{ fontFamily: F.medium, fontSize: 17, color: C.muted }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable hitSlop={12} disabled={!ready} onPress={save} accessibilityRole="button">
              <Text style={{ fontFamily: F.semi, fontSize: 17, color: ready ? C.primary : C.faint }}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 28 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </>
  )
}

/** The typed text as a number, accepting a comma for the decimal point. NaN when it isn't one. */
export const num = (s: string) => (s.trim() ? Number(s.trim().replace(',', '.')) : NaN)
