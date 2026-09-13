import type { PagesFunction, Env } from '../_lib/types'
import { countHit, isPageView } from '../_lib/hits'

// Guides are static pages under public/guides. Count the view, serve the asset.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (isPageView(ctx.request)) {
    const path = new URL(ctx.request.url).pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/guides'
    countHit(ctx.env, ctx, path.slice(0, 80))
  }
  return ctx.next()
}
