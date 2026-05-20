// Soft-delete via tombstone (deleted_at = ms) — sync pulls this as a deletion.

import type { PagesFunction, Env } from '../../../_lib/types'
import { jsonError, jsonOk, requireUser } from '../../../_lib/auth'
import { TABLES } from '../../../_lib/tables'

export const onRequestDelete: PagesFunction<Env, 'table' | 'id'> = async ({ env, request, params }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth
  const slug = String(params.table)
  const id = String(params.id)
  const spec = TABLES[slug]
  if (!spec) return jsonError('Unknown table', 404)

  const now = Date.now()
  const result = await env.DB
    .prepare(`UPDATE ${spec.table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(now, now, id, auth.user.id)
    .run()

  return jsonOk({ id, deleted: result.meta && (result.meta as Record<string, unknown>).changes ? true : false, at: now })
}
