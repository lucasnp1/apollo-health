// Bloods home: Latest (a summary of the newest test only), Tests (every test,
// newest first) and Markers (one row per marker, grouped by section).

import { useMemo, useState } from 'react'
import { CalendarClock, Lock, TriangleAlert } from 'lucide-react'
import { SECTION_ABBR, SECTION_ORDER } from '../../lib/markers'
import { changesFor, notInTest, type LabTest, type TestMarker } from '../../lib/labTests'
import { CORE_KEYS } from '../../lib/labRules'
import { dayOf, fmtDay } from '../../lib/dates'
import { usePlan } from '../../lib/plan'
import { FeedList, FeedRow, type FeedStatus } from '../../components/FeedList'
import { PanelCard } from '../../components/dashboard/PanelCard'
import { Segmented } from '@/components/ui/segmented'
import { Button } from '@/components/ui/button'
import { TestHeader } from './TestReport'
import { flagChip, markerChip, markerRowProps, plural, printedValue, rangeSub, SECTION_ICON, testRowProps, valueTitle } from './feed'
import { markerHash, type HomeTab } from './route'
type Go = (hash: string, replace?: boolean) => void

const flagged = (m: TestMarker) => m.labFlag === 'high' || m.labFlag === 'low'

// How far outside its own range, relative to the limit, so units do not matter.
function outBy(m: TestMarker): number {
  if (m.value === undefined) return 0
  if (m.high !== undefined && m.value > m.high) return (m.value - m.high) / Math.abs(m.high || 1)
  if (m.low !== undefined && m.value < m.low) return (m.low - m.value) / Math.abs(m.low || 1)
  return 0
}

/** Act first, then watch; core markers first in each tier, then by distance outside the range. */
function attentionOf(t: LabTest): TestMarker[] {
  const tier = (m: TestMarker) => (m.read === 'act' ? 0 : 1)
  const core = (m: TestMarker) => (CORE_KEYS.includes(m.key) ? 0 : 1)
  return t.markers
    .filter((m) => m.read === 'act' || m.read === 'watch')
    .sort((a, b) => tier(a) - tier(b) || core(a) - core(b) || outBy(b) - outBy(a))
}

function MoreButton({ n, onClick }: { n: number; onClick: () => void }) {
  if (n <= 0) return null
  return (
    <Button variant="ghost" className="mt-1 h-10 w-full text-muted-foreground" onClick={onClick}>
      Show {n} more
    </Button>
  )
}

const LOCKED = 'Pro reads each result against what you take, shows what changed since your last test and what people usually do next.'

// ── Latest ────────────────────────────────────────────────────────────────

