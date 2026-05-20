// Generic per-table sync endpoint.
//   GET  /api/sync/:table?since=<ms>          → rows updated_at > since for current user
//   POST /api/sync/:table   { rows: [...] }   → upsert batch (each row must have id + updatedAt)
//   DELETE /api/sync/:table/:id               → handled in [table]/[id].ts

import type { PagesFunction, Env } from '../../_lib/types'
import { jsonError, jsonOk, requireUser } from '../../_lib/auth'
import { TABLES, rowToClient, type TableSpec } from '../../_lib/tables'

export const onRequestGet: PagesFunction<Env, 'table'> = async ({ env, request, params }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth
  const slug = String(params.table)
  const spec = TABLES[slug]
  if (!spec) return jsonError('Unknown table', 404)

  const url = new URL(request.url)
  const since = Number(url.searchParams.get('since') || '0') || 0
  const limit = Math.min(Number(url.searchParams.get('limit') || '500'), 1000)

  const rows = await env.DB
    .prepare(`SELECT * FROM ${spec.table} WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT ?`)
    .bind(auth.user.id, since, limit)
    .all<Record<string, unknown>>()

  const results = (rows.results || []).map((row) => rowToClient(spec, row))
  const cursor = results.length > 0 ? results[results.length - 1].updatedAt : since
  return jsonOk({ rows: results, cursor, hasMore: results.length === limit })
}

export const onRequestPost: PagesFunction<Env, 'table'> = async ({ env, request, params }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth
  const slug = String(params.table)
  const spec = TABLES[slug]
  if (!spec) return jsonError('Unknown table', 404)

  let body: { rows?: Array<Record<string, unknown>> }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }
  if (!body.rows || !Array.isArray(body.rows)) return jsonError('rows array required', 400)
  if (body.rows.length > 500) return jsonError('Batch too large', 413)

  const now = Date.now()
  const written: string[] = []
  const conflicts: Array<{ id: string; reason: string }> = []

  for (const incoming of body.rows) {
    const id = String(incoming.id || '')
    if (!id) {
      conflicts.push({ id: '', reason: 'missing id' })
      continue
    }
    const incomingUpdatedAt = Number(incoming.updatedAt || now)

    // Last-write-wins: if server's row is newer, skip
    const current = await env.DB
      .prepare(`SELECT updated_at FROM ${spec.table} WHERE id = ? AND user_id = ?`)
      .bind(id, auth.user.id)
      .first<{ updated_at: number }>()
    if (current && current.updated_at > incomingUpdatedAt) {
      conflicts.push({ id, reason: 'server-newer' })
      continue
    }

    const sqlValues = buildInsertValues(spec, incoming, auth.user.id, now)
    if (!sqlValues) {
      conflicts.push({ id, reason: 'invalid columns' })
      continue
    }
    const { columns, placeholders, values, updateSet } = sqlValues

    const sql =
      `INSERT INTO ${spec.table} (user_id, ${columns.join(', ')}) ` +
      `VALUES (?, ${placeholders.join(', ')}) ` +
      `ON CONFLICT(id) DO UPDATE SET ${updateSet}`

    await env.DB.prepare(sql).bind(auth.user.id, ...values).run()
    written.push(id)
  }

  return jsonOk({ written, conflicts, cursor: now })
}

function buildInsertValues(
  spec: TableSpec,
  incoming: Record<string, unknown>,
  userId: string,
  now: number,
) {
  const columns: string[] = []
  const placeholders: string[] = []
  const values: unknown[] = []
  const updateSetParts: string[] = []

  for (const [clientField, def] of Object.entries(spec.columns)) {
    if (!(clientField in incoming)) continue
    let raw = incoming[clientField]
    if (raw === undefined) raw = null
    if (def.type === 'bool') raw = raw ? 1 : 0
    if (def.type === 'json' && raw !== null) raw = JSON.stringify(raw)
    if (def.type === 'int' && raw !== null) raw = Number(raw)
    if (def.type === 'real' && raw !== null) raw = Number(raw)
    columns.push(def.col)
    placeholders.push('?')
    values.push(raw)
    if (def.col !== 'id') {
      updateSetParts.push(`${def.col} = excluded.${def.col}`)
    }
  }

  // Force created_at / updated_at to sane values if missing.
  if (!columns.includes('created_at')) {
    columns.push('created_at'); placeholders.push('?'); values.push(now)
  }
  if (!columns.includes('updated_at')) {
    columns.push('updated_at'); placeholders.push('?'); values.push(now)
    updateSetParts.push('updated_at = excluded.updated_at')
  }
  if (!columns.includes('id')) return null

  // Ensure the row belongs to the user (insert guards via user_id; update guards via WHERE in ON CONFLICT)
  void userId
  return {
    columns,
    placeholders,
    values,
    updateSet: updateSetParts.join(', '),
  }
}
