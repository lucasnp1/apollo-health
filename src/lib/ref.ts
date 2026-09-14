// First-party attribution without trackers. A single short word says which
// of our own links someone arrived from ("read", "guide-hematocrit",
// "reddit"). It rides along in sessionStorage until sign-up, where it is
// stored as users.signup_source. Nothing else about the visit is kept.

const KEY = 'apollo.ref'
const OK = /^[a-z0-9_-]{1,32}$/

function isValidRef(s: unknown): s is string {
  return typeof s === 'string' && OK.test(s)
}

// Read ?ref= (or utm_source[_utm_campaign]) from the current URL, remember it
// for this tab, and return the ref in force (new or previously stored).
export function captureRef(): string | undefined {
  try {
    const p = new URLSearchParams(window.location.search)
    let ref = p.get('ref') ?? ''
    if (!ref && p.get('utm_source')) ref = [p.get('utm_source'), p.get('utm_campaign')].filter(Boolean).join('_')
    ref = ref.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32)
    if (isValidRef(ref)) {
      sessionStorage.setItem(KEY, ref)
      return ref
    }
    return storedRef()
  } catch {
    return undefined
  }
}

function storedRef(): string | undefined {
  try {
    const s = sessionStorage.getItem(KEY) ?? ''
    return isValidRef(s) ? s : undefined
  } catch {
    return undefined
  }
}

// Append ref= to one of our own links. `fallback` names the page the link
// sits on, used when nothing was captured earlier in the visit.
export function withRef(href: string, fallback?: string): string {
  const ref = storedRef() ?? fallback
  if (!ref) return href
  const [path, hash = ''] = href.split('#')
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}ref=${encodeURIComponent(ref)}${hash ? `#${hash}` : ''}`
}
