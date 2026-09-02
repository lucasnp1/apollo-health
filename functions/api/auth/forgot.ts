import type { PagesFunction, Env } from '../../_lib/types'
import { randomToken, sha256Hex } from '../../_lib/crypto'
import { ipHash, jsonError, jsonOk } from '../../_lib/auth'
import { wrap } from '../../_lib/handler'
import { mailConfigured, passwordResetMail, sendMail } from '../../_lib/mail'

// POST /api/auth/forgot { email }
// Always answers 200 with the same shape whether or not the email is
// registered (no enumeration). `delivery` only reflects server config:
//   'email'       — a link was sent if the account exists
//   'unavailable' — the mail path isn't configured yet; the UI shows a contact
const TOKEN_TTL_MS = 60 * 60 * 1000 // 60 minutes
const THROTTLE_WINDOW_MS = 10 * 60 * 1000
const THROTTLE_THRESHOLD = 5

export const onRequestPost: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid request', 400)
  }
  const email = (body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return jsonError('Enter the email you signed up with', 400)

  const iph = await ipHash(request)
  const now = Date.now()

  if (iph) {
    const recent = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ip_hash = ? AND action = 'reset_request' AND at > ?`)
      .bind(iph, now - THROTTLE_WINDOW_MS)
      .first<{ n: number }>()
    if (recent && recent.n >= THROTTLE_THRESHOLD) {
      return jsonError('Too many requests. Try again in a few minutes.', 429, {}, { 'Retry-After': '600' })
    }
  }

  await env.DB
    .prepare('INSERT INTO audit_log (user_id, action, meta, ip_hash, at) VALUES (?, ?, ?, ?, ?)')
    .bind(null, 'reset_request', null, iph, now)
    .run()

  const delivery = mailConfigured(env) ? 'email' : 'unavailable'
  if (delivery === 'unavailable') return jsonOk({ ok: true, delivery })

  const user = await env.DB
    .prepare('SELECT id, email FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string }>()

  if (user) {
    const token = randomToken(32)
    const tokenHash = await sha256Hex(token)
    // A new request supersedes any unused link for this account.
    await env.DB.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').bind(user.id).run()
    await env.DB
      .prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenHash, user.id, now + TOKEN_TTL_MS, now, iph)
      .run()

    const origin = env.APP_URL || new URL(request.url).origin
    const link = `${origin.replace(/\/$/, '')}/app/reset?token=${encodeURIComponent(token)}`
    try {
      await sendMail(env, { to: user.email, ...passwordResetMail(link) })
    } catch (err) {
      console.error('[forgot] mail send failed', err)
      return jsonError('Could not send the email right now. Try again in a minute.', 502)
    }
  }

  return jsonOk({ ok: true, delivery })
})
