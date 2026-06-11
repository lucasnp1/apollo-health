<p align="center">
  <img src="public/logo-256.png" alt="Apollo Health" width="160" />
</p>

<h1 align="center">Apollo Health</h1>

<p align="center">
  Personal health record for protocols, injections, vitals, and lab biomarkers.<br />
  Local-first, end-to-end at <a href="https://apollo-hq.pages.dev">apollo-hq.pages.dev</a>.
</p>

---

## What it does

- Log medications and injections with site rotation
- Track blood pressure with reference ranges and trends
- Parse lab PDFs locally with PDF.js, review each marker, import to your record
- Set protocols (compound + dose + cadence) and auto-link injection logs to scheduled doses
- See projected pharmacokinetics for protocols you know the half-life of
- Optional cross-device sync via a hardened Cloudflare backend (D1 + auth)

## Privacy posture

- No analytics, no third-party trackers.
- Lab PDFs are parsed in the browser; only the values you confirm get stored.
- Cross-device sync runs over HTTPS to a Cloudflare D1 database keyed to your account; you can also run fully local-only without an account.
- Password hashing uses Argon2id (PBKDF2 fallback for legacy accounts).
- The lock screen is a convenience gate, not encryption — local IndexedDB data is stored in plaintext in the browser.

Apollo Health is a personal record and trend tool. It is not medical advice and does not diagnose, prescribe, or recommend dose changes.

## Tech stack

- React 19 + TypeScript + Vite 8
- Dexie / IndexedDB (local storage)
- Cloudflare Pages + D1 (optional backend / sync)
- Recharts (trends), PDF.js (lab parsing), Vite PWA (installable)
- @noble/hashes for Argon2id password hashing

## Run locally

```bash
npm install
npm run dev   # http://127.0.0.1:5173
```

## Build & deploy

```bash
npm run lint
npm run build
# Deploys are pushed to Cloudflare Pages via:
npx wrangler pages deploy dist --project-name=apollo-hq --branch=main
```

## App Store path

Currently shipped as a PWA. Capacitor wrap for the iOS and Android stores is deferred — the install prompt on mobile handles add-to-home-screen for now.
