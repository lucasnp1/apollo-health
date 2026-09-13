// Generates the static SEO guides under public/guides and public/sitemap.xml.
// Runs on predev and prebuild. Sources: src/lib/markers.ts (the catalog),
// src/lib/labCopy.ts (marker copy) and content/guides/*.md (long-form).
// Both TS modules are import-free so Node can load them directly.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const { allMarkerMeta, PANEL_ORDER } = await import('../src/lib/markers.ts')
const { MARKER_COPY, PANEL_INTRO } = await import('../src/lib/labCopy.ts')

const SITE = process.env.SITE_ORIGIN ?? 'https://apollo-hq.pages.dev'
const BRAND = 'Apollo Health'
const PUBLISHED = '2026-09-13'
const today = new Date().toISOString().slice(0, 10)
const outDir = path.join(root, 'public/guides')
const contentDir = path.join(root, 'content/guides')
fs.mkdirSync(outDir, { recursive: true })
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.html')) fs.unlinkSync(path.join(outDir, f))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slugOf = (key) => key.replace(/_/g, '-')
const unitText = (u) => (u ? ` ${u}` : '')

// ── Tiny markdown → HTML (headings, paragraphs, lists, bold, italics, links, code)
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}
function markdown(md) {
  const lines = md.split('\n')
  const out = []
  let para = []
  let list = null
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] }
    if (list) { out.push(`</${list}>`); list = null }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    const ul = line.match(/^[-*]\s+(.*)$/)
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (h) { flush(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`) }
    else if (ul || ol) {
      const tag = ul ? 'ul' : 'ol'
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] }
      if (list && list !== tag) { out.push(`</${list}>`); list = null }
      if (!list) { out.push(`<${tag}>`); list = tag }
      out.push(`<li>${inline((ul ?? ol)[1])}</li>`)
    }
    else if (line === '') flush()
    else para.push(line)
  }
  flush()
  return out.join('\n')
}
function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: md }
  const meta = {}
  for (const l of m[1].split('\n')) { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, '') }
  return { meta, body: m[2] }
}

// ── Page shell
function shell({ title, description, canonical, jsonld, body, ogImage = '/og.png' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#14161c" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${SITE}${ogImage}" />
  <meta property="og:url" content="${canonical}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" type="image/png" sizes="32x32" href="/logo-32.png" />
  <link rel="apple-touch-icon" href="/logo-180.png" />
  <link rel="preload" href="/fonts/hanken-grotesk.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/guides/guide.css" />
  ${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n  ')}
</head>
<body>
<header class="site">
  <a class="brand" href="/"><img src="/logo-128.png" alt="" width="28" height="28" />Apollo <span>Health</span></a>
  <nav><a href="/guides/">Guides</a><a href="/read">Read my bloods</a><a href="/app/?ref=guides">Open the app</a></nav>
</header>
<main>
${body}
<footer>
  <p>Not medical advice. Apollo reads numbers the way an experienced TRT user would and lists what people usually do; check anything you act on with your doctor.</p>
  <p><a href="/">${BRAND}</a> · <a href="/guides/">All guides</a> · <a href="/read">Read my bloods</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
</footer>
</main>
</body>
</html>
`
}

const disclaimerBox = `<div class="box"><p class="eyebrow">Not medical advice</p><p style="margin:0">This is how experienced TRT users read the number and what they usually do about it. Every decision about your protocol belongs to you and a clinician who knows you.</p></div>`
const ctaBlock = (ref) => `<div class="card"><p class="eyebrow">Read yours</p><p><strong>Drop your lab PDF or a photo and get every marker read like this, in plain words.</strong> Free, no account, nothing leaves your browser. Save it in the app to see the change since your last test.</p><p class="cta"><a class="btn primary" href="/read?ref=${ref}">Read my bloods</a><a class="btn ghost" href="/app/?signup=1&amp;ref=${ref}">Start tracking</a></p></div>`

// ── Marker guides
const metas = allMarkerMeta()
const byKey = new Map(metas.map((m) => [m.key, m]))
const pages = []

for (const [key, copy] of Object.entries(MARKER_COPY)) {
  const meta = byKey.get(key)
  if (!meta) { console.warn('no catalog entry for', key); continue }
  const slug = slugOf(key)
  const url = `${SITE}/guides/${slug}`
  const title = `${meta.label} on TRT: what the number means`
  const description = copy.what.split('. ')[0].slice(0, 155)
  const related = metas.filter((m) => m.panel === meta.panel && m.key !== key && MARKER_COPY[m.key])
  const opt = meta.optimal
  const optText = opt
    ? `${opt.low !== undefined && opt.high !== undefined ? `${opt.low} to ${opt.high}` : opt.high !== undefined ? `under ${opt.high}` : `over ${opt.low}`}${unitText(meta.unit)}`
    : 'Read against the lab range and the trend'
  const body = `
<p class="eyebrow">${esc(meta.panel)}</p>
<h1>${esc(meta.label)} on TRT</h1>
<p class="standfirst">What the number means, why it moves on a protocol, and what people usually do about it.</p>
<p class="meta">Updated ${today} · Part of the <a href="/guides/">Apollo guides</a></p>

<h2>What it is</h2>
<p>${esc(copy.what)}</p>

<h2>The range</h2>
<div class="range">
  <div class="card"><p class="label">TRT-aware target</p><p class="val">${esc(optText)}</p>${opt?.note ? `<p class="muted" style="margin:6px 0 0;font-size:14px">${esc(opt.note)}</p>` : ''}</div>
  <div class="card"><p class="label">How to read the lab range</p><p style="margin:0">${esc(copy.range)}</p></div>
</div>

<h2>Why it moves on a protocol</h2>
<ul>${copy.whyMoves.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

<div class="box"><p class="eyebrow">What people usually do · not a recommendation</p><ul>${copy.practices.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>

<h2>How Apollo reads it</h2>
<p>Import the PDF or a photo of the report and Apollo finds ${esc(meta.label)} on it, keeps every test on one line, shows the change since the last one, and reads it against TRT-aware thresholds rather than the lab's generic range. The panel it belongs to, ${esc(meta.panel)}, gets a written verdict with the probable causes and what people usually do.</p>
${ctaBlock(`guide-${slug}`)}

<h2>Questions people ask</h2>
${copy.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}

${related.length ? `<h2>Related markers</h2><p class="related">${related.map((m) => `<a href="/guides/${slugOf(m.key)}">${esc(m.label)}</a>`).join('')}</p>` : ''}
${disclaimerBox}
`
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: title, description, datePublished: PUBLISHED, dateModified: today, author: { '@type': 'Organization', name: BRAND }, publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: `${SITE}/logo-512.png` } }, mainEntityOfPage: url, about: meta.label },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: copy.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Guides', item: `${SITE}/guides/` }, { '@type': 'ListItem', position: 2, name: meta.label, item: url }] },
  ]
  fs.writeFileSync(path.join(outDir, `${slug}.html`), shell({ title, description, canonical: url, jsonld, body }))
  pages.push({ slug, url, title: meta.label, panel: meta.panel, kind: 'marker', description })
}

