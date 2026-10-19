import type { PagesFunction, Env } from '../../_lib/types'
import { exchangeCode, verifyIdentityToken } from '../../_lib/apple'
import { jsonError } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'
import { socialSignIn } from '../../_lib/social'

// POST /api/auth/apple { identityToken, authorizationCode? }
// Sign in with Apple from the iPhone app (account rules in _lib/social.ts). The authorization code becomes a refresh
// token, kept only to revoke the Apple login if the account is deleted; that needs the Sign in with Apple key.
export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env, waitUntil }) => {
  let body: { identityToken?: string; authorizationCode?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const who = body.identityToken ? await verifyIdentityToken(env, body.identityToken) : null
  if (!who) return jsonError("Couldn't confirm your Apple ID. Try again.", 401)

  const { user, response } = await socialSignIn(env, request, 'apple', who)
  if (body.authorizationCode) {
    waitUntil(
      exchangeCode(env, body.authorizationCode)
        .then((t) => t && env.DB.prepare('UPDATE users SET apple_refresh_token = ? WHERE id = ?').bind(t, user.id).run())
        .catch((err) => console.warn('[apple] could not keep the refresh token', err)),
    )
  }
  return response
})
