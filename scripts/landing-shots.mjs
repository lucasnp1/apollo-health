// Captures real Magno screens for the landing page's "Inside Magno" section.
// Runs against the Vite dev server (DEV auth stub), seeds a realistic account
// into IndexedDB, then screenshots each page at phone size, 2x, dark.
import { chromium } from 'playwright-core'
import fs from 'node:fs'

// DESKTOP=1 captures a 1280px-wide review set into OUT instead of the phone
// shots the landing page uses.
const DESKTOP = process.env.DESKTOP === '1'
const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = process.env.OUT ?? (DESKTOP ? '/tmp/apollo-desktop-shots' : '/Users/lucasnp/apollo-health/public/landing/inside')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext(DESKTOP
  ? { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' }
  : {
      // PLAY=1 captures at 540x960 so the 2x output is exactly 1080x1920 (9:16).
      // The default 390x844 renders 780x1688, a 2.16:1 ratio, and Google Play
      // rejects phone screenshots wider than 2:1.
      viewport: process.env.PLAY === '1' ? { width: 540, height: 960 } : { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.addInitScript(() => {
  localStorage.setItem('apollo-dev-authed', '1')
  localStorage.setItem('apollo.onboarded', '1')
})

await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// ── Seed ─────────────────────────────────────────────────────────────────────
const seeded = await page.evaluate(async () => {
  const DAY = 86_400_000
  const now = Date.now()
  const at = (daysAgo, h = 8, m = 0) => {
    const d = new Date(now - daysAgo * DAY)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  const sync = () => ({ serverId: crypto.randomUUID(), updatedAt: now, dirty: 1 })

  const compounds = [
    { name: 'Testosterone Enanthate', category: 'TRT', defaultDose: 150, unit: 'mg', concentration: '250 mg/mL', schedule: 'Every 3.5 days', color: '#E9A23B', ester: 'Enanthate', halfLifeDays: 4.5, peakHours: 48, concentrationMgPerMl: 250, defaultRoute: 'IM', lastDose: 150, vialKind: 'liquid', syringe: 'ml1', entryMode: 'dose' },
    { name: 'HCG', category: 'Ancillary', defaultDose: 500, unit: 'iu', schedule: 'Twice a week', color: '#3B82F6', defaultRoute: 'SubQ', lastDose: 500, vialMg: 5000, reconstituteMl: 2, vialKind: 'powder', syringe: 'u100', entryMode: 'dose' },
    { name: 'BPC-157', category: 'Peptide', defaultDose: 250, unit: 'mcg', schedule: 'Daily', color: '#A78BFA', defaultRoute: 'SubQ', lastDose: 250, vialMg: 5, reconstituteMl: 2, vialKind: 'powder', syringe: 'u100', entryMode: 'dose' },
  ]

  const req = indexedDB.open('apollo-health-local')
  const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
  const stores = [...db.objectStoreNames]
  const tx = db.transaction(stores, 'readwrite')
  const add = (store, obj) => new Promise((res, rej) => { const r = tx.objectStore(store).add(obj); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const clear = (store) => new Promise((res, rej) => { const r = tx.objectStore(store).clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error) })
  for (const s of ['compounds', 'injections', 'vitals', 'bodyMetrics', 'symptoms', 'exams', 'results', 'files', 'vials']) await clear(s)

  const cid = {}
  for (const c of compounds) cid[c.name] = await add('compounds', { ...c, ...sync() })

  // Injections: Test E every 3.5 days for 8 weeks, sites rotated; HCG Mon/Thu; BPC-157 daily for 12 days.
  const imSites = ['Ventrogluteal L', 'Ventrogluteal R', 'Vastus Lateralis L', 'Vastus Lateralis R', 'Front Deltoid L', 'Front Deltoid R']
  const notes = {
    0: 'Week 8. Ventrogluteal L was rested 9 days, so it went there.',
    7: 'Slight PIP last time on the quad, moved back to glute.',
    21: 'Switched to the new vial. 250 mg/mL, same dose.',
  }
  let k = 0
  for (let d = 0; d < 56; d += 3.5) {
    const day = Math.round(d)
    await add('injections', { compoundId: cid['Testosterone Enanthate'], takenAt: at(day, 8, 12), dose: 150, unit: 'mg', route: 'IM', site: imSites[k % imSites.length], rawDose: '150 mg', vialAmount: '0.6 mL', notes: notes[day], ...sync() })
    k++
  }
  for (let d = 1; d < 56; d += 3.5) {
    const day = Math.round(d)
    await add('injections', { compoundId: cid['HCG'], takenAt: at(day, 8, 5), dose: 500, unit: 'iu', route: 'SubQ', site: k % 2 ? 'Abdomen L' : 'Abdomen R', rawDose: '500 IU', ...sync() })
    k++
  }
  for (let day = 0; day < 12; day++) {
    await add('injections', { compoundId: cid['BPC-157'], takenAt: at(day, 21, 30), dose: 250, unit: 'mcg', route: 'SubQ', site: day % 2 ? 'Abdomen L' : 'Abdomen R', rawDose: '250 mcg', notes: day === 0 ? 'Day 12. Elbow feels better on the press.' : undefined, ...sync() })
  }

  // Blood pressure every other day, 6 weeks, creeping up while weight falls,
  // so Home rules weight out and points at the hematocrit instead.
  const bpNotes = { 0: 'At rest, before coffee.', 6: 'Logged right after squats, so retake tomorrow at rest.' }
  for (let day = 0; day < 42; day += 2) {
    const drift = (42 - day) / 42 * 14
    const bump = day === 6 ? 8 : 0
    const sys = Math.round(122 + drift + bump + Math.sin(day * 1.3) * 4)
    const dia = Math.round(76 + drift / 2 + bump / 2 + Math.cos(day * 0.9) * 3)
    const pulse = Math.round(62 + Math.sin(day * 0.7) * 5 + (day === 6 ? 14 : 0))
    await add('vitals', { measuredAt: at(day, 7, 50), systolic: sys, diastolic: dia, pulse, notes: bpNotes[day], ...sync() })
  }

  // Daily weight for 6 weeks, drifting down from 85.6 to 84.2.
  for (let day = 0; day < 42; day++) {
    const kg = Math.round((84.2 + (day / 42) * 1.4 + Math.sin(day * 2.1) * 0.25) * 10) / 10
    await add('bodyMetrics', { measuredAt: at(day, 7, 2), source: 'manual', weightKg: kg, notes: day === 0 ? 'Morning, after the bathroom.' : undefined, ...sync() })
  }

  // Check-ins every few days for 6 weeks, written so the Wellbeing summary
  // tells one story with the bloods: headaches this week (5 in 30 days) next
  // to a hematocrit over range, and two low-energy days earlier on. Headaches
  // are 4 and energy 2 so they count on the old 1-5 scale and the new 0-5 one
  // alike; everything else is 0 or good so no other line competes. No side
  // effect whose cause line names a steroid, since this ends up on the landing.
  const symptomDays = [1, 3, 5, 8, 11, 14, 17, 20, 23, 26, 29, 33, 37, 41]
  const headacheDays = new Set([1, 3, 5, 14, 23])
  const lowEnergyDays = new Set([8, 20])
  const symptomNotes = { 1: 'Third headache this week. Took BP after, 131/84.' }
  for (const day of symptomDays) {
    await add('symptoms', {
      recordedAt: at(day, 22, 15), mood: 4, energy: lowEnergyDays.has(day) ? 2 : 4, sleep: 4, libido: 5,
      waterRetention: 0, acne: 0, nippleSensitivity: 0, jointPain: 0, headache: headacheDays.has(day) ? 4 : 0,
      notes: symptomNotes[day], ...sync(),
    })
  }

  // Three blood panels: baseline, mid-protocol, latest.
  // Draw dates as the importer now stores them (noon UTC, read from the
  // report), with the lab in company, so no demo test asks to be checked.
  const drawDay = (daysAgo) => `${at(daysAgo, 12, 0).slice(0, 10)}T12:00:00.000Z`
  const exams = [
    { key: 'e3', name: 'Advanced blood test', collectedAt: drawDay(2), company: 'Medichecks', meta: { dateSource: 'report', fasted: true }, examType: 'Venous draw' },
    { key: 'e2', name: 'Follow-up blood test', collectedAt: drawDay(86), company: 'Medichecks', meta: { dateSource: 'report' }, examType: 'Venous draw' },
    { key: 'e1', name: 'Baseline blood test', collectedAt: drawDay(182), company: 'Medichecks', meta: { dateSource: 'report' }, examType: 'Venous draw' },
  ]
  const eid = {}
  for (const e of exams) { const { key, ...row } = e; eid[key] = await add('exams', { ...row, ...sync() }) }
  // marker, unit, low, high, [latest, mid, baseline]
  const M = [
    ['Total Testosterone', 'nmol/L', 8.6, 29, [32.1, 27.4, 12.1]],
    ['Free Testosterone', 'nmol/L', 0.2, 0.62, [0.78, 0.69, 0.24]],
    ['Estradiol', 'pmol/L', 41, 159, [112, 90, 78]],
    ['SHBG', 'nmol/L', 18.3, 54.1, [24, 26, 31]],
    ['LH', 'IU/L', 1.7, 8.6, [0.2, 0.3, 4.1]],
    ['FSH', 'IU/L', 1.5, 12.4, [0.3, 0.3, 3.8]],
    ['Prolactin', 'mIU/L', 86, 324, [210, 198, 176]],
    ['Hematocrit', '%', 37, 50, [52.1, 48.7, 45.2]],
    ['Hemoglobin', 'g/L', 130, 170, [168, 160, 151]],
    ['Total Cholesterol', 'mmol/L', 0, 5, [5.4, 4.9, 4.6]],
    ['LDL Cholesterol', 'mmol/L', 0, 3, [3.4, 2.9, 2.6]],
    ['HDL Cholesterol', 'mmol/L', 1.0, 2.2, [1.1, 1.2, 1.4]],
    ['Triglycerides', 'mmol/L', 0, 1.7, [1.3, 1.1, 1.0]],
    ['ALT', 'U/L', 10, 50, [62, 41, 28]],
    ['AST', 'U/L', 0, 40, [38, 31, 24]],
    ['GGT', 'U/L', 10, 71, [28, 25, 22]],
    ['Creatinine', 'µmol/L', 59, 104, [98, 92, 88]],
    ['eGFR', 'mL/min/1.73m²', 60, undefined, [88, 90, 92]],
    ['TSH', 'mIU/L', 0.27, 4.2, [1.8, 1.9, 2.1]],
    ['Free T4', 'pmol/L', 12, 22, [15.2, 15.8, 16.1]],
    ['Vitamin D', 'nmol/L', 50, 175, [68, 54, 41]],
    ['Ferritin', 'µg/L', 30, 400, [48, 61, 80]],
    ['CRP', 'mg/L', 0, 5, [1.1, 0.8, 0.9]],
    ['HbA1c', 'mmol/mol', 20, 41, [34, 35, 35]],
    ['PSA', 'µg/L', 0, 2.5, [0.8, 0.7, 0.6]],
  ]
  const keys = ['e3', 'e2', 'e1']
  for (const [marker, unit, low, high, vals] of M) {
    vals.forEach(async (v, i) => {
      await add('results', { examId: eid[keys[i]], marker, value: v, rawValue: String(v), unit, low, high, source: 'pdf', ...sync() })
    })
  }

  await add('files', { name: 'medichecks-advanced-trt.pdf', type: 'application/pdf', size: 248_312, addedAt: at(2, 21, 5), status: 'Reviewed', ...sync() })
  await add('vials', { compoundId: cid['Testosterone Enanthate'], label: 'Test E 250 mg/mL', totalMl: 10, concentrationMgPerMl: 250, remainingMl: 4.6, openedAt: at(21, 8, 0), ...sync() })

  await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })
  db.close()
  return stores
})
console.log('seeded stores:', seeded.join(', '))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const shot = async (name) => {
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}.png`, type: 'png' })
  console.log('shot', name)
}
const home = async () => {
  await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
}

// 1. Home
await page.evaluate(() => window.scrollTo(0, 0))
await shot('home')

// Scroll so a card sits just under the sticky header.
const HEADER = 68
const scrollToCard = async (locator, fallback) => {
  if (await locator.count()) {
    await locator.evaluate((el, header) => {
      const card = el.closest('[class*="rounded-"]') ?? el
      window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - header)
    }, HEADER)
  } else {
    await page.evaluate((y) => window.scrollTo(0, y), fallback)
  }
}

// 2. Active levels (home, scrolled to the chart)
await scrollToCard(page.locator('h3, h2, p', { hasText: /^Active levels$/ }).first(), 620)
await shot('levels')

// 2b. What needs a look (home; the blood pressure row's detail sheet open)
await scrollToCard(page.locator('h3', { hasText: /^What needs a look$/ }).first(), 700)
const bpRow = page.locator('button', { hasText: /Blood pressure(Up|Averaging)/ }).first()
if (await bpRow.count()) { await bpRow.click(); await page.waitForTimeout(500) }
await shot('wellbeing')
await page.keyboard.press('Escape')

// 3. Log a shot
await home()
await page.getByRole('button', { name: /^Injection/ }).first().click()
await page.waitForTimeout(900)
await shot('shot')

// 4. Timeline
await home()
await page.getByRole('button', { name: /^Timeline/ }).first().click()
await page.waitForTimeout(900)
await shot('timeline')

// 5 + 6. Bloods: the Latest summary, then one marker over time
await home()
await page.getByRole('button', { name: /^Bloods/ }).first().click()
await page.waitForTimeout(1500)
await page.evaluate(() => window.scrollTo(0, 0))
await shot('bloods')
await page.evaluate(() => { location.hash = '#marker/hematocrit' })
await page.waitForTimeout(1200)
await page.evaluate(() => window.scrollTo(0, 0))
await shot('analysis')
if (DESKTOP) { await page.evaluate(() => { location.hash = '#tests' }); await page.waitForTimeout(900); await shot('labs-top') }

// 7. Doctor report for the latest test (Bloods → For your doctor)
await home()
await page.getByRole('button', { name: /^Bloods/ }).first().click()
await page.waitForTimeout(1200)
const doctor = page.getByRole('button', { name: /For your doctor/ }).first()
if (await doctor.count()) {
  await doctor.click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('export')
} else {
  console.log('doctor report button not found')
}

await browser.close()
