// Tiny fetch wrapper that always sends the session cookie and parses JSON.

export type ApiUser = {
  id: string
  email: string
  is_admin: number
  display_name: string | null
}

export class ApiError extends Error {
  status: number
  payload?: unknown
  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  const response = await fetch(path, init)
  const text = await response.text()
  const json = text ? safeJson(text) : null
  if (!response.ok) {
    const message =
      (json && typeof json === 'object' && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : null) ||
      `Request failed (${response.status})`
    throw new ApiError(message, response.status, json)
  }
  return json as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

export type AuthMe = { user: ApiUser | null }
export type LoginPayload = { email: string; password: string }
export type SignupPayload = { email: string; password: string; invite: string; displayName?: string }
