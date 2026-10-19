import type { PagesFunction, Env } from '../../_lib/types'
import { googleConfigured, verifyGoogleToken } from '../../_lib/google'
import { jsonError } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'
import { socialSignIn } from '../../_lib/social'

// POST /api/auth/google { idToken }
// Sign in with Google from the iPhone app (account rules in _lib/social.ts). Off until GOOGLE_CLIENT_IDS is set.
export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  if (!googleConfigured(env)) return jsonError("Sign in with Google isn't available yet.", 503)
  let body: { idToken?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const who = body.idToken ? await verifyGoogleToken(env, body.idToken) : null
  if (!who) return jsonError("Couldn't confirm your Google account. Try again.", 401)
  return (await socialSignIn(env, request, 'google', who)).response
})
