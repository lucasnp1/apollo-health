// Shared by the log sheets: opening a saved entry to edit it (route param `id`), and knowing whether anything changed.
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'

/**
 * The entry this sheet edits, from the `id` route param. Loads the row once and hands it to `apply` to prefill the
 * form; `ready` turns true after that (straight away for a new entry).
 */
export function useEditRow<T>(load: (id: number) => PromiseLike<T | undefined>, apply: (row: T) => void) {
  const { id: raw } = useLocalSearchParams<{ id?: string }>()
  const n = raw ? Number(raw) : NaN
  const id = Number.isFinite(n) ? n : undefined
  const [ready, setReady] = useState(id === undefined)
  const fns = useRef({ load, apply })
  fns.current = { load, apply }
  useEffect(() => {
    if (id === undefined) return
    let live = true
    void Promise.resolve(fns.current.load(id)).then((row) => {
      if (!live) return
      if (row) fns.current.apply(row)
      setReady(true)
    })
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
