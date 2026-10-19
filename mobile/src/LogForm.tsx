// The shell every log sheet shares: the native X and Save tick in the header, a scrolling form that clears the keyboard.
// With `dirty`, leaving by Cancel or by swiping the sheet down asks first. With `archive` (editing a saved entry), a
// red "Archive this entry" closes the form, with Undo in a toast.
import * as Haptics from 'expo-haptics'
import { router, Stack, useNavigation } from 'expo-router'
import { usePreventRemove } from 'expo-router/react-navigation'
import { type ReactNode, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { archiveRow, type ArchivableTable, restoreRow } from '@shared/lib/archive'
import { withUndo } from '@/toast'
import { C, F } from '@/theme'

export function LogForm({ canSave, onSave, children, dirty = false, title, archive, loading }: {
  canSave: boolean
  onSave: () => Promise<unknown>
  children: ReactNode
  /** Something was typed or changed: closing without saving asks first. */
  dirty?: boolean
  /** Header title, e.g. "Edit weight". Leave out to keep the one set in the layout. */
  title?: string
  /** Editing a saved row: offers to archive it. */
  archive?: { table: ArchivableTable; id: number }
  /** The saved entry is still loading. */
  loading?: boolean
}) {
  const navigation = useNavigation()
  const [busy, setBusy] = useState(false)
  // Set right before closing on purpose (saved or archived), so the guard lets it through
  const leaving = useRef(false)
  // The header button is set up after a render, so a tap right after the last keystroke could run the previous one:
  // it always calls the latest save through this ref
  const latest = useRef({ canSave, onSave })
  latest.current = { canSave, onSave }

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action)
    Alert.alert(archive ? 'Discard your changes?' : 'Discard this entry?', archive ? 'The saved entry stays as it was.' : 'What you typed will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  })

  const save = async () => {
    if (!latest.current.canSave || busy) return
    setBusy(true)
    try {
      await latest.current.onSave()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      leaving.current = true
      router.back()
    } catch (err) {
      // the person chose "Keep editing" in a confirmation the save asked
      if ((err as Error)?.name === 'Cancelled') return setBusy(false)
      console.error(err)
      Alert.alert("Couldn't save that", 'Nothing was lost: what you typed is still here. Try again.')
      setBusy(false)
    }
  }

  const archiveIt = async () => {
    if (!archive || busy) return
    setBusy(true)
    const { table, id } = archive
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      await withUndo('Entry archived', () => archiveRow(table, id), () => restoreRow(table, id))
      leaving.current = true
      router.back()
    } catch (err) {
      console.error(err)
      Alert.alert("Couldn't archive that", 'Try again.')
      setBusy(false)
    }
  }

  const ready = canSave && !busy && !loading
  return (
    <>
      <Stack.Screen
        options={{
          ...(title && { title }),
          // Apple's sheet buttons (iOS 26): the X is in the layout's LOG options; Save is the prominent tick
          unstable_headerRightItems: () => [
            { type: 'button', label: 'Save', icon: { type: 'sfSymbol', name: 'checkmark' }, variant: 'prominent', tintColor: C.primary, disabled: !ready, onPress: save },
          ],
        }}
      />
      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 28 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {loading ? (
          <ActivityIndicator color={C.muted} style={{ marginTop: 40 }} />
        ) : (
          <>
            {children}
            {archive ? (
              <View style={{ marginTop: 8 }}>
                <Pressable
                  onPress={archiveIt}
                  disabled={busy}
                  accessibilityRole="button"
                  style={({ pressed }) => [l.archive, pressed && { opacity: 0.7 }]}
                >
                  <Text style={l.archiveText}>Archive this entry</Text>
                </Pressable>
                <Text style={l.archiveHint}>It leaves your timeline and charts, and is kept so you can bring it back.</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  )
}

/** The typed text as a number, accepting a comma for the decimal point. NaN when it isn't one. */
export const num = (s: string) => (s.trim() ? Number(s.trim().replace(',', '.')) : NaN)

const l = StyleSheet.create({
  archive: {
    alignItems: 'center', paddingVertical: 15, borderRadius: 12, backgroundColor: C.dangerSoft,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.dangerLine,
  },
  archiveText: { fontFamily: F.semi, fontSize: 16, color: C.danger },
  archiveHint: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18, textAlign: 'center', marginTop: 8 },
})
