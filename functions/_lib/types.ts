// Shared type declarations for Pages Functions.

export type Env = {
  DB: D1Database
}

export type AuthedUser = {
  id: string
  email: string
  is_admin: number
  display_name: string | null
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
