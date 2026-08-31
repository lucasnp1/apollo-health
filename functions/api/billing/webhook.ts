import type { PagesFunction, Env } from '../../_lib/types'
import { stripeApi, verifyStripeSignature } from '../../_lib/stripe'

// POST /api/billing/webhook — Stripe events. Verifies the signature, then keeps
// each user's plan in sync. Returns 200 on success (or ignored events), 400 on a
// bad signature, 500 so Stripe retries a transient handler failure.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('not configured', { status: 503 })

  const payload = await request.text()
  const valid = await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), secret)
  if (!valid) return new Response('bad signature', { status: 400 })

  let event: { type?: string; data?: { object?: Record<string, unknown> } }
  try {
    event = JSON.parse(payload)
  } catch {
    return new Response('bad json', { status: 400 })
  }
  const obj = (event.data?.object ?? {}) as Record<string, unknown>

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = (obj.client_reference_id as string) || ((obj.metadata as Record<string, string>)?.user_id)
        if (!userId) break
        const mode = obj.mode as string
        const kind = (obj.metadata as Record<string, string>)?.plan_kind || (mode === 'payment' ? 'lifetime' : 'monthly')
        const customer = (obj.customer as string) || null
        const subId = (obj.subscription as string) || null

        let planUntil: number | null = null
        if (mode === 'subscription' && subId) {
          const sub = await stripeApi<{ current_period_end?: number }>(env, 'GET', `/subscriptions/${subId}`)
          planUntil = sub.current_period_end ? sub.current_period_end * 1000 : null
        }

        await env.DB.prepare(
          `UPDATE users SET plan='pro', plan_kind=?, plan_until=?, stripe_customer_id=COALESCE(?, stripe_customer_id), stripe_subscription_id=?, updated_at=? WHERE id=?`,
        ).bind(kind, planUntil, customer, subId, Date.now(), userId).run()
        break
      }

      case 'customer.subscription.updated': {
        const subId = obj.id as string
        const status = obj.status as string
        const periodEnd = obj.current_period_end as number | undefined
        const active = ['active', 'trialing', 'past_due'].includes(status)
        await env.DB.prepare(
          `UPDATE users SET plan=?, plan_until=?, updated_at=? WHERE stripe_subscription_id=?`,
        ).bind(active ? 'pro' : 'free', periodEnd ? periodEnd * 1000 : null, Date.now(), subId).run()
        break
      }

      case 'customer.subscription.deleted': {
        const subId = obj.id as string
        await env.DB.prepare(
          `UPDATE users SET plan='free', plan_until=?, updated_at=? WHERE stripe_subscription_id=?`,
        ).bind(Date.now(), Date.now(), subId).run()
        break
      }

      default:
        // Ignore other event types.
        break
    }
  } catch {
    return new Response('handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
