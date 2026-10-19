// Shared by the log sheets: opening a saved entry to edit it (route param `id`), and knowing whether anything changed.
import { useLocalSearchParams } from 'expo-router'
import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The entry this sheet edits, from the `id` route param. Loads the row once and hands it to `apply` to prefill the
 * form; `ready` turns true after that (straight away for a new entry). A row `load` returns as is (found in a live
 * store) is applied in a layout effect, before the first paint, so the sheet opens filled in; a promise (an archived
 * row, read from the database) shows the spinner while it reads.
 */
export function useEditRow<T>(load: (id: number) => T | undefined | PromiseLike<T | undefined>, apply: (row: T) => void) {
  const { id: raw } = useLocalSearchParams<{ id?: string }>()
  const n = raw ? Number(raw) : NaN
  const id = Number.isFinite(n) ? n : undefined
  const [ready, setReady] = useState(id === undefined)
  const fns = useRef({ load, apply })
  fns.current = { load, apply }
  useLayoutEffect(() => {
    if (id === undefined) return
    let live = true
    const done = (row: T | undefined) => {
      if (!live) return
      if (row) fns.current.apply(row)
      setReady(true)
    }
    const found = fns.current.load(id)
    if (found && typeof (found as PromiseLike<T>).then === 'function') void (found as PromiseLike<T | undefined>).then(done)
    else done(found as T | undefined)
    return () => void (live = false)
  }, [id])
  return { id, ready }
}

/**
 * True once the form differs from how it opened. The baseline is the first render where `ready` is true; `rebase()`
 * takes it again on the next render (after a prefill that the person did not type).
 */
export function useDirty(value: unknown, ready = true) {
  const key = JSON.stringify(value)
  const base = useRef<string | null>(null)
  if (ready && base.current === null) base.current = key
  return { dirty: base.current !== null && key !== base.current, rebase: () => void (base.current = null) }
}
