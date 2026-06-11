// Session-cookie auth helpers used by every protected endpoint.

import type { AuthedUser, Env } from './types'
import { sha256Hex } from './crypto'

const COOKIE_NAME = 'apollo_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function sessionCookie(token: string, maxAgeMs: number = SESSION_TTL_MS): string {
  const maxAge = Math.floor(maxAgeMs / 1000)
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

export function expiredCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(name + '=')) return trimmed.slice(name.length + 1)
  }
  return null
}

export async function readSession(env: Env, request: Request): Promise<AuthedUser | null> {
  const token = readCookie(request, COOKIE_NAME)
  if (!token) return null

  const row = await env.DB
    .prepare(
      `SELECT u.id, u.email, u.is_admin, u.display_name, s.expires_at
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ?`,
    )
    .bind(token)
    .first<{ id: string; email: string; is_admin: number; display_name: string | null; expires_at: number }>()

  if (!row) return null
  if (row.expires_at < Date.now()) {
    // Soft-delete expired session
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
    return null
  }

  return { id: row.id, email: row.email, is_admin: row.is_admin, display_name: row.display_name }
}

export async function requireUser(env: Env, request: Request): Promise<{ user: AuthedUser } | Response> {
  const user = await readSession(env, request)
  if (!user) return jsonError('Unauthorized', 401)
  return { user }
}

export async function requireAdmin(env: Env, request: Request): Promise<{ user: AuthedUser } | Response> {
  const result = await requireUser(env, request)
  if (result instanceof Response) return result
  if (!result.user.is_admin) return jsonError('Forbidden', 403)
  return result
}

export async function ipHash(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || ''
  return ip ? (await sha256Hex(ip)).slice(0, 16) : ''
}

export function jsonOk<T extends object>(body: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
}

export function jsonError(
  message: string,
  status: number,
  extra: object = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export function sessionTtlMs(): number {
  return SESSION_TTL_MS
}
