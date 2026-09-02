// Dependency-free Stripe helpers for Cloudflare Pages Functions.
// We talk to Stripe over plain fetch (form-encoded) and verify webhook
// signatures with Web Crypto — no SDK, matching the rest of functions/.

import type { Env } from './types'

const STRIPE_API = 'https://api.stripe.com/v1'

// Billing is only "live" when the owner has flipped BILLING_ENABLED and the
// secret key is present. Until then every user is treated as Pro (nothing gated).
export function billingActive(env: Env): boolean {
  return env.BILLING_ENABLED === '1' && !!env.STRIPE_SECRET_KEY
}

export function stripeConfigured(env: Env): boolean {
  return !!env.STRIPE_SECRET_KEY
}

// Effective Pro status for a user row. Admins are always Pro. When billing is
// not live, everyone is Pro. A subscription is Pro only while unexpired.
export function isProUser(
  env: Env,
  row: { is_admin?: number; plan?: string | null; plan_until?: number | null },
): boolean {
  if (!billingActive(env)) return true
  if (row.is_admin === 1) return true
  if (row.plan !== 'pro') return false
  return row.plan_until == null || row.plan_until > Date.now()
}

// Minimal form-encoded Stripe API call.
export async function stripeApi<T = Record<string, unknown>>(
  env: Env,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const body = params ? new URLSearchParams(params).toString() : undefined
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const json = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json?.error?.message || `Stripe request failed (${res.status})`)
  return json
}

// Verify a Stripe-Signature header ("t=…,v1=…") against the raw payload.
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false
  const parts: Record<string, string> = {}
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=')
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim()
  }
  const t = parts['t']
  const v1 = parts['v1']
  if (!t || !v1) return false

  // Reject signatures older than 5 minutes (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(t))
  if (!Number.isFinite(age) || age > 300) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')

  if (expected.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i)
  return diff === 0
}
