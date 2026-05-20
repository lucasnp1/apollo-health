// POST /api/files/upload  multipart/form-data  fields: fileId, blob
// Stores the blob in R2 under "users/<user_id>/<file_id>" and stamps
// `r2_key` on the corresponding `files` row.

import type { Env, PagesFunction } from '../../_lib/types'
import { jsonError, jsonOk, requireUser } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB hard cap per upload

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ env, request }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth
  if (!env.FILES) return jsonError('File storage not configured (R2 binding missing)', 503)

  const form = await request.formData()
  const fileId = String(form.get('fileId') || '').trim()
  const blob = form.get('blob')
  if (!fileId) return jsonError('fileId required', 400)
  if (!(blob instanceof File) && !(blob instanceof Blob)) return jsonError('blob (file) required', 400)
  if (blob.size > MAX_FILE_BYTES) return jsonError('File too large (>25 MB)', 413)

  // Ensure the metadata row exists and belongs to this user before storing bytes.
  const meta = await env.DB
    .prepare('SELECT id, name, type FROM files WHERE id = ? AND user_id = ?')
    .bind(fileId, auth.user.id)
    .first<{ id: string; name: string; type: string }>()
  if (!meta) return jsonError('File row not found — push the sync row first', 404)

  const key = `users/${auth.user.id}/${fileId}`
  await env.FILES.put(key, await blob.arrayBuffer(), {
    httpMetadata: { contentType: meta.type || 'application/octet-stream' },
  })

  const now = Date.now()
  await env.DB
    .prepare('UPDATE files SET r2_key = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(key, now, fileId, auth.user.id)
    .run()

  return jsonOk({ id: fileId, r2Key: key, size: blob.size })
})
