#!/usr/bin/env node
// Weekly community digest: last week's Reddit threads where a helpful reply
// about bloods, hematocrit, estradiol or tracking would fit, plus the admin
// stats. Read-only. It never posts anything; drafting and posting are separate,
// human-paced acts.
//
//   node scripts/community-digest.mjs            → tmp/digest/YYYY-MM-DD.md
//   node scripts/community-digest.mjs --json     → JSON on stdout
//   APOLLO_STATS_TOKEN=... APOLLO_ORIGIN=https://apollo-hq.pages.dev  (optional stats section)
//   REDDIT_FORCE_FALLBACK=1                      → skip search.json, exercise the fallbacks
import fs from 'node:fs'
import path from 'node:path'

const UA = 'apollo-health-digest/1.0 (community research; hello@theos.studio)'
const SUBS = ['Testosterone', 'trt', 'PEDs', 'Peptides', 'moreplatesmoredates']
const KEYWORDS = [
  'hematocrit trt', 'haematocrit trt', 'bloods trt', 'blood work trt', 'estradiol trt', 'e2 trt bloods',
  'lab results trt', 'trt tracker app', 'track injections app', 'peptide bloods', 'hba1c trt', 'ldl trt',
  'shbg trt', 'medichecks results', 'first bloods on trt',
]
const REPLY_HINTS = [
  { match: /hematocrit|haematocrit|hct|donat/i, hint: 'Explain the 52% line, trough vs peak draw, hydration, donation spacing and ferritin. If they ask how to keep track, mention the app by name, no link.' },
  { match: /estradiol|e2|aromat|nipple|ai\b|arimidex|anastrozole/i, hint: 'Ratio over absolute number; split dosing before an AI; crashed E2 feels worse than high E2.' },
  { match: /ldl|hdl|cholesterol|lipid/i, hint: 'TC/HDL ratio, orals crush HDL, cardio and fibre first, bergamot as the common supplement, doctor for a statin.' },
  { match: /hba1c|glucose|insulin|mk-677|mk677/i, hint: 'GH secretagogues raise blood sugar; walking after meals; berberine is the common pick; HbA1c can read low on TRT.' },
  { match: /alt|ast|liver|ggt/i, hint: 'GGT separates liver from training soreness; no training 48 h before the draw; TUDCA/NAC in AAS circles.' },
  { match: /track|log|app|spreadsheet|record/i, hint: 'They are asking for a tool. This is the one place a natural mention fits: "I use <name>, it reads the lab PDF for you". Still no link.' },
  { match: /medichecks|thriva|randox|results|bloods|blood work|labs/i, hint: 'Read the numbers for them in plain words, ratio and trend first. Offer the free reader only if they ask where to get a second opinion.' },
]
const WEEK = 7 * 86_400_000

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')
const forceFallback = process.env.REDDIT_FORCE_FALLBACK === '1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok || !ct.includes('json')) throw new Error(`${res.status} ${ct}`)
  return res.json()
}

function fromListing(json) {
  const children = json?.data?.children ?? []
  return children.map((c) => c.data).filter(Boolean).map((d) => ({
    id: d.id,
    title: d.title ?? '',
    sub: d.subreddit ?? '',
    url: `https://www.reddit.com${d.permalink ?? ''}`,
    created: (d.created_utc ?? 0) * 1000,
    score: d.score ?? 0,
    comments: d.num_comments ?? 0,
    text: (d.selftext ?? '').replace(/\s+/g, ' ').slice(0, 300),
  }))
}

const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const stripTags = (s) => unescapeXml(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

// Reddit's Atom feeds stay open when the JSON endpoints answer 403. The
// <content> element carries the post body as escaped HTML.
function fromRss(xml, sub) {
  const out = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1]
    const title = stripTags((e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, ''))
    const link = e.match(/<link href="([^"]+)"/)?.[1] ?? ''
    const updated = e.match(/<(?:updated|published)>([^<]+)<\/(?:updated|published)>/)?.[1] ?? ''
    const id = e.match(/<id>([^<]+)<\/id>/)?.[1] ?? link
    const content = stripTags(e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? '').replace(/\[link\]|\[comments\]|submitted by.*$/g, '').trim()
    out.push({ id, title, sub, url: link, created: Date.parse(updated) || 0, score: 0, comments: 0, text: content.slice(0, 300) })
  }
  return out
}

async function searchReddit(kw) {
  const q = encodeURIComponent(kw)
  const paths = [
    `https://www.reddit.com/search.json?q=${q}&sort=new&t=week&limit=50&raw_json=1`,
    `https://old.reddit.com/search.json?q=${q}&sort=new&t=week&limit=50&raw_json=1`,
  ]
  if (!forceFallback) {
    for (const url of paths) {
      try { return fromListing(await getJson(url)) } catch { await sleep(1500) }
    }
  }
  return null
}

