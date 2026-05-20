const protectedHost = 'apollo-health-5fe.pages.dev'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/local-seed/') && url.hostname !== protectedHost) {
      return new Response('Not found', {
        status: 404,
        headers: {
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex',
        },
      })
    }

    return env.ASSETS.fetch(request)
  },
}
