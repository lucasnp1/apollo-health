// Renders the social preview cards (1200x630) once, with the system Chrome
// through playwright-core, into public/og.png and public/og-read.png.
// Run: node scripts/og-image.mjs   (re-run after a rename or a copy change)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const font = fs.readFileSync(path.join(root, 'public/fonts/hanken-grotesk.woff2')).toString('base64')
const mono = fs.readFileSync(path.join(root, 'public/fonts/jetbrains-mono.woff2')).toString('base64')
const logo = fs.readFileSync(path.join(root, 'public/logo-256.png')).toString('base64')

const card = ({ eyebrow, title, sub, chips }) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:H;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
@font-face{font-family:M;src:url(data:font/woff2;base64,${mono}) format('woff2');font-weight:100 800}
html,body{margin:0;width:1200px;height:630px;background:#14161c;color:#eef1f6;font-family:H,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{position:relative;width:1200px;height:630px;padding:64px 72px;box-sizing:border-box;overflow:hidden}
.glow{position:absolute;right:-160px;top:-220px;width:720px;height:720px;border-radius:50%;background:radial-gradient(circle,rgba(245,176,66,.28),rgba(245,176,66,0) 62%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(circle at 70% 30%,#000,transparent 75%)}
.brand{position:relative;display:flex;align-items:center;gap:18px}
.brand img{width:64px;height:64px;border-radius:16px}
.brand b{font-size:32px;font-weight:600;letter-spacing:-.01em}
.brand b span{color:#aeb2bb;font-weight:500}
.eyebrow{position:relative;margin-top:54px;font:600 20px M,monospace;letter-spacing:.16em;text-transform:uppercase;color:#f5b042}
h1{position:relative;margin:14px 0 0;font-size:74px;line-height:1.02;letter-spacing:-.035em;font-weight:600;max-width:980px}
h1 em{font-style:normal;color:#f5b042}
p{position:relative;margin:22px 0 0;font-size:28px;line-height:1.35;color:#c9cdd6;max-width:900px}
.chips{position:absolute;left:72px;bottom:56px;display:flex;gap:12px}
.chip{font:500 20px M,monospace;padding:12px 18px;border-radius:12px;background:#1d2027;border:1px solid rgba(255,255,255,.1);color:#eef1f6}
</style></head><body><div class="wrap"><div class="grid"></div><div class="glow"></div>
<div class="brand"><img src="data:image/png;base64,${logo}"><b>Apollo <span>Health</span></b></div>
<div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${sub}</p>
<div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
</div></body></html>`

const cards = [
  { file: 'public/og.png', eyebrow: 'Track your protocol', title: 'Know what’s going on with <em>your bloods</em>.', sub: 'Injections, blood pressure, weight, symptoms and lab results in one private app, with your lab PDF read on your phone.', chips: ['Local-first', 'No trackers', 'PDF and photo import', 'TRT-aware ranges'] },
  { file: 'public/og-read.png', eyebrow: 'Free · no account', title: 'Read my <em>bloods</em>.', sub: 'Drop a lab PDF or a photo and get every marker read in plain words: what it means, probable causes, what people usually do.', chips: ['Nothing leaves your browser', 'TRT-aware ranges', 'UK and US units'] },
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
for (const c of cards) {
  await page.setContent(card(c), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(root, c.file), type: 'png' })
  console.log('wrote', c.file, Math.round(fs.statSync(path.join(root, c.file)).size / 1024), 'KB')
}
await browser.close()
