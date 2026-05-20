// GET /api/files/:id/blob — streams the bytes back if the file row belongs to the caller.

import type { Env, PagesFunction } from '../../../_lib/types'
import { jsonError, requireUser } from '../../../_lib/auth'
import { wrap } from '../../../_lib/handler'

export const onRequestGet: PagesFunction<Env, 'id'> = wrap<Env, 'id'>(async ({ env, request, params }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth
  if (!env.FILES) return jsonError('File storage not configured', 503)

  const fileId = String(params.id)
  const meta = await env.DB
    .prepare('SELECT name, type, r2_key FROM files WHERE id = ? AND user_id = ?')
    .bind(fileId, auth.user.id)
    .first<{ name: string; type: string; r2_key: string | null }>()
  if (!meta) return jsonError('File not found', 404)
  if (!meta.r2_key) return jsonError('Blob not uploaded', 404)

  const object = await env.FILES.get(meta.r2_key)
  if (!object) return jsonError('Blob missing from storage', 404)

  return new Response(object.body, {
    headers: {
      'Content-Type': meta.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(meta.name).replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})
