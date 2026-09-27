// Anonymous funnel counting for the public /read tool.
//
// One integer per event per day, server side. No cookie, no id, no session,
// nothing that identifies a person — the server cannot tell two readers apart.
// It answers one question: of the people who open /read, how many finish a
// read and how many act on it.
//
// sendBeacon so a click that navigates away still records.

export type TrackEvent =
  | 'read-started'
  | 'read-completed'
  | 'read-empty'
  | 'read-failed'
  | 'read-share'
  | 'read-save'

export function track(name: TrackEvent): void {
  try {
    const body = JSON.stringify({ name })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }))
      return
    }
    void fetch('/api/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Counting must never break the thing being counted.
  }
}
