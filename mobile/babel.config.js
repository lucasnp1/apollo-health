// Dexie keeps a transaction alive across `await` by swapping the global Promise while inside it. Hermes runs async
// functions natively, which bypasses that, so the shared code's transactions committed early. Compiled to generators,
// every await goes through the global Promise again.
// import.meta: the web's db.ts reads import.meta.env (Vite) in its dev-only seed, which the app never runs; this makes
// it parse on Hermes.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: ['@babel/plugin-transform-async-to-generator'],
  }
}
