// Blood-lettings (venesections and donations), newest first, live: the web's useBleeds (views/bloods/bleedFeed.ts),
// which can't be imported here because that file also builds the web's rows.
import { db } from '@shared/lib/db'
import { liveBleeds } from '@shared/lib/phlebotomy'
import { shared } from '@/data/useLog'

export const useBleeds = shared<ReturnType<typeof liveBleeds> | undefined>(
  async () => liveBleeds((await db.phlebotomies.toArray()).filter((p) => !p.deletedAtSync)),
  undefined,
)
