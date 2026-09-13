// "Share this read": a 1080x1350 PNG of the written summary, drawn with the
// Canvas 2D API (no dependencies). Used by the Labs page and the public
// /read tool. The footer names the site so a shared card carries the name.

import type { LabStats } from './labStats'

export type ShareCardInput = {
  paragraphs: string[]
  stats: LabStats
  findings: Array<{ label: string; headline: string; status: 'good' | 'warn' | 'bad' | 'none' }>
  /** Shown under the title, e.g. "Advanced TRT panel · Medichecks · Sep 1, 2026". */
  subtitle?: string
  /** Site to name in the footer, without protocol. */
  site?: string
}

const W = 1080
const H = 1350
const PAD = 72
const INNER = W - PAD * 2

const INK = '#eef1f6'
const MUTED = '#aeb2bb'
const FAINT = '#7c8190'
const BG = '#14161c'
const CARD = '#1d2027'
const AMBER = '#f5b042'
const STATUS: Record<ShareCardInput['findings'][number]['status'], string> = {
  good: '#3ecf8e',
  warn: '#f5b042',
  bad: '#f26b5e',
  none: '#7c8190',
}

const SANS = '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace'

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w
    if (ctx.measureText(probe).width <= maxWidth || !line) line = probe
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = '/logo-128.png'
  })
}

export async function drawShareCard(input: ShareCardInput): Promise<Blob> {
  // The @font-face rules live in index.css; make sure the faces are in
  // memory before drawing, or the canvas falls back to the system font.
  try {
    await Promise.all([
      document.fonts.load(`600 44px ${SANS}`),
      document.fonts.load(`400 30px ${SANS}`),
      document.fonts.load(`500 22px ${MONO}`),
    ])
  } catch { /* draw with whatever is available */ }
  const logo = await loadLogo()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  // Faint amber wash top-right, like the app's hero glow.
  const glow = ctx.createRadialGradient(W - 120, 40, 20, W - 120, 40, 620)
  glow.addColorStop(0, 'rgba(245,176,66,0.16)')
  glow.addColorStop(1, 'rgba(245,176,66,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  let y = PAD
  // Header: logo + wordmark + eyebrow
  if (logo) {
    ctx.save()
    roundRect(ctx, PAD, y, 64, 64, 16)
    ctx.clip()
    ctx.drawImage(logo, PAD, y, 64, 64)
    ctx.restore()
  }
  ctx.fillStyle = INK
  ctx.font = `600 34px ${SANS}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Apollo Health', PAD + 84, y + 42)
  ctx.fillStyle = AMBER
  ctx.font = `500 20px ${MONO}`
  ctx.fillText('YOUR BLOODS, READ', PAD + 84 + ctx.measureText('').width + 232, y + 42)
  y += 64 + 36

  if (input.subtitle) {
    ctx.fillStyle = MUTED
    ctx.font = `400 26px ${SANS}`
    ctx.fillText(input.subtitle, PAD, y + 26)
    y += 26 + 30
  }

  // Paragraphs: the first one large.
  const [first, ...rest] = input.paragraphs
  if (first) {
    ctx.fillStyle = INK
    ctx.font = `600 44px ${SANS}`
    for (const line of wrap(ctx, first, INNER)) { ctx.fillText(line, PAD, y + 44); y += 56 }
    y += 14
  }
  ctx.fillStyle = '#d7dae0'
  ctx.font = `400 30px ${SANS}`
  for (const p of rest.slice(0, 2)) {
    for (const line of wrap(ctx, p, INNER)) { ctx.fillText(line, PAD, y + 30); y += 42 }
    y += 12
  }
  y += 16

  // Four count tiles.
  const tiles: Array<{ label: string; value: string; color: string }> = [
    { label: 'Markers', value: String(input.stats.markers), color: INK },
    { label: 'In range', value: String(input.stats.inRange), color: STATUS.good },
    { label: 'Out of range', value: String(input.stats.outOfRange), color: input.stats.outOfRange > 0 ? STATUS.bad : INK },
    { label: 'Last test', value: input.stats.lastTest ?? '—', color: INK },
  ]
  const gap = 16
  const tw = (INNER - gap * 3) / 4
  const th = 124
  tiles.forEach((t, i) => {
    const x = PAD + i * (tw + gap)
    ctx.fillStyle = CARD
    roundRect(ctx, x, y, tw, th, 18)
    ctx.fill()
    ctx.fillStyle = MUTED
    ctx.font = `500 20px ${MONO}`
    ctx.fillText(t.label.toUpperCase(), x + 22, y + 44)
    ctx.fillStyle = t.color
    ctx.font = `600 46px ${SANS}`
    ctx.fillText(t.value, x + 22, y + 100)
  })
  y += th + 36

  // Up to four panel verdicts, while there is room above the footer.
  const footerTop = H - PAD - 40
  for (const f of input.findings.slice(0, 4)) {
    if (y + 80 > footerTop) break
    ctx.fillStyle = STATUS[f.status]
    ctx.beginPath()
    ctx.arc(PAD + 10, y + 26, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.font = `600 32px ${SANS}`
    ctx.fillText(f.label, PAD + 36, y + 36)
    ctx.fillStyle = MUTED
    ctx.font = `400 26px ${SANS}`
    const [headline] = wrap(ctx, f.headline, INNER - 36)
    ctx.fillText(headline, PAD + 36, y + 70)
    y += 92
  }

  // Footer
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, footerTop)
  ctx.lineTo(W - PAD, footerTop)
  ctx.stroke()
  ctx.fillStyle = FAINT
  ctx.font = `500 22px ${MONO}`
  const site = input.site ?? window.location.host
  ctx.fillText(`Not medical advice  ·  Read yours at ${site}/read`, PAD, footerTop + 40)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not render the card'))), 'image/png')
  })
}

// Share sheet on phones, download elsewhere. Mirrors ExportSheet's pattern.
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
