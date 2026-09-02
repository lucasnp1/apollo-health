import type { PagesFunction, Env } from '../../../_lib/types'
import { jsonOk, requireUser } from '../../../_lib/auth'
import { wrap } from '../../../_lib/handler'
import { CODE_COUNT, remainingCodes } from '../../../_lib/recovery'

// GET /api/auth/recovery/status -> how many unused recovery codes are left.
export const onRequestGet: PagesFunction<Env> = wrap<Env>(async ({ request, env }) => {
  const auth = await requireUser(env, request)
  if (auth instanceof Response) return auth
  return jsonOk({ remaining: await remainingCodes(env, auth.user.id), total: CODE_COUNT })
})
