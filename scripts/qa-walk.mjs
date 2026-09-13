// End-to-end QA walk of Apollo as a brand-new user. Every step screenshots,
// dumps the interactive elements on screen, and records console/page errors
// and failed same-origin requests. Steps never abort the run; failures are
// listed at the end so the whole app gets covered in one pass.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:8788'
const OUT = process.env.OUT ?? path.resolve('qa/run')
const MOBILE = process.env.DESKTOP !== '1'
const PDF = process.env.PDF ?? path.resolve('fixtures/medichecks-advanced-trt.pdf')
const PHOTO = process.env.PHOTO ?? path.resolve('fixtures/medichecks-photo.png')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const email = `qa-${Date.now()}@example.com`
const password = 'Review-Test-Apollo-2026!'
const newPassword = 'Review-Test-Apollo-2026!!'
const log = []
const failures = []
const consoleErrors = []
const badRequests = []
let n = 0
const say = (s) => { log.push(s); console.log(s) }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext(MOBILE
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', acceptDownloads: true }
  : { viewport: { width: 1280, height: 900 }, colorScheme: 'dark', acceptDownloads: true })
const page = await ctx.newPage()
page.setDefaultTimeout(9000)
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${n}: ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => consoleErrors.push(`${n}: PAGEERROR ${e.message.slice(0, 300)}`))
page.on('response', (r) => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && !/\/api\/auth\/me$/.test(u)) badRequests.push(`${n}: ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`) })

