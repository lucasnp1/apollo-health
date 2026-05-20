// Shared type declarations for Pages Functions.

export type Env = {
  DB: D1Database
  FILES?: R2Bucket // optional until the bucket binding is configured.
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
