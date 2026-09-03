// Shared type declarations for Pages Functions.

export type Env = {
  DB: D1Database
  // Static assets of the deployment (Pages provides this binding).
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  FILES?: R2Bucket // optional until the bucket binding is configured.
  // Billing (Stripe). All optional; gating is off until BILLING_ENABLED === '1'
  // and STRIPE_SECRET_KEY is set. Add these as Cloudflare Pages secrets.
  BILLING_ENABLED?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_MONTHLY?: string
  STRIPE_PRICE_LIFETIME?: string
  APP_URL?: string // e.g. https://apollo-hq.pages.dev (checkout return URLs, reset links)
  // Transactional email (password resets) via Resend. Dormant until both are set.
  RESEND_API_KEY?: string
  MAIL_FROM?: string // e.g. "Apollo Health <no-reply@example.com>"
}

// Minimal R2Bucket interface — avoids needing @cloudflare/workers-types here.
export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | Blob | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2Object | null>
  get(key: string): Promise<R2ObjectBody | null>
  delete(keys: string | string[]): Promise<void>
  head(key: string): Promise<R2Object | null>
}

export interface R2Object {
  key: string
  size: number
  etag: string
  httpEtag: string
  uploaded: Date
  httpMetadata?: { contentType?: string }
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream
  arrayBuffer(): Promise<ArrayBuffer>
  blob(): Promise<Blob>
}

export type AuthedUser = {
  id: string
  email: string
  is_admin: number
  display_name: string | null
  // Billing (populated by readSession). is_pro is the effective gate.
  plan?: string
  plan_kind?: string | null
  plan_until?: number | null
  is_pro?: boolean
  // First-run onboarding — true once the account has seen it.
  onboarded?: boolean
}

// PagesFunction handler type (matches Cloudflare's @cloudflare/workers-types).
export type PagesFunction<E = Env, P extends string = never, D extends Record<string, unknown> = Record<string, unknown>> = (
  context: EventContext<E, P, D>,
) => Response | Promise<Response>

export type EventContext<E, P extends string, D extends Record<string, unknown>> = {
  request: Request
  env: E
  params: Record<P, string | string[]>
  data: D & { user?: AuthedUser }
  waitUntil: (promise: Promise<unknown>) => void
  next: () => Promise<Response>
  functionPath: string
}

// Minimal D1Database interface (avoids needing @cloudflare/workers-types dep here).
export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
  exec(query: string): Promise<D1ExecResult>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run(): Promise<D1Result>
  all<T = unknown>(): Promise<D1Result<T>>
  raw<T = unknown>(): Promise<T[]>
}

export interface D1Result<T = unknown> {
  results?: T[]
  success: boolean
  meta?: Record<string, unknown>
}

export interface D1ExecResult {
  count: number
  duration: number
}
