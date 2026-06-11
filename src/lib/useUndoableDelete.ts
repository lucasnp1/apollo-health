// Delete-with-undo orchestration. Pattern:
//
//   const deleteWithUndo = useUndoableDelete()
//   ...
//   deleteWithUndo({
//     label: 'Reading deleted',
//     remove: async () => db.vitals.delete(id),
//     restore: async () => db.vitals.add(snapshot),
//   })
//
// The actual deletion happens immediately so the UI reflects the change
// (Dexie live queries re-fire). The undo button re-runs the `restore`
// callback. Caller is responsible for snapshotting whatever data is
// needed to recreate the row — this hook intentionally doesn't read the
// row before deleting, since the caller already has it in scope from
// rendering the table.

import { useCallback } from 'react'
import { useToast } from './toast'

export type UndoableDeleteRequest = {
  // Past-tense user-facing label, e.g. "Reading deleted", "Injection deleted".
  label: string
  // Permanently remove the row. Runs immediately.
  remove: () => Promise<unknown>
  // Bring the row back. Runs when the user taps Undo.
  restore: () => Promise<unknown>
  // Override the undo window (default: matches the toast's auto-dismiss).
  durationMs?: number
}

export function useUndoableDelete() {
  const { showToast } = useToast()
  return useCallback(
    async (req: UndoableDeleteRequest) => {
      try {
        await req.remove()
      } catch (err) {
        console.error('Delete failed', err)
        showToast({
          tone: 'error',
          message: 'Could not delete — please try again.',
        })
        return
      }
      showToast({
        message: req.label,
        durationMs: req.durationMs ?? 6000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await req.restore()
            } catch (err) {
              console.error('Undo failed', err)
              showToast({ tone: 'error', message: 'Could not undo.' })
            }
          },
        },
      })
    },
    [showToast],
  )
}
