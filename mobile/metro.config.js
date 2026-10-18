// The app reuses the web app's logic from ../src (db, symptoms, sites, dates). Packages those files import resolve as if
// imported from this app, so they get this app's React and Dexie, never the web app's copies.
// A shared module that needs the browser (canvas, Blob, WebCrypto) has a native stand-in: src/native/<same name>.ts
// is served in its place to every importer, shared or native. A stand-in reuses the original through @web/lib/<name>.
const fs = require('fs')
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const app = __dirname
const config = getDefaultConfig(app)
const shared = path.resolve(app, '../src')
config.watchFolders = [shared]

const scheduler = path.join(app, 'src/data/scheduling.js')
const native = path.join(app, 'src/native')
// Never in the iOS app (Apple 1.4.1-1.4.3, decided 18 Oct 2026): the dose <-> draw maths (dose, vials, and injections,
// which uses vials) and the estimated levels curve (pk). Importing one fails the bundle instead of shipping it.
// See docs/decisions.md.
const BANNED = ['dose', 'pk', 'vials', 'injections'].map((n) => path.join(shared, 'lib', n + '.ts'))
const bare = (name) => !name.startsWith('.') && !path.isAbsolute(name) && !name.startsWith('@/') && !name.startsWith('@shared/')

function resolve(ctx, name, platform) {
  // fake-indexeddb's scheduler, see src/data/scheduling.js
  if (name.endsWith('/scheduling.js') && ctx.originModulePath.includes(`${path.sep}fake-indexeddb${path.sep}`))
    return { type: 'sourceFile', filePath: scheduler }
  return !ctx.originModulePath.startsWith(app + path.sep) && bare(name)
    ? ctx.resolveRequest({ ...ctx, originModulePath: path.join(app, 'index.ts') }, name, platform)
    : ctx.resolveRequest(ctx, name, platform)
}

// @web/<path> is the web original itself, never swapped: a stand-in imports what it reuses from there. (Metro caches a
// resolution per folder, not per file, so the swap must not depend on who imports.)
const web = (name) => name.startsWith('@web/') && path.join(shared, name.slice('@web/'.length))
const webOnly = path.join(app, 'src/data/webOnly.js')
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (name.startsWith('pdfjs-dist') || name.startsWith('tesseract.js')) return { type: 'sourceFile', filePath: webOnly }
  const original = web(name)
  if (original) return ctx.resolveRequest(ctx, original, platform)
  const res = resolve(ctx, name, platform)
  if (res.type === 'sourceFile' && res.filePath === path.join(shared, 'lib', 'ocr.ts')) return { type: 'sourceFile', filePath: webOnly }
  if (res.type === 'sourceFile' && BANNED.includes(res.filePath))
    throw new Error(`${path.basename(res.filePath)} must not ship in the iOS app (imported by ${ctx.originModulePath})`)
  if (res.type !== 'sourceFile' || !res.filePath.startsWith(path.join(shared, 'lib') + path.sep)) return res
  const stand = path.join(native, path.basename(res.filePath).replace(/\.tsx?$/, '.ts'))
  return fs.existsSync(stand) ? { type: 'sourceFile', filePath: stand } : res
}

module.exports = config
