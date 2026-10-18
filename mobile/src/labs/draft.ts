// The test being entered, handed from the Labs screen (after reading a report) to the editor sheet.
import type { Draft } from '@shared/lib/bloodTestsDb'

let pending: Draft | undefined

export const setDraft = (d: Draft) => void (pending = d)
/** The handed-over draft, once: a second editor opened later starts blank. */
export function takeDraft(): Draft | undefined {
  const d = pending
  pending = undefined
  return d
}
