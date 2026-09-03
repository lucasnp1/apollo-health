// Landing page behaviour. Small on purpose: the page is static HTML with CSS
// animations; this file only handles the few things that need a script.
import './landing.css'

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

// ── How it works: amber rail fills as the steps scroll past ───────────────
const rail = $('#how-rail-fill')
const steps = $('#how-steps')
if (rail && steps) {
  const update = () => {
    const r = steps.getBoundingClientRect()
    const anchor = innerHeight * 0.6
    const progress = Math.min(1, Math.max(0, (anchor - r.top) / r.height))
    rail.style.height = `${Math.round(progress * r.height)}px`
  }
  addEventListener('scroll', update, { passive: true })
  addEventListener('resize', update)
  update()
}

// ── Step 01: the "log a shot" field cycles through a few entries ──────────
const typed = $('#step1-typed')
if (typed && !reduced) {
  const items = ['Testosterone E · 150 mg', 'HCG · 500 IU', 'BPC-157 · 250 mcg', 'Nandrolone · 100 mg']
  let i = 0
  setInterval(() => {
    i = (i + 1) % items.length
    typed.textContent = items[i]
    // Restart the slide-in animation for the new entry.
    typed.classList.remove('apollo-slide-in')
    void typed.offsetWidth
    typed.classList.add('apollo-slide-in')
  }, 2600)
}

// ── Step 03: a result card slides into the bucket Apollo picks ────────────
const card = $('#step3-card')
const buckets = $$('#step3-buckets > div')
const sorting = $('#step3-sorting')
if (card && buckets.length && sorting && !reduced) {
  const samples = [
    { who: 'Hematocrit', text: '52.1% ▲ 7% since December. Above the 52% line.', bucket: 2 },
    { who: 'Estradiol', text: '112 pmol/L, T:E2 ratio 30. Right where it should be.', bucket: 0 },
    { who: 'LDL', text: '3.4 mmol/L, up 17% since your last test.', bucket: 1 },
    { who: 'Blood pressure', text: '134/86 after training. Retake at rest tomorrow.', bucket: 3 },
  ]
  const active = ['scale-[1.04]', 'border-zinc-900/25', 'bg-zinc-50', 'shadow-[0_8px_18px_-14px_rgba(24,24,27,0.45)]']
  const idle = ['border-zinc-200', 'bg-white', 'shadow-[0_3px_12px_-10px_rgba(24,24,27,0.35)]']
  let i = 0
  const run = () => {
    const s = samples[i]
    card.querySelector('[data-who]')!.textContent = s.who
    card.querySelector('[data-text]')!.textContent = `“${s.text}”`
    card.style.transition = 'none'
    card.style.transform = 'translate(0, 0)'
    card.style.opacity = '1'
    buckets.forEach((b) => { b.classList.remove(...active); b.classList.add(...idle) })
    sorting.style.opacity = '1'
    setTimeout(() => {
      const target = buckets[s.bucket].getBoundingClientRect()
      const from = card.getBoundingClientRect()
      const dx = target.left - from.left + 8
      const dy = target.top - from.top + (target.height - from.height) / 2
      card.style.transition = 'transform 850ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms'
      card.style.transform = `translate(${dx}px, ${dy}px) scale(0.72)`
      setTimeout(() => {
        card.style.opacity = '0'
        sorting.style.opacity = '0'
        buckets[s.bucket].classList.remove(...idle)
        buckets[s.bucket].classList.add(...active)
      }, 700)
    }, 1300)
    i = (i + 1) % samples.length
  }
  run()
  setInterval(run, 3600)
}

// ── Step 04: one action pill lights up at a time ──────────────────────────
const pills = $$('#step4-pills > span')
if (pills.length && !reduced) {
  let i = 3
  setInterval(() => {
    pills[i].classList.remove('scale-[1.04]', 'opacity-100')
    pills[i].classList.add('scale-95', 'opacity-55')
    i = (i + 1) % pills.length
    pills[i].classList.remove('scale-95', 'opacity-55')
    pills[i].classList.add('scale-[1.04]', 'opacity-100')
  }, 1600)
}

// ── Inside Apollo: screens cycle while in view, until someone picks one ───
const insideStrip = $('#inside-tabs')
const insideTabs = $$<HTMLButtonElement>('#inside-tabs [data-shot]')
const insideImgs = $$<HTMLImageElement>('#inside-screen [data-shot-img]')
if (insideStrip && insideTabs.length && insideImgs.length) {
  let idx = 0
  let timer = 0
  let pinned = false
  const apply = (i: number) => {
    idx = i
    insideTabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === i)))
    insideImgs.forEach((im, j) => im.classList.toggle('opacity-0', j !== i))
    // Mobile: the strip scrolls sideways, so keep the active tab in view. Never
    // scroll the page itself (this also runs while the visitor reads elsewhere).
    if (insideStrip.scrollWidth > insideStrip.clientWidth) {
      insideStrip.scrollTo({ left: Math.max(0, insideTabs[i].offsetLeft - 24), behavior: reduced ? 'auto' : 'smooth' })
    }
  }
  // Screens past the first load lazily; fetch and decode before the crossfade
  // so the phone never shows an empty screen.
  const show = (i: number) => {
    const im = insideImgs[i]
    if (im.complete && im.naturalWidth > 0) { apply(i); return }
    im.loading = 'eager'
    im.decode().catch(() => undefined).then(() => apply(i))
  }
  const stop = () => { clearInterval(timer); timer = 0 }
  const start = () => { if (!timer && !pinned && !reduced) timer = window.setInterval(() => show((idx + 1) % insideTabs.length), 3800) }
  insideTabs.forEach((t, i) => t.addEventListener('click', () => { pinned = true; stop(); show(i) }))
  new IntersectionObserver((entries) => { if (entries[0].isIntersecting) start(); else stop() }, { threshold: 0.35 }).observe(insideStrip)
}

// ── Footer: amber magnifier lens follows the pointer over the wordmark ────
const footer = $('#site-footer')
const stage = $('#lens-stage')
const wordmark = $('#lens-wordmark')
if (footer && stage && wordmark) {
  footer.dataset.awake = 'true'
  let raf = 0
  const move = (e: PointerEvent) => {
    const s = stage.getBoundingClientRect()
    const w = wordmark.getBoundingClientRect()
    const x = e.clientX; const y = e.clientY
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      footer.style.setProperty('--footer-lens-stage-x', `${((x - s.left) / s.width) * 100}%`)
      footer.style.setProperty('--footer-lens-stage-y', `${((y - s.top) / s.height) * 100}%`)
      footer.style.setProperty('--footer-lens-mark-x', `${((x - w.left) / w.width) * 100}%`)
      footer.style.setProperty('--footer-lens-mark-y', `${((y - w.top) / w.height) * 100}%`)
      footer.style.setProperty('--footer-lens-rotate', `${Math.max(-8, Math.min(8, (x - s.left - s.width / 2) / 60))}deg`)
    })
  }
  stage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { footer.dataset.lensActive = 'true'; move(e) } })
  stage.addEventListener('pointermove', (e) => { if (footer.dataset.lensActive === 'true') move(e) })
  stage.addEventListener('pointerleave', () => { footer.dataset.lensActive = 'false' })
}
