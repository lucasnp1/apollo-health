// Writes public/.well-known/assetlinks.json for the Google Play TWA.
//
//   node scripts/play-assetlinks.mjs <SHA256_FINGERPRINT> [packageName]
//
// The fingerprint comes from Play Console AFTER the app is created:
//   Release > Setup > App signing > "SHA-256 certificate fingerprint"
// Use the APP SIGNING key, not the upload key. Getting that wrong is the most
// common reason a TWA shows the browser address bar instead of running
// full-screen, and it fails silently.
//
// Until a real fingerprint exists the file is an empty array, which is valid
// JSON meaning "no app is verified for this domain". That is honest, and it
// keeps the path serving application/json so the wiring can be tested before
// there is anything to put in it.
import fs from 'node:fs'
import path from 'node:path'

const [fingerprint, pkg = 'fit.magno.twa'] = process.argv.slice(2)
if (!fingerprint) {
  console.error('usage: play-assetlinks.mjs <SHA256_FINGERPRINT> [packageName]')
  console.error('example: play-assetlinks.mjs AA:BB:CC:... fit.magno.twa')
  process.exit(1)
}
const clean = fingerprint.trim().toUpperCase()
if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(clean)) {
  console.error(`That does not look like a SHA-256 fingerprint.
Expected 32 colon-separated hex pairs, got ${clean.split(':').length} parts.`)
  process.exit(1)
}

const out = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [clean] },
}]
const file = path.resolve('public/.well-known/assetlinks.json')
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${file}\n  package: ${pkg}\n  fingerprint: ${clean.slice(0, 17)}...`)
console.log('\nDeploy, then verify it is served as JSON:')
console.log('  curl -s https://magno.fit/.well-known/assetlinks.json')
