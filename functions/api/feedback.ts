import type { PagesFunction, Env } from '../_lib/types'
import { jsonError, jsonOk, requireAdmin, requireUser } from '../_lib/auth'
import { uuid } from '../_lib/crypto'

// POST /api/feedback { message } — a signed-in user sends feedback. Stored
// server-side (no email app, no external service). Their account email is
// captured automatically from the session.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth

  let body: { message?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Bad request', 400)
  }
  const message = (body.message || '').trim().slice(0, 4000)
  if (!message) return jsonError('Message is empty', 400)

  const ua = request.headers.get('User-Agent')?.slice(0, 300) ?? null
  await env.DB
    .prepare('INSERT INTO feedback (id, user_id, email, message, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(uuid(), auth.user.id, auth.user.email, message, ua, Date.now())
    .run()

  return jsonOk({ ok: true })
}

// GET /api/feedback — admin only. Read recent submissions (newest first).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireAdmin(env, request)
  if (auth instanceof Response) return auth

  const rows = await env.DB
    .prepare('SELECT email, message, user_agent, created_at FROM feedback ORDER BY created_at DESC LIMIT 200')
    .all()
  return jsonOk({ feedback: rows.results ?? [] })
}