// ── Long-form guides from content/guides/*.md
const longform = []
if (fs.existsSync(contentDir)) {
  for (const f of fs.readdirSync(contentDir).filter((x) => x.endsWith('.md')).sort()) {
    const { meta, body } = frontMatter(fs.readFileSync(path.join(contentDir, f), 'utf8'))
    const slug = meta.slug ?? f.replace(/\.md$/, '')
    const url = `${SITE}/guides/${slug}`
    const title = meta.title ?? slug
    const description = meta.description ?? ''
    const html = `
<p class="eyebrow">${esc(meta.eyebrow ?? 'Guide')}</p>
<h1>${esc(title)}</h1>
${description ? `<p class="standfirst">${esc(description)}</p>` : ''}
<p class="meta">Updated ${today} · Part of the <a href="/guides/">Apollo guides</a></p>
${markdown(body)}
${ctaBlock(`guide-${slug}`)}
${disclaimerBox}
`
    const jsonld = [
      { '@context': 'https://schema.org', '@type': 'Article', headline: title, description, datePublished: meta.published ?? PUBLISHED, dateModified: today, author: { '@type': 'Organization', name: BRAND }, publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: `${SITE}/logo-512.png` } }, mainEntityOfPage: url },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Guides', item: `${SITE}/guides/` }, { '@type': 'ListItem', position: 2, name: title, item: url }] },
    ]
    fs.writeFileSync(path.join(outDir, `${slug}.html`), shell({ title: `${title} | ${BRAND}`, description, canonical: url, jsonld, body: html }))
    longform.push({ slug, url, title, description })
  }
}

// ── Index
const groups = PANEL_ORDER.map((panel) => ({ panel, items: pages.filter((p) => p.panel === panel) })).filter((g) => g.items.length)
const indexBody = `
<p class="eyebrow">Guides</p>
<h1>Your bloods, marker by marker.</h1>
<p class="standfirst">What each number means on TRT, why it moves on a protocol, and what people usually do about it. Written the way an experienced user explains it, not the way a lab prints it.</p>
${ctaBlock('guides')}
${longform.length ? `<div class="index-group"><h2>Start here</h2><ul class="index-list">${longform.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.title)}<small>${esc(g.description)}</small></a></li>`).join('')}</ul></div>` : ''}
${groups.map((g) => `<div class="index-group"><h2>${esc(g.panel)}</h2><p class="intro">${esc(PANEL_INTRO[g.panel] ?? '')}</p><ul class="index-list">${g.items.map((p) => `<li><a href="/guides/${p.slug}">${esc(p.title)} on TRT<small>${esc(p.description)}</small></a></li>`).join('')}</ul></div>`).join('')}
${disclaimerBox}
`
fs.writeFileSync(path.join(outDir, 'index.html'), shell({
  title: `TRT blood test guides, marker by marker | ${BRAND}`,
  description: 'What each blood marker means on TRT, why it moves on a protocol and what people usually do about it. Testosterone, estradiol, hematocrit, lipids, liver, kidney, thyroid and more.',
  canonical: `${SITE}/guides/`,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'TRT blood test guides', url: `${SITE}/guides/`, publisher: { '@type': 'Organization', name: BRAND } }],
  body: indexBody,
}))

// ── Sitemap
const urls = [
  { loc: `${SITE}/`, priority: '1.0' },
  { loc: `${SITE}/read`, priority: '0.9' },
  { loc: `${SITE}/guides/`, priority: '0.8' },
  ...longform.map((g) => ({ loc: g.url, priority: '0.7' })),
  ...pages.map((p) => ({ loc: p.url, priority: '0.6' })),
  { loc: `${SITE}/privacy`, priority: '0.2' },
  { loc: `${SITE}/terms`, priority: '0.2' },
]
fs.writeFileSync(path.join(root, 'public/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>\n`)

console.log(`guides: ${pages.length} marker pages, ${longform.length} long-form, index + sitemap (${urls.length} urls)`)