async function newInSubs() {
  const out = []
  for (const sub of SUBS) {
    try {
      out.push(...fromListing(await getJson(`https://www.reddit.com/r/${sub}/new.json?limit=100&raw_json=1`)))
    } catch {
      try {
        const res = await fetch(`https://www.reddit.com/r/${sub}/new.rss`, { headers: { 'User-Agent': UA } })
        if (res.ok) out.push(...fromRss(await res.text(), sub))
      } catch { /* skip this sub */ }
    }
    await sleep(2000)
  }
  return out
}

// Feed mode has no search, so single topic words decide what is relevant.
const TOPICS = ['hematocrit', 'haematocrit', 'estradiol', 'e2 ', 'bloods', 'blood work', 'bloodwork', 'lab results', 'my labs', 'ldl', 'hdl', 'shbg', 'hba1c', 'alt ', 'ferritin', 'prolactin', 'tracker', 'spreadsheet', 'medichecks', 'thriva', 'donat']
function keywordHits(t) {
  const hay = ` ${t.title} ${t.text} `.toLowerCase()
  const phrases = KEYWORDS.filter((k) => k.split(' ').every((w) => hay.includes(w)))
  const topics = TOPICS.filter((w) => hay.includes(w)).map((w) => w.trim())
  return [...new Set([...phrases, ...topics])]
}

async function stats() {
  const token = process.env.APOLLO_STATS_TOKEN
  const origin = process.env.APOLLO_ORIGIN ?? 'https://apollo-hq.pages.dev'
  if (!token) return null
  try {
    const res = await fetch(`${origin}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } })
    if (!res.ok) return { error: `stats ${res.status}` }
    return await res.json()
  } catch (e) {
    return { error: String(e) }
  }
}

async function main() {
  const since = Date.now() - WEEK
  const seen = new Map()
  let mode = 'search'
  for (const kw of KEYWORDS) {
    const hits = await searchReddit(kw)
    if (hits === null) { mode = 'fallback'; break }
    for (const t of hits) if (t.created >= since) seen.set(t.id, t)
    await sleep(2000)
  }
  if (mode === 'fallback') {
    for (const t of await newInSubs()) if (t.created >= since && keywordHits(t).length) seen.set(t.id, t)
  }
  const threads = [...seen.values()]
    .map((t) => ({ ...t, keywords: keywordHits(t), hint: REPLY_HINTS.find((h) => h.match.test(`${t.title} ${t.text}`))?.hint ?? 'Answer the question. Mention nothing unless they ask for a tool.' }))
    .sort((a, b) => (b.keywords.length * 3 + Math.log1p(b.comments)) - (a.keywords.length * 3 + Math.log1p(a.comments)))
    .slice(0, 12)
  const s = await stats()

  if (asJson) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode, threads, stats: s }, null, 2))
    return
  }
  const day = new Date().toISOString().slice(0, 10)
  const lines = [`# Community digest · ${day}`, '', `Source: Reddit (${mode === 'search' ? 'search' : 'subreddit feeds'}), last 7 days. Nothing here has been posted.`, '']
  if (threads.length === 0) lines.push('_No matching threads this week._', '')
  for (const t of threads) {
    const age = Math.max(0, Math.round((Date.now() - t.created) / 86_400_000))
    lines.push(`## ${t.title}`, `r/${t.sub} · ${age}d ago · ${t.score} points · ${t.comments} comments`, t.url, t.keywords.length ? `Matched: ${t.keywords.join(', ')}` : '', t.text ? `> ${t.text}` : '', `Hint: ${t.hint}`, '', 'Draft reply:', '', '', '')
  }
  lines.push('## Stats', '')
  if (!s) lines.push('_skipped (set APOLLO_STATS_TOKEN)_')
  else if (s.error) lines.push(`_${s.error}_`)
  else {
    lines.push(`Users: ${s.users.total} total, ${s.users.last7Days} in the last 7 days, ${s.users.withLabPanel} with a lab panel, ${s.users.withInjection} logging injections.`)
    lines.push(`By source: ${s.signupsBySource.map((x) => `${x.source} ${x.n}`).join(', ') || 'none yet'}.`)
    lines.push(`Plans: ${s.plans.map((x) => `${x.plan}${x.kind ? ` (${x.kind})` : ''} ${x.n}`).join(', ')}.`)
    if (s.pageHits30Days?.length) lines.push(`Pages, 30 days: ${s.pageHits30Days.map((x) => `${x.path} ${x.n}`).join(', ')}.`)
  }
  const dir = path.resolve('tmp/digest')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${day}.md`)
  fs.writeFileSync(file, lines.join('\n'))
  console.log(`wrote ${file} (${threads.length} threads, ${mode})`)
}

main().catch((e) => { console.error(e); process.exit(1) })
