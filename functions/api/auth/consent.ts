import type { PagesFunction, Env } from '../../_lib/types'
import { jsonOk, requireUser } from '../../_lib/auth'

// POST /api/auth/consent — the person agreed, on the app's consent screen, to back their health log up to their Magno
// account. Records when (the first yes is kept). Withdrawing it is deleting the account (You > Delete account).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth

  await env.DB
    .prepare('UPDATE users SET health_consent_at = COALESCE(health_consent_at, ?) WHERE id = ?')
    .bind(Date.now(), auth.user.id)
    .run()

  return jsonOk({ ok: true })
}
