import type { PagesFunction, Env } from '../../_lib/types'
import { jsonOk, readSession } from '../../_lib/auth'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await readSession(env, request)
  return jsonOk({ user: user ?? null })
}