function Latest({ tests, isPro, go }: { tests: LabTest[]; isPro: boolean; go: Go }) {
  const { openUpgrade } = usePlan()
  const t = tests[0]
  // The same strictly-earlier-day rule the changes use (R4), so the baseline named is the one compared.
  const day = dayOf(t.date)
  const previous = day ? tests.find((o) => { const d = dayOf(o.date); return d !== '' && d < day }) : undefined

  const attention = isPro ? attentionOf(t) : [...t.markers.filter(flagged)].sort((a, b) => outBy(b) - outBy(a))
  const shown = attention.slice(0, 3)
  // Every marker at most once per screen: What changed skips the rows above.
  const shownKeys = new Set(shown.map((m) => m.key))
  const changes = changesFor(t).filter((m) => !shownKeys.has(m.key)).slice(0, 3)
  const missing = notInTest(tests, t)
  const worst = missing.reduce((a, m) => Math.max(a, m.ageMonths), 0)
  const staleness: FeedStatus | undefined = worst > 12 ? { label: 'Overdue', tone: 'warn' } : worst >= 6 ? { label: 'Due', tone: 'neutral' } : undefined

  return (
    <div className="flex flex-col gap-4">
      <TestHeader test={t} variant="latest" isPro={isPro} onClick={() => go(`#test/${t.id}`)} />

      <PanelCard title={isPro ? 'Needs attention' : 'Outside the lab range'} subtitle={`From your ${fmtDay(t.date)} test`}>
        {shown.length === 0 && (
          <p className="feed-note text-muted-foreground">
            {isPro ? 'Nothing in this test needs attention.'
              : t.markers.some((m) => m.labFlag !== 'none') ? 'Nothing in this test is outside the lab range.'
                : 'This test has no lab ranges printed to compare with.'}
          </p>
        )}
        <FeedList>
          {shown.map((m) => isPro ? (
            <FeedRow key={m.resultId} {...markerRowProps(m, true, { attention: true })} onClick={() => go(markerHash(m.key, t.id))} />
          ) : (
            <FeedRow
              key={m.resultId}
              icon={SECTION_ICON[m.section]}
              title={valueTitle(m.label, printedValue(m), m.unit, m.labFlag, m.expected)}
              sub={rangeSub(m.low, m.high)}
              status={flagChip(m)}
              onClick={() => go(markerHash(m.key, t.id))}
            />
          ))}
          {!isPro && <FeedRow icon={Lock} title={shown.length ? 'What to do about it' : 'What Pro reads in a test'} note={LOCKED} onClick={() => openUpgrade('Bloods read')} />}
        </FeedList>
        <MoreButton n={attention.length - shown.length} onClick={() => go(`#test/${t.id}`)} />
      </PanelCard>

      <PanelCard title="What changed" subtitle={previous ? `Since your ${fmtDay(previous.date)} test` : undefined}>
        {isPro ? (
          changes.length === 0 ? (
            <p className="feed-note text-muted-foreground">
              {previous ? `Nothing moved enough to matter since ${fmtDay(previous.date)}.` : 'This is your first test, so there is nothing to compare yet.'}
            </p>
          ) : (
            <FeedList>
              {changes.map((m) => {
                const c = m.change!
                const amount = c.text.split(' vs ')[0].replace(/^[▲▼]\s*/, '')
                return (
                  <FeedRow
                    key={m.resultId}
                    icon={SECTION_ICON[m.section]}
                    iconTone={c.better === false ? 'bad' : 'neutral'}
                    title={valueTitle(m.label, printedValue(m), m.unit, m.labFlag, m.expected)}
                    sub={`${c.dir === 'up' ? 'Up' : 'Down'} ${amount} since ${fmtDay(m.prev!.date)} (${Number(m.prev!.value.toPrecision(4))})`}
                    status={c.better === true ? { label: 'Better', tone: 'good' } : c.better === false ? { label: 'Worse', tone: 'bad' } : markerChip(m, true)}
                    onClick={() => go(markerHash(m.key, t.id))}
                  />
                )
              })}
            </FeedList>
          )
        ) : (
          <FeedList>
            <FeedRow icon={Lock} title="What changed since your last test" sub="Pro compares every marker with your previous test, by date." onClick={() => openUpgrade('Bloods read')} />
          </FeedList>
        )}
      </PanelCard>

      {missing.length > 0 && (
        <PanelCard>
          <FeedList>
            <FeedRow
              icon={CalendarClock}
              title="Not in this test"
              sub={missing.map((m) => m.label).join(', ')}
              status={staleness}
              facts={missing.map((m) => `${m.label} ${Number(m.value.toPrecision(4))} ${m.unit} · ${fmtDay(m.date)}`.replace(/\s+·/, ' ·'))}
              onClick={() => go('#markers')}
            />
          </FeedList>
        </PanelCard>
      )}

      <p className="feed-facts px-1 text-muted-foreground">
        Not medical advice. Flags come from your lab; check anything you act on with your doctor.
      </p>
    </div>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────

function Tests({ tests, isPro, go }: { tests: LabTest[]; isPro: boolean; go: Go }) {
  const [onlyCheck, setOnlyCheck] = useState(false)
  const needCheck = tests.filter((t) => t.needsCheck.length > 0)
  const list = onlyCheck ? needCheck : tests
  return (
    <PanelCard>
      {needCheck.length > 0 && (
        <FeedList className="mb-2">
          <FeedRow
            icon={TriangleAlert}
            iconTone="warn"
            title={`${plural(needCheck.length, 'test')} ${needCheck.length === 1 ? 'needs' : 'need'} a quick check`}
            sub={onlyCheck ? 'Showing only those. Tap to show every test.' : 'A draw date to confirm, or two reports on one day.'}
            pressed={onlyCheck}
            onClick={() => setOnlyCheck(!onlyCheck)}
          />
        </FeedList>
      )}
      <FeedList>
        {list.map((t) => (
          <FeedRow key={t.id} {...testRowProps(t, isPro, tests)} onClick={() => go(`#test/${t.id}`)} />
        ))}
      </FeedList>
    </PanelCard>
  )
}

// ── Markers ───────────────────────────────────────────────────────────────

function Markers({ tests, isPro, go }: { tests: LabTest[]; isPro: boolean; go: Go }) {
  const bySection = useMemo(() => {
    // Newest reading of each marker (tests are newest first), and how many tests have it.
    const seen = new Map<string, { m: TestMarker; t: LabTest; n: number }>()
    for (const t of tests) {
      for (const m of t.markers) {
        const had = seen.get(m.key)
        if (had) had.n++
        else seen.set(m.key, { m, t, n: 1 })
      }
    }
    return SECTION_ORDER
      .map((section) => ({ section, rows: [...seen.values()].filter((r) => r.m.section === section) }))
      .filter((s) => s.rows.length > 0)
  }, [tests])

  return (
    <div className="flex flex-col gap-4">
      {bySection.map(({ section, rows }) => (
        <PanelCard key={section} title={<span className="flex items-baseline gap-2">{section}{SECTION_ABBR[section] && <span className="eyebrow">{SECTION_ABBR[section]}</span>}</span>}>
          <FeedList>
            {rows.map(({ m, t, n }) => (
              <FeedRow
                key={m.key}
                icon={SECTION_ICON[m.section]}
                title={valueTitle(m.label, printedValue(m), m.unit, m.labFlag, m.expected)}
                sub={`${fmtDay(t.date)} · ${plural(n, 'test')}`}
                status={markerChip(m, isPro)}
                onClick={() => go(markerHash(m.key))}
              />
            ))}
          </FeedList>
        </PanelCard>
      ))}
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────────────

export function BloodsHome({ tests, isPro, tab, onTab, go }: { tests: LabTest[]; isPro: boolean; tab: HomeTab; onTab: (t: HomeTab) => void; go: Go }) {
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={tab}
        onChange={onTab}
        ariaLabel="Bloods view"
        className="w-full [&>button]:min-h-10"
        options={[
          { value: 'latest', label: 'Latest' },
          { value: 'tests', label: 'Tests' },
          { value: 'markers', label: 'Markers' },
        ]}
      />
      {tab === 'latest' && <Latest tests={tests} isPro={isPro} go={go} />}
      {tab === 'tests' && <Tests tests={tests} isPro={isPro} go={go} />}
      {tab === 'markers' && <Markers tests={tests} isPro={isPro} go={go} />}
    </div>
  )
}