async function dump() {
  return page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=button], [role=combobox], [role=switch]')]
    .filter((e) => e.getClientRects().length && !e.closest('[aria-hidden="true"]'))
    .map((e) => `${e.tagName.toLowerCase()}${e.type && e.tagName === 'INPUT' ? `[${e.type}]` : ''}: ${(e.getAttribute('aria-label') || e.innerText || e.placeholder || e.value || e.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 48)}`)
    .filter((s, i, a) => a.indexOf(s) === i))
}
async function step(name, fn) {
  n += 1
  const id = `${String(n).padStart(2, '0')}-${name}`
  try {
    await fn()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, `${id}.png`) })
    const els = await dump()
    fs.writeFileSync(path.join(OUT, `${id}.txt`), els.join('\n'))
    say(`ok   ${id}  (${els.length} controls)`)
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `${id}-FAIL.png`) }).catch(() => {})
    fs.writeFileSync(path.join(OUT, `${id}-FAIL.txt`), (await dump().catch(() => [])).join('\n'))
    failures.push(`${id}: ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`)
    say(`FAIL ${id}: ${String(e.message ?? e).split('\n')[0].slice(0, 200)}`)
  }
}
const btn = (re) => page.getByRole('button', { name: re }).first()
const link = (re) => page.getByRole('link', { name: re }).first()
// The app reopens on the last view, so go to Home through the header when needed.
const home = async () => {
  await page.goto(`${BASE}/app/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /go to Home|^Injection/ }).first().waitFor({ timeout: 15000 })
  const inj = page.getByRole('button', { name: /^Injection/ })
  if (!(await inj.isVisible().catch(() => false))) await page.getByRole('button', { name: /go to Home/i }).click()
  await inj.waitFor({ timeout: 15000 })
  await page.waitForTimeout(400)
}
const fillNumber = async (label, value) => {
  const byLabel = page.getByLabel(label).first()
  if (await byLabel.count()) { await byLabel.fill(String(value)); return }
  await page.getByPlaceholder(label).first().fill(String(value))
}

// ── 1. Landing → sign-up
await step('landing', async () => {
  await page.goto(`${BASE}/?stay=1`, { waitUntil: 'networkidle' })
  await link(/Start tracking/i).click()
  await page.waitForURL(/\/app\//)
  await page.waitForTimeout(1500)
})
let recoveryCodes = []
await step('signup', async () => {
  if (!(await page.getByPlaceholder('Confirm password').count())) await btn(/^Sign up$/).click()
  await page.getByPlaceholder('Email').fill(email)
  const pw = page.locator('input[type=password]')
  await pw.nth(0).fill(password)
  await pw.nth(1).fill(password)
  await page.getByPlaceholder('Display name (optional)').fill('QA Tester')
  await page.getByRole('button', { name: /^(Sign up|Create account)$/ }).last().click()
  await page.getByText(/Take a screenshot of this screen/i).waitFor({ timeout: 20000 })
})
await step('recovery-codes', async () => {
  recoveryCodes = await page.evaluate(() => [...document.querySelectorAll('li, code, span')].map((e) => e.textContent?.trim() ?? '').filter((t) => /^[A-Z0-9]{4}-[A-Z0-9]{4}(-[A-Z0-9]{4})?$/.test(t)))
  say(`      recovery codes captured: ${recoveryCodes.length}`)
  await btn(/Done, I have them/i).click()
  await page.waitForTimeout(1000)
})
await step('onboarding', async () => {
  for (let i = 0; i < 5; i++) {
    const next = page.getByRole('button', { name: /^(Next|Continue|Done|Finish|Let's go|Got it|Start|Open Apollo)/i }).first()
    if (!(await next.count()) || !(await next.isVisible().catch(() => false))) break
    await next.click()
    await page.waitForTimeout(600)
  }
  const skip = btn(/^Skip$/)
  if (await skip.isVisible().catch(() => false)) await skip.click()
})
await step('home-empty', async () => { await home() })

// ── 2. Logging
await step('add-injection-open', async () => {
  await btn(/^Injection/).click()
  await page.waitForTimeout(800)
})
await step('add-injection-fill', async () => {
  await page.locator('select[aria-label="Compound"]').first().selectOption('__new__')
  await page.waitForTimeout(300)
  await page.getByLabel('Name').first().fill('Testosterone Enanthate')
  const conc = page.getByPlaceholder('e.g. 300').first()
  if (await conc.count()) await conc.fill('250')
  await page.getByLabel(/^Dose/).first().fill('150')
  await page.getByRole('button', { name: /Vastus lateralis.*Left/i }).first().click()
  const feel = page.getByRole('button', { name: /HOW DO YOU FEEL/i }).first()
  if (await feel.count()) {
    await feel.click()
    await page.waitForTimeout(300)
    // Ratings are 1 to 5 buttons per symptom: rate Mood 4, Energy 4, Sleep 3.
    const fours = page.getByRole('button', { name: /^4$/ })
    if (await fours.count()) { await fours.nth(0).click(); await fours.nth(1).click() }
    const threes = page.getByRole('button', { name: /^3$/ })
    if ((await threes.count()) > 2) await threes.nth(2).click()
  }
  await page.getByPlaceholder('Optional').first().fill('QA: first shot, felt fine.')
})
await step('add-injection-save', async () => {
  await btn(/Log injection|Log \d+ compounds/i).click()
  await page.waitForTimeout(1200)
})
await step('add-weight', async () => {
  await home()
  await btn(/^Weight/).click()
  await page.waitForTimeout(600)
  await page.getByPlaceholder('e.g. 82.5').fill('84.2')
  await btn(/Log weight/i).click()
  await page.waitForTimeout(1000)
})
await step('add-bp', async () => {
  await home()
  await btn(/^Blood pressure/).click()
  await page.waitForTimeout(600)
  await page.getByPlaceholder('120').fill('122')
  await page.getByPlaceholder('80').fill('79')
  await page.getByPlaceholder('65').fill('62')
  await btn(/Save reading/i).click()
  await page.waitForTimeout(1000)
})
await step('home-after-logging', async () => { await home() })
await step('home-wellbeing-tile', async () => {
  await home()
  const tile = page.getByText(/Wellbeing/i).first()
  await tile.waitFor()
  const txt = await page.locator('main').innerText()
  say(`      home shows check-in: ${/check-in|good \/ watch|No check-ins/i.test(txt)}`)
})

// ── 3. Labs
await step('labs-open', async () => {
  await home()
  await btn(/^Lab results/).click()
  await page.waitForTimeout(1000)
})
await step('labs-add-result', async () => {
  await page.getByRole('button', { name: /Add result/i }).first().click()
  await page.getByLabel('Value').fill('32.1')
  await page.getByLabel('Unit').fill('nmol/L')
  await btn(/Save marker/i).click()
  await page.waitForTimeout(1000)
})
await step('labs-upload-pdf', async () => {
  const input = page.locator('input[type=file]').first()
  if (!(await input.count())) await page.getByRole('button', { name: /Upload/i }).first().click()
  await page.locator('input[type=file]').first().setInputFiles(PDF)
  await page.getByRole('button', { name: /Import \d+ marker/i }).waitFor({ timeout: 40000 })
})
await step('labs-review-import', async () => {
  await btn(/Import \d+ marker/i).click()
  await page.waitForTimeout(1500)
})
await step('labs-analysis', async () => {
  await page.getByText(/Your bloods, read/i).first().waitFor()
  const row = page.getByRole('button', { name: /Cardiovascular|Blood health|Hormone balance/i }).first()
  await row.click()
})
await step('labs-marker-history', async () => {
  const marker = page.getByRole('button', { name: /^Hematocrit|^Total Testosterone/i }).first()
  await marker.scrollIntoViewIfNeeded()
  await marker.click()
  await page.getByRole('button', { name: /Set range|Edit range/i }).first().waitFor()
})
await step('labs-set-range', async () => {
  await btn(/Set range|Edit range/i).click()
  await page.getByPlaceholder('e.g. 700').fill('40')
  await page.getByPlaceholder('e.g. 1000').fill('50')
  await page.getByRole('button', { name: /^Save$/ }).first().click()
  await page.waitForTimeout(600)
})
await step('labs-share-card', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    btn(/Share this read/i).click(),
  ])
  if (download) say(`      share card downloaded: ${download.suggestedFilename()}`)
  await page.waitForTimeout(800)
})
await step('export-page', async () => {
  await page.getByRole('button', { name: /Export for doctor/i }).click()
  await page.getByText(/Export your data/i).waitFor()
})
await step('export-csv', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    page.getByRole('button', { name: /CSV/i }).first().click(),
  ])
  say(`      csv: ${download ? download.suggestedFilename() : 'no download event (share sheet?)'}`)
})

// ── 4. Timeline, files, targets, archive
await step('timeline', async () => {
  await home()
  await btn(/^Timeline/).click()
  await page.getByText(/Everything you've logged/i).waitFor()
})
await step('timeline-tabs', async () => {
  for (const t of ['Injections', 'Weight', 'BP', 'Labs', 'Files', 'Symptoms', 'All']) {
    const tab = page.getByRole('button', { name: new RegExp(`^${t}\\b`) }).first()
    if (await tab.count()) { await tab.click(); await page.waitForTimeout(300) }
  }
})
await step('timeline-archive-undo', async () => {
  await page.getByRole('button', { name: /^Injections\b/ }).first().click()
  await page.getByRole('button', { name: /Archive entry/i }).first().click()
  const undo = page.getByRole('button', { name: /Undo/i }).first()
  await undo.waitFor({ timeout: 5000 })
  await undo.click()
  await page.waitForTimeout(600)
})
await step('files', async () => {
  await home()
  const f = btn(/^Files/)
  if (!(await f.count())) throw new Error('no Files launcher on Home')
  await f.click()
  await page.getByText(/medichecks/i).first().waitFor()
})
await step('targets', async () => {
  await home()
  const t = btn(/^Targets|^Goals/)
  if (!(await t.count())) throw new Error('no Targets launcher on Home')
  await t.click()
  await page.waitForTimeout(800)
  await btn(/Add goal/i).click()
  await page.waitForTimeout(500)
})
await step('archive-view', async () => {
  await home()
  await btn(/^Settings/).click()
  await btn(/Open archive/i).click()
  await page.getByText(/Archive/i).first().waitFor()
})

// ── 5. Settings
await step('settings', async () => {
  await home()
  await btn(/^Settings/).click()
  await page.waitForTimeout(800)
})
await step('theme-toggle', async () => {
  await page.getByRole('button', { name: /Toggle light or dark theme/i }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Toggle light or dark theme/i }).click()
})
await step('feedback', async () => {
  await page.getByPlaceholder(/What's working/i).fill('QA run: everything looks good so far.')
  await page.getByRole('button', { name: /^Send/i }).first().click()
  await page.getByText(/Thanks/i).waitFor({ timeout: 8000 })
})
await step('change-password', async () => {
  await btn(/Change password/i).click()
  await page.getByLabel('Current password').fill(password)
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password').fill(newPassword)
  await page.getByRole('button', { name: /Save password/i }).click()
  await page.waitForTimeout(1500)
})
await step('recovery-codes-regen', async () => {
  await btn(/Recovery codes/i).click()
  const pw = page.getByLabel('Your password').first()
  if (await pw.count()) { await pw.fill(newPassword); await btn(/Generate new codes/i).click() }
  await page.waitForTimeout(1500)
  // The old set is void now; keep the new codes for the reset test below.
  const fresh = await page.evaluate(() => [...document.querySelectorAll('li, code, span')].map((e) => e.textContent?.trim() ?? '').filter((t) => /^[A-Z0-9]{4}-[A-Z0-9]{4}(-[A-Z0-9]{4})?$/.test(t)))
  if (fresh.length) { recoveryCodes = fresh; say(`      new recovery codes captured: ${fresh.length}`) }
  const done = page.getByRole('dialog').getByRole('button', { name: /^Done$/ }).first()
  if (await done.count()) await done.click()
})
await step('backup-file', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    btn(/Backup file/i).click(),
  ])
  say(`      backup: ${download ? download.suggestedFilename() : 'no download'}`)
})
await step('sign-out', async () => {
  await btn(/Sign out/i).click()
  await page.getByPlaceholder('Email').waitFor({ timeout: 10000 })
})
await step('sign-in', async () => {
  await page.getByPlaceholder('Email').fill(email)
  await page.locator('input[type=password]').first().fill(newPassword)
  await page.getByRole('button', { name: /^Sign in$/ }).last().click()
  await page.getByRole('button', { name: /go to Home/i }).waitFor({ timeout: 15000 })
  say(`      signed in; landed on: ${(await page.locator('header').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60)}`)
})
await step('forgot-password-with-code', async () => {
  await home()
  await btn(/^Settings/).click()
  await btn(/Sign out/i).click()
  await page.getByPlaceholder('Email').waitFor()
  await page.getByRole('button', { name: /forgot|recovery|lost/i }).first().click()
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder(/Recovery code/i).fill(recoveryCodes[0] ?? 'XXXX-XXXX-XXXX')
  const pw = page.locator('input[type=password]')
  await pw.nth(0).fill(password)
  if ((await pw.count()) > 1) await pw.nth(1).fill(password)
  await page.getByRole('button', { name: /Set new password/i }).click()
  await page.getByRole('button', { name: /go to Home/i }).waitFor({ timeout: 15000 })
})
await step('delete-account', async () => {
  await home()
  await btn(/^Settings/).click()
  await btn(/Delete account/i).click()
  await page.getByPlaceholder('DELETE').fill('DELETE')
  await page.getByLabel('Your password').fill(password)
  await page.getByRole('button', { name: /Delete my account/i }).click()
  await page.getByPlaceholder('Email').waitFor({ timeout: 20000 })
})

await browser.close()
fs.writeFileSync(path.join(OUT, 'REPORT.md'), [
  '# QA run', `base ${BASE}, ${MOBILE ? 'mobile' : 'desktop'}, account ${email}`, '',
  '## Steps', ...log, '', '## Failures', ...(failures.length ? failures : ['none']), '',
  '## Console errors', ...(consoleErrors.length ? consoleErrors : ['none']), '',
  '## Failed requests', ...(badRequests.length ? badRequests : ['none']), '',
].join('\n'))
console.log(`\nfailures: ${failures.length}, console errors: ${consoleErrors.length}, bad requests: ${badRequests.length}`)
