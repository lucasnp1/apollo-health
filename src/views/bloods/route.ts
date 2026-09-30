// Bloods hash routes, pure so node can check them. Marker keys are encoded,
// so a '/' or '%' in a key can neither split the route nor crash the decode.

export type HomeTab = 'latest' | 'tests' | 'markers'

export type Route =
  | { kind: 'home'; tab: HomeTab }
  | { kind: 'test'; id: number }
  | { kind: 'marker'; key: string; examId?: number }
  | { kind: 'compare'; newerId?: number; olderId?: number }
  | { kind: 'report'; id: number }

export const markerHash = (key: string, examId?: number) =>
  `#marker/${encodeURIComponent(key)}${examId ? `/${examId}` : ''}`

export function parseBloodsHash(hash: string): Route {
  let parts: string[]
  // A hand-edited hash with a stray '%' must not take the app down.
  try { parts = hash.replace(/^#/, '').split('/').map(decodeURIComponent) } catch { return { kind: 'home', tab: 'latest' } }
  const [head, a, b] = parts
  if (head === 'test' && Number(a) > 0) return { kind: 'test', id: Number(a) }
  if (head === 'marker' && a) return { kind: 'marker', key: a, examId: Number(b) > 0 ? Number(b) : undefined }
  if (head === 'compare') return { kind: 'compare', newerId: Number(a) > 0 ? Number(a) : undefined, olderId: Number(b) > 0 ? Number(b) : undefined }
  if (head === 'report' && Number(a) > 0) return { kind: 'report', id: Number(a) }
  return { kind: 'home', tab: head === 'tests' || head === 'markers' ? head : 'latest' }
}

export const compareHash = (newerId: number, olderId?: number) => `#compare/${newerId}${olderId ? `/${olderId}` : ''}`
