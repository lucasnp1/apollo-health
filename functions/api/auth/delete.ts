import type { PagesFunction, Env } from '../../_lib/types'
import { verifyPassword, type HashAlgorithm } from '../../_lib/crypto'
import { expiredCookie, ipHash, jsonError, jsonOk, requireUser } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'
import { stripeApi, stripeConfigured } from '../../_lib/stripe'

// POST /api/auth/delete { password }
// Permanently deletes the account and every row that belongs to it. The
// password is re-checked so a borrowed phone can't wipe someone's history.
// Order: cancel billing (best effort) -> drop file blobs -> delete rows.

// Every table that carries a user_id. Kept explicit rather than trusting
// ON DELETE CASCADE so the wipe is complete even if a table was created
// without the foreign key.
const USER_TABLES = [
  'compounds', 'injections', 'vitals', 'exams', 'results', 'files',
  'protocols', 'protocol_doses', 'vials', 'symptoms', 'marker_targets',
  'goals', 'body_metrics', 'password_resets', 'recovery_codes', 'feedback', 'audit_log', 'sessions',
]

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const password = body.password || ''
  if (!password) return jsonError('Enter your password to confirm', 400)

  const row = await env.DB
    .prepare('SELECT password_hash, password_salt, iterations, algorithm, stripe_customer_id FROM users WHERE id = ?')
    .bind(auth.user.id)
    .first<{ password_hash: string; password_salt: string; iterations: number; algorithm: string; stripe_customer_id: string | null }>()
  if (!row) return jsonError('Unauthorized', 401)

  const ok = await verifyPassword((row.algorithm as HashAlgorithm) ?? 'pbkdf2', password, row.password_salt, row.password_hash, row.iterations)
  if (!ok) return jsonError('Password is incorrect', 401)

  const userId = auth.user.id
  const now = Date.now()
  const iph = await ipHash(request)

  // 1) Billing: deleting the Stripe customer also cancels any live subscription.
  if (stripeConfigured(env) && row.stripe_customer_id) {
    try {
      await stripeApi(env, 'DELETE', `/customers/${encodeURIComponent(row.stripe_customer_id)}`)
    } catch (err) {
      console.warn('[delete] stripe customer delete failed', userId, err)
    }
  }

  // 2) File blobs in R2 (when the bucket is bound).
  if (env.FILES) {
    const keys = await env.DB
      .prepare('SELECT r2_key FROM files WHERE user_id = ? AND r2_key IS NOT NULL')
      .bind(userId)
      .all<{ r2_key: string }>()
    const list = (keys.results ?? []).map((k) => k.r2_key)
    for (let i = 0; i < list.length; i += 100) {
      try {
        await env.FILES.delete(list.slice(i, i + 100))
      } catch (err) {
        console.warn('[delete] r2 delete failed', userId, err)
      }
    }
  }

  // 3) Database rows, then the user itself. One anonymous audit row remains
  //    so we can count deletions without keeping anything about who left.
  await env.DB.batch([
    ...USER_TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(userId)),
    env.DB.prepare('UPDATE invite_codes SET used_by = NULL WHERE used_by = ?').bind(userId),
    env.DB.prepare('UPDATE invite_codes SET created_by = NULL WHERE created_by = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    env.DB
      .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
      .bind(null, 'account_deleted', null, iph, now),
  ])

  return jsonOk({ ok: true }, { headers: { 'Set-Cookie': expiredCookie() } })
})
