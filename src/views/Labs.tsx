// Bloods: the route shell. One test is one blood draw; screens are hash
// routes so pushed screens get the back gesture and Timeline can deep-link:
//   '' / #latest, #tests, #markers      home tabs
//   #test/<id>                          one test's report
//   #marker/<key>[/<examId>]            one marker over time

import { useEffect, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { ChevronLeft, Droplet, FileText, Keyboard, Upload } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useBloodTests } from '../lib/useBloodTests'
import { usePlan } from '../lib/plan'
import { FeedList, FeedRow } from '../components/FeedList'
import { PanelCard } from '../components/dashboard/PanelCard'
import { Button } from '@/components/ui/button'
import { BloodsHome } from './bloods/BloodsHome'
import { MergeDialog, TestReport } from './bloods/TestReport'
import { MarkerScreen } from './bloods/MarkerScreen'
import { valueTitle } from './bloods/feed'
import { parseBloodsHash, type Route } from './bloods/route'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  window.addEventListener('popstate', cb)
  return () => {
    window.removeEventListener('hashchange', cb)
    window.removeEventListener('popstate', cb)
  }
}

/** Move to a Bloods hash. Pushes a history entry unless `replace`; pushed entries are marked so BackBar knows it can go back. */
function goBloods(hash: string, replace = false) {
  if (hash === window.location.hash) return
  const url = `${window.location.pathname}${window.location.search}${hash}`
  if (replace) window.history.replaceState(window.history.state, '', url)
  else window.history.pushState({ bloods: true }, '', url)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function useBloodsRoute(): [Route, typeof goBloods] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return [parseBloodsHash(hash), goBloods]
}

function BackBar({ ref }: { ref?: Ref<HTMLButtonElement> }) {
  return (
    <Button
      ref={ref}
      aria-label="Back to Bloods"
      variant="ghost"
      className="-ml-2 h-10 self-start px-2 text-muted-foreground"
      // Deep links (Timeline) have nothing of ours to go back to.
      onClick={() => (window.history.state?.bloods ? window.history.back() : goBloods('#latest', true))}
    >
      <ChevronLeft className="size-4" /> Bloods
    </Button>
  )
}

function Empty({ isPro, onImport, onManual }: { isPro: boolean; onImport: () => void; onManual: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PanelCard>
        <h2 className="font-display text-xl font-semibold leading-tight">Your bloods, one test at a time</h2>
        <p className="feed-note mt-2 text-muted-foreground">
          Add a test and Magno keeps it as its own dated report, reads it and shows what changed next time.
        </p>
        <FeedList className="mt-3">
          <FeedRow icon={Upload} title="Import a PDF or photo" sub="Magno reads the values, units and ranges" status={isPro ? undefined : { label: 'Pro', tone: 'neutral' }} onClick={onImport} />
          <FeedRow icon={Keyboard} title="Type results in" sub="From a printed or emailed report" onClick={onManual} />
        </FeedList>
      </PanelCard>
      <PanelCard title="What a test looks like">
        <FeedList>
          <FeedRow icon={Droplet} title={valueTitle('Hematocrit', '51.2', '%')} sub="In the lab range, over the 50% line people on a protocol watch" status={{ label: 'Watch', tone: 'warn' }} facts={['Retest at trough within 8 weeks']} />
        </FeedList>
      </PanelCard>
      <PanelCard title="What to ask for on a protocol">
        <p className="feed-note text-foreground/90">
          Total and free testosterone with SHBG, estradiol (sensitive), full blood count, PSA, lipids, ALT and GGT, creatinine and eGFR, HbA1c.
        </p>
        <p className="feed-note mt-2 text-muted-foreground">
          When to draw: the morning your next injection is due, before you inject. Fasted, well hydrated, no hard training for 48 hours.
        </p>
      </PanelCard>
    </div>
  )
}

export function Labs({ onImport, onManual, onReviewFile, onEdit, onReviewRead }: {
  onImport: () => void
  onManual: () => void
  onReviewFile: (id: number) => void
  onEdit: (examId: number) => void
  /** Set while a /read result carried through sign-up is waiting to be saved. */
  onReviewRead?: () => void
}) {
  const { isPro } = usePlan()
  // undefined while Dexie loads, so the empty state never flashes over real tests.
  const tests = useBloodTests()
  const [route, go] = useBloodsRoute()
  const [mergeId, setMergeId] = useState<number>()
  // A parsed report that was never imported (the review sheet was closed).
  const pending = useLiveQuery(() => db.files.filter((f) => f.status === 'Needs review' && !!f.extractedText && !f.archivedAt && !f.deletedAtSync).first(), [])

  const screen = route.kind === 'home' ? route.tab : route.kind === 'test' ? `t${route.id}` : `m${route.key}`
  const loading = tests === undefined
  const backRef = useRef<HTMLButtonElement>(null)
  // Pushed screens open at the top, with focus on Back so a screen reader lands on the new screen.
  useEffect(() => {
    if (route.kind !== 'home' && !loading) {
      window.scrollTo(0, 0)
      backRef.current?.focus({ preventScroll: true })
    }
  }, [screen, route.kind, loading])

  const pendingRow = (pending?.id !== undefined || onReviewRead) && (
    <FeedList>
      {onReviewRead && <FeedRow icon={FileText} title="Your read is waiting" sub="Check the draw date and lab, then save it" onClick={onReviewRead} />}
      {pending?.id !== undefined && <FeedRow icon={FileText} title="A report is ready to review" sub="Check the values before they are saved" onClick={() => onReviewFile(pending.id!)} />}
    </FeedList>
  )

  if (tests === undefined) return <div className="min-h-[40dvh]" />

  const mergeTest = mergeId !== undefined ? tests.find((t) => t.id === mergeId) : undefined
  const merge = mergeTest && <MergeDialog test={mergeTest} tests={tests} go={go} onClose={() => setMergeId(undefined)} />

  if (route.kind === 'home') {
    return (
      <div className="flex flex-col gap-4">
        {pendingRow}
        {tests.length === 0
          ? <Empty isPro={isPro} onImport={onImport} onManual={onManual} />
          : <BloodsHome tests={tests} isPro={isPro} tab={route.tab} onTab={(t) => go(t === 'latest' ? '#latest' : `#${t}`, true)} go={go} onEdit={onEdit} onMerge={setMergeId} />}
        {merge}
      </div>
    )
  }

  const test = route.kind === 'test' ? tests.find((t) => t.id === route.id) : undefined
  return (
    <div className="flex flex-col gap-3">
      <BackBar ref={backRef} />
      {route.kind === 'test' && (test
        ? <TestReport key={test.id} test={test} tests={tests} isPro={isPro} go={go} onEdit={onEdit} onMerge={setMergeId} />
        : <PanelCard><p className="feed-note text-muted-foreground">This test is not on file. It may have been archived.</p></PanelCard>)}
      {route.kind === 'marker' && <MarkerScreen key={route.key} markerKey={route.key} focusExamId={route.examId} tests={tests} isPro={isPro} go={go} onEdit={onEdit} />}
      {merge}
    </div>
  )
}
