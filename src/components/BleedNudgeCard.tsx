// Home's blood-letting line: shown only when the newest test has high
// hematocrit with no bleed logged since, or a bleed is waiting on its retest.
// Taps through to Bloods, where bleeds are logged and read.

import { useMemo } from 'react'
import { Droplets } from 'lucide-react'
import { useBloodTests } from '../lib/useBloodTests'
import { dayOf } from '../lib/dates'
import { bleedNudge, hctSeries } from '../lib/phlebotomy'
import { useBleeds } from '../views/bloods/bleedFeed'
import { FeedList, FeedRow } from './FeedList'

export function BleedNudgeCard({ onOpen }: { onOpen: () => void }) {
  const tests = useBloodTests()
  const bleeds = useBleeds()
  const nudge = useMemo(
    () => (tests && bleeds ? bleedNudge(hctSeries(tests), bleeds, dayOf(new Date().toISOString())) : undefined),
    [tests, bleeds],
  )
  if (!nudge) return null
  return (
    <div className="reveal rounded-xl border border-border bg-card px-2 py-1 shadow-[var(--shadow-card)]">
      <FeedList>
        <FeedRow
          icon={Droplets}
          iconTone={nudge.tone === 'warn' ? 'warn' : 'accent'}
          title={nudge.title}
          sub={nudge.sub}
          status={nudge.tone === 'warn' ? { label: 'High', tone: 'warn' } : { label: 'Retest', tone: 'neutral' }}
          onClick={onOpen}
        />
      </FeedList>
    </div>
  )
}
