// node render.mjs <config.json> <outdir>: each shot rendered at 1320x2868 (6.9") and 1206x2622 (6.3"), JPEG.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [cfgPath, out] = process.argv.slice(2)
const shots = JSON.parse(readFileSync(cfgPath, 'utf8'))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
mkdirSync(join(out, '6.9'), { recursive: true })
mkdirSync(join(out, '6.3'), { recursive: true })
const only = process.env.ONLY
for (const [i, s] of shots.entries()) {
  const name = `${String(i + 1).padStart(2, '0')}-${s.name}`
  if (only && !name.includes(only)) continue
  const url = `file://${join(here, 'frame.html')}#${encodeURIComponent(JSON.stringify({ ...s, img: 'file://' + resolve(s.img) }))}`
  const png = join(out, `${name}.png`)
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1', '--virtual-time-budget=4000', '--window-size=1320,2868', `--screenshot=${png}`, url], { stdio: 'ignore' })
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', png, '--out', join(out, '6.9', `${name}.jpg`)], { stdio: 'ignore' })
  execFileSync('sips', ['-z', '2622', '1206', '-s', 'format', 'jpeg', '-s', 'formatOptions', '92', png, '--out', join(out, '6.3', `${name}.jpg`)], { stdio: 'ignore' })
  rmSync(png)
  console.log(name)
}
