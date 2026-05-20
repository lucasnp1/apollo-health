// Admin-only invite-code management.

import type { PagesFunction, Env } from '../_lib/types'
import { jsonError, jsonOk, requireAdmin } from '../_lib/auth'

function randomCode(len = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // omit lookalikes (I,O,1,0)
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const auth = await requireAdmin(env, request)
  if (auth instanceof Response) return auth

  const rows = await env.DB
    .prepare(
      `SELECT code, created_by, used_by, used_at, expires_at, note, created_at
       FROM invite_codes ORDER BY created_at DESC LIMIT 200`,
    )
    .all<Record<string, unknown>>()
  return jsonOk({ invites: rows.results || [] })
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const auth = await requireAdmin(env, request)
  if (auth instanceof Response) return auth

  let body: { note?: string; expiresInDays?: number; count?: number } = {}
  try {
    body = await request.json()
  } catch {
    /* allow empty body */
  }
  const count = Math.max(1, Math.min(20, Number(body.count) || 1))
  const expiresInDays = Math.max(0, Number(body.expiresInDays) || 0)
  const note = (body.note || '').trim() || null
  const now = Date.now()
  const expiresAt = expiresInDays > 0 ? now + expiresInDays * 86_400_000 : null

  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = randomCode(8)
    await env.DB
      .prepare(
        `INSERT INTO invite_codes (code, created_by, expires_at, note, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(code, auth.user.id, expiresAt, note, now)
      .run()
    codes.push(code)
  }

  return jsonOk({ codes, expiresAt, note })
}

export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  const auth = await requireAdmin(env, request)
  if (auth instanceof Response) return auth
  const url = new URL(request.url)
  const code = (url.searchParams.get('code') || '').toUpperCase()
  if (!code) return jsonError('code query required', 400)
  await env.DB.prepare('DELETE FROM invite_codes WHERE code = ? AND used_by IS NULL').bind(code).run()
  return jsonOk({ code, deleted: true })
}
