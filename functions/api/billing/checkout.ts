import type { PagesFunction, Env } from '../../_lib/types'
import { jsonError, jsonOk, requireUser } from '../../_lib/auth'
import { stripeApi, stripeConfigured } from '../../_lib/stripe'

// POST /api/billing/checkout { plan: 'monthly' | 'lifetime' }
// Creates a Stripe Checkout Session for the current user and returns its URL.
// Monthly starts with a free month (card collected up front, first charge after
// the trial); lifetime is a one-time payment.
const KIND_TO_MODE = { monthly: 'subscription', lifetime: 'payment' } as const
type Kind = keyof typeof KIND_TO_MODE
const TRIAL_DAYS = 30

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth
  if (!stripeConfigured(env)) return jsonError('Billing not configured', 503)

  let body: { plan?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError('Bad request', 400)
  }

  const kind = body.plan as Kind
  if (kind !== 'monthly' && kind !== 'lifetime') {
    return jsonError('Unknown plan', 400)
  }

  const priceId = kind === 'monthly' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_LIFETIME
  if (!priceId) return jsonError('This plan is not configured yet', 503)

  const appUrl = env.APP_URL || new URL(request.url).origin
  const params: Record<string, string> = {
    mode: KIND_TO_MODE[kind],
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    client_reference_id: auth.user.id,
    customer_email: auth.user.email,
    success_url: `${appUrl}/app/?upgraded=1`,
    cancel_url: `${appUrl}/app/?upgrade_cancelled=1`,
    allow_promotion_codes: 'true',
    'metadata[user_id]': auth.user.id,
    'metadata[plan_kind]': kind,
  }
  // Stamp the user id on the subscription too, so renewal/cancel events map back,
  // and start with the free month.
  if (KIND_TO_MODE[kind] === 'subscription') {
    params['subscription_data[metadata][user_id]'] = auth.user.id
    params['subscription_data[trial_period_days]'] = String(TRIAL_DAYS)
  }

  try {
    const session = await stripeApi<{ url: string }>(env, 'POST', '/checkout/sessions', params)
    return jsonOk({ url: session.url })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Could not start checkout', 502)
  }
}
