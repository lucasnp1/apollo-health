// Recovery codes: the in-house way back into an account without email.
// Eight codes per set, each usable once, 12 characters from an alphabet with
// no look-alike letters (no 0/O, 1/I). Only SHA-256 hashes are stored.

import type { Env } from './types'
import { sha256Hex, uuid } from './crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_COUNT = 8

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

export async function hashCode(code: string): Promise<string> {
  return sha256Hex(`apollo-recovery:${normalizeCode(code)}`)
}

// Replace the user's whole set and return the plaintext codes (shown once).
export async function issueCodes(env: Env, userId: string): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, generateCode)
  const now = Date.now()
  const inserts = await Promise.all(
    codes.map(async (c) =>
      env.DB.prepare('INSERT INTO recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)').bind(uuid(), userId, await hashCode(c), now),
    ),
  )
  await env.DB.batch([env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(userId), ...inserts])
  return codes
}

// Burn a code. Returns false when it does not match an unused code.
export async function consumeCode(env: Env, userId: string, code: string): Promise<boolean> {
  if (normalizeCode(code).length < 8) return false
  const row = await env.DB
    .prepare('SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL')
    .bind(userId, await hashCode(code))
    .first<{ id: string }>()
  if (!row) return false
  const res = await env.DB.prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(Date.now(), row.id).run()
  return ((res.meta as { changes?: number } | undefined)?.changes ?? 0) === 1
}

export async function remainingCodes(env: Env, userId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL').bind(userId).first<{ n: number }>()
  return r?.n ?? 0
}
