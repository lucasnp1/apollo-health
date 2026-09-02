// On-device OCR (tesseract.js) for scanned lab PDFs and photos. Everything is
// self-hosted under /ocr (worker, wasm core, English model) so nothing leaves
// the device and the strict CSP stays intact. Loaded lazily: the OCR bundle
// only downloads the first time a page without a text layer shows up.

import type { PDFPageProxy } from 'pdfjs-dist'
import type { Worker as TesseractWorker } from 'tesseract.js'

const OCR_BASE = '/ocr'
const IDLE_MS = 90_000
const TARGET_WIDTH = 1800

let workerPromise: Promise<TesseractWorker> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let progressSink: ((pct: number) => void) | null = null

// WebAssembly SIMD support probe (the standard 30-byte module from
// wasm-feature-detect). Picks the faster core when available.
function wasmSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))
  } catch {
    return false
  }
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js')
      const core = `${OCR_BASE}/${wasmSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'}`
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${OCR_BASE}/worker.min.js`,
        corePath: core,
        langPath: OCR_BASE,
        gzip: true,
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') progressSink?.(Math.round(m.progress * 100))
        },
      })
      // One column of variable-size text: reads a results table row by row
      // instead of column by column, which is what the line parser needs.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN, preserve_interword_spaces: '1' })
      return worker
    })().catch((err) => {
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const p = workerPromise
    workerPromise = null
    void p?.then((w) => w.terminate()).catch(() => {})
  }, IDLE_MS)
}

async function recognizeCanvas(canvas: HTMLCanvasElement, onProgress?: (pct: number) => void): Promise<string[]> {
  const worker = await getWorker()
  progressSink = onProgress ?? null
  try {
    const { data } = await worker.recognize(canvas)
    return data.text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  } finally {
    progressSink = null
    touchIdle()
  }
}

// Render a pdf.js page to a canvas at a resolution OCR likes (~1800px wide).
export async function recognizePdfPage(page: PDFPageProxy, onProgress?: (pct: number) => void): Promise<string[]> {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(3, Math.max(1.5, TARGET_WIDTH / base.width))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  try {
    return await recognizeCanvas(canvas, onProgress)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

// A photo or screenshot of a report. Scaled so the long side is large enough
// for OCR but small enough to keep memory sane on phones.
export async function recognizeImage(file: Blob, onProgress?: (pct: number) => void): Promise<string[]> {
  const bitmap = await createImageBitmap(file)
  try {
    const target = Math.min(2400, Math.max(TARGET_WIDTH, bitmap.width))
    const scale = target / bitmap.width
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    try {
      return await recognizeCanvas(canvas, onProgress)
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    bitmap.close()
  }
}
