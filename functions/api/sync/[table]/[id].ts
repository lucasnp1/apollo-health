// Soft-delete via tombstone (deleted_at = ms) — sync pulls this as a deletion.
// For the `files` table also purge the R2 blob so storage doesn't grow forever.

import type { PagesFunction, Env } from '../../../_lib/types'
import { jsonError, jsonOk, requireUser } from '../../../_lib/auth'
import { TABLES } from '../../../_lib/tables'
import { wrap } from '../../../_lib/handler'

export const onRequestDelete: PagesFunction<Env, 'table' | 'id'> = wrap<Env, 'table' | 'id'>(
  async ({ env, request, params }) => {
    const auth = await requireUser(env, request)
    if (auth instanceof Response) return auth
    const slug = String(params.table)
    const id = String(params.id)
    const spec = TABLES[slug]
    if (!spec) return jsonError('Unknown table', 404)

    let r2Key: string | null = null
    if (slug === 'files') {
      const meta = await env.DB
        .prepare('SELECT r2_key FROM files WHERE id = ? AND user_id = ?')
        .bind(id, auth.user.id)
        .first<{ r2_key: string | null }>()
      r2Key = meta?.r2_key ?? null
    }

    const now = Date.now()
    const result = await env.DB
      .prepare(`UPDATE ${spec.table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(now, now, id, auth.user.id)
      .run()

    if (r2Key && env.FILES) {
      // Best-effort: don't fail the DELETE if R2 hiccups.
      try { await env.FILES.delete(r2Key) } catch { /* ignored */ }
    }

    return jsonOk({
      id,
      deleted: !!(result.meta && (result.meta as Record<string, unknown>).changes),
      at: now,
    })
  },
)
