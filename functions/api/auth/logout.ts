import type { PagesFunction, Env } from '../../_lib/types'
import { expiredCookie, jsonOk } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  // Remove the current session if cookie present (best-effort).
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/apollo_session=([^;]+)/)
  if (match) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(match[1]).run()
  }
  return jsonOk({ ok: true }, { headers: { 'Set-Cookie': expiredCookie() } })
})
