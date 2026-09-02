import type { PagesFunction, Env } from './_lib/types'

// GET / — the marketing landing page lives here as a static file. Someone
// who is already signed in almost certainly wants the app, so send them to
// /app/ before the landing even renders. `?stay=1` shows the landing anyway.
export const onRequestGet: PagesFunction<Env> = async ({ request, next }) => {
  const url = new URL(request.url)
  const cookie = request.headers.get('Cookie') || ''
  const signedIn = /(?:^|;\s*)apollo_session=[^;]+/.test(cookie)
  if (signedIn && url.searchParams.get('stay') !== '1') {
    return Response.redirect(`${url.origin}/app/`, 302)
  }
  return next()
}
