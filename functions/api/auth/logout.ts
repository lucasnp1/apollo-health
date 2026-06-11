import type { PagesFunction, Env } from '../../_lib/types'
import { expiredCookie, ipHash, jsonOk } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  // Remove the current session if cookie present + record the logout in
  // the audit trail. Order matters: look up the user_id before deleting
  // the session so we can attribute the audit row.
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(/apollo_session=([^;]+)/)
  if (match) {
    const token = match[1]
    const row = await env.DB
      .prepare('SELECT user_id FROM sessions WHERE token = ?')
      .bind(token)
      .first<{ user_id: string }>()
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
    if (row?.user_id) {
      const iph = await ipHash(request)
      await env.DB
        .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
        .bind(row.user_id, 'logout', null, iph, Date.now())
        .run()
    }
  }
  return jsonOk({ ok: true }, { headers: { 'Set-Cookie': expiredCookie() } })
})
