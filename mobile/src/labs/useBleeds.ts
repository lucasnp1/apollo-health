// Blood-lettings (venesections and donations), newest first, live: the web's useBleeds (views/bloods/bleedFeed.ts),
// which can't be imported here because that file also builds the web's rows.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@shared/lib/db'
import { liveBleeds } from '@shared/lib/phlebotomy'

export const useBleeds = () => useLiveQuery(async () => liveBleeds(await db.phlebotomies.filter((p) => !p.deletedAtSync).toArray()), [])
