import type { PagesFunction, Env } from './_lib/types'
import { countHit, isPageView } from './_lib/hits'

// /read is a static page (read.html). This only counts the view, then hands
// the request on to the asset.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (isPageView(ctx.request)) countHit(ctx.env, ctx, '/read')
  return ctx.next()
}
