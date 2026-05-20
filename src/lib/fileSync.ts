// Bridges the Dexie `files` table to the R2-backed blob storage on the server.
//
// Pattern: the metadata row syncs normally via the catalog-driven sync engine,
// but the blob bytes are too large to ship through the JSON `/api/sync/files`
// channel. So uploads happen out-of-band via `/api/files/upload`, and downloads
// (for a file row pulled from another device) hit `/api/files/:id/blob`.
//
// All cross-device authorization is enforced server-side: the row must exist in
// the user's `files` table before the bytes can be PUT or GET.

import { db, type HealthFile } from './db'

// Upload a single file's bytes to R2. Returns the r2Key if successful.
export async function uploadFileBlob(file: HealthFile): Promise<string | undefined> {
  if (!file.id || !file.serverId || !file.blob) return undefined
  // Push the metadata row first so the server has something to authorize against.
  // The sync engine handles this on its normal tick; for fresh uploads we may
  // need to give it a moment. Caller can choose to await syncTable('files') if
  // they want guaranteed ordering, but a retry-on-404 is also fine.
  const form = new FormData()
  form.append('fileId', file.serverId)
  form.append('blob', file.blob, file.name)

  const response = await fetch('/api/files/upload', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${await response.text()}`)
  }
  const json = (await response.json()) as { r2Key: string }
  await db.files.update(file.id, { r2Key: json.r2Key })
  return json.r2Key
}

// For a row that came from another device (has r2Key but no local blob), fetch
// the blob lazily on first open. Caches into Dexie so subsequent opens are instant.
export async function ensureBlobAvailable(file: HealthFile): Promise<Blob | undefined> {
  if (file.blob) return file.blob
  if (!file.r2Key || !file.serverId || !file.id) return undefined
  const response = await fetch(`/api/files/${encodeURIComponent(file.serverId)}/blob`, {
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error(`Blob fetch failed (${response.status}): ${await response.text()}`)
  }
  const blob = await response.blob()
  await db.files.update(file.id, { blob })
  return blob
}

// Best-effort upload sweep: pushes any file row that has a local blob and a
// serverId but no r2Key yet. Called from the sync engine after the files
// metadata row has been pushed up.
export async function pushUnuploadedBlobs(): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0
  let failed = 0
  const candidates = await db.files
    .filter((f) => Boolean(f.blob && f.serverId && !f.r2Key))
    .toArray()
  for (const file of candidates) {
    try {
      await uploadFileBlob(file)
      uploaded++
    } catch {
      failed++
    }
  }
  return { uploaded, failed }
}
