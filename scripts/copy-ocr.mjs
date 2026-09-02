// Copies the tesseract.js worker + wasm cores from node_modules into
// public/ocr so OCR is served from our own origin (no CDN, CSP-safe).
// The English model (eng.traineddata.gz) is committed alongside them.
// Runs before `vite build` and `vite` (see package.json scripts).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'ocr')
mkdirSync(out, { recursive: true })

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
]
for (const [from, to] of files) {
  const src = join(root, 'node_modules', from)
  if (!existsSync(src)) throw new Error(`copy-ocr: missing ${from} (run npm install)`)
  copyFileSync(src, join(out, to))
}
if (!existsSync(join(out, 'eng.traineddata.gz'))) {
  console.warn('copy-ocr: public/ocr/eng.traineddata.gz is missing; OCR will not work')
}
