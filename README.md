# Atlas Health

Local-first personal health tracker for medication/injection logs, blood pressure, lab exams, biomarkers, and exam PDFs.

## Privacy model

- No account required.
- No backend configured.
- No analytics scripts.
- Health data is stored in the browser with IndexedDB.
- PDF text extraction runs locally in the browser before the user reviews and saves biomarkers.

This is a personal record and trend tool. It is not medical advice and does not diagnose, prescribe, or recommend dose changes.

## Tech stack

- React + TypeScript + Vite
- Ionic React styling foundation in iOS mode
- Dexie / IndexedDB for local storage
- Recharts for trends
- PDF.js for local PDF text extraction
- Vite PWA for installable web app support

## Run locally

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:5173`.

## Build

```bash
npm run lint
npm run build
```

## App Store path

The current app is a PWA. Later, it can be wrapped with Capacitor for iOS/Android while keeping the same local-first data model.
