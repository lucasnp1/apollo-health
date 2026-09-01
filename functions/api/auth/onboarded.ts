import type { PagesFunction, Env } from '../../_lib/types'
import { jsonOk, requireUser } from '../../_lib/auth'

// POST /api/auth/onboarded — records that this account has seen the first-run
// onboarding, so it never shows again (on any device). Idempotent.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth

  await env.DB
    .prepare('UPDATE users SET onboarded_at = COALESCE(onboarded_at, ?) WHERE id = ?')
    .bind(Date.now(), auth.user.id)
    .run()

  return jsonOk({ ok: true })
}
