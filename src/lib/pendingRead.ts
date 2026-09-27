// Carries a read from the public /read tool through sign-up into the app.
//
// Without this, someone who used /read had to create an account and then
// re-upload the same file to get back to a screen they already had. The parse
// is the expensive part and it is already done, so hand the RESULT over, not
// the file: the blob stays on the device it was read on and is never written
// to storage here.
//
// localStorage, not sessionStorage: sign-up can bounce through a new tab.

import type { LabExam, LabResult } from './db'

const KEY = 'magno.pendingRead'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PendingRead = {
  savedAt: number
  exam: Pick<LabExam, 'name' | 'collectedAt' | 'labName'>
  results: Array<Pick<LabResult, 'marker' | 'value' | 'rawValue' | 'unit' | 'low' | 'high'>>
}

export function stashPendingRead(read: Omit<PendingRead, 'savedAt'>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read, savedAt: Date.now() }))
    return true
  } catch {
    // Private mode, quota, or storage blocked. The sign-up link still works,
    // the reader just re-uploads — degraded, not broken.
    return false
  }
}

export function takePendingRead(): PendingRead | undefined {
  let raw: string | null
  try { raw = localStorage.getItem(KEY) } catch { return undefined }
  if (!raw) return undefined
  // Read once. Even a malformed entry is cleared, so a bad parse cannot wedge
  // every future sign-in on the same broken payload.
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  try {
    const parsed = JSON.parse(raw) as PendingRead
    if (!parsed?.results?.length || !parsed.exam) return undefined
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > MAX_AGE_MS) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function hasPendingRead(): boolean {
  try { return localStorage.getItem(KEY) !== null } catch { return false }
}
