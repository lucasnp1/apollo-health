# Decisions

## Native iOS app (`mobile/`), started 18 Oct 2026

The iOS app is an Expo (SDK 57, expo-router) app in `mobile/`, on branch `native`. It reuses the web app's logic from
`src/lib` directly: Dexie runs on an in-memory IndexedDB (fake-indexeddb) and every committed write is copied into
SQLite on the phone (`mobile/src/data/persist.ts`), the same foundation as Liber's native app. The website is not
changed by any of this.

Decided by Lucas, 18 Oct 2026, for the iOS app only:

- **Dosing: log, never calculate.** The injection screen saves the dose, what was drawn (units or mL), syringe,
  needle, site and vial details exactly as typed. The web's dose <-> draw conversion, syringe advice and draw marks
  (`src/lib/dose.ts`) do not ship: Apple 1.4.2 treats that as a dosage calculator. The vial maths (`src/lib/vials.ts`,
  and `src/lib/injections.ts`, which uses it) is kept out too. `mobile/metro.config.js` fails the build if any of them
  is imported. Lucas isn't fully happy with this: the "Drawn" field is one component
  (`mobile/src/app/log/injection.tsx`, `Drawn`) so a better approach can replace it.
- **Levels chart** (phase 4): a timeline of logged doses per compound with real lab results on the same axis, instead
  of the estimated active-levels curve. `src/lib/pk.ts` and its half-life table do not ship (Apple 1.4.1, 1.4.3), also
  enforced by metro.config.js. Lucas wants a better solution later.
- Submit as an individual developer first. In-app purchase sits behind `extra.billing.live` (off) while Apple's Paid
  Apps agreement is stuck.
- **Money (phase 6):** RevenueCat is the one place that decides who has paid. iPhone purchases go through Apple; the
  web's Stripe account is connected to RevenueCat so web purchases count too, keyed by the Magno account id. Same
  prices on iPhone as on the web: £4.99 a month, £99 lifetime. On 18 Oct 2026 Stripe had no Magno subscribers or
  completed checkouts, so nothing needs migrating. Switching the website's own paywall check to RevenueCat is a web
  change and waits for Lucas's OK.

Syringe and vial details have no column of their own on an injection, so they are saved as lines under the note
("Syringe: 50 unit insulin", "Vial: 250 mg/mL"), which the web shows as well. The syringe is also remembered on the
compound with the web's own key, so either app picks it again next time.

### State, 18 Oct 2026 (end of day: phases 1 to 6 built, 7 prepared)

All tested in the iOS simulator (iPhone 18 Pro, iOS 27), Release build:

- **Logging:** injections (log, never calculate), weight, blood pressure, check-ins, each with a "When" picker for
  past entries. Home (three tiles, trends, latest) and Timeline (by day, filter, archive).
- **Labs:** import a PDF (PDFKit) or a photo (Vision), both read on the phone by `mobile/modules/labreader` and parsed
  by the web's own `src/lib/pdf.ts`; check every row before saving; enter by hand; test detail against the lab's own
  range; marker history. (Changed 18 Oct night, see below: the web's plain-words reads are now in the app.)
- **Charts:** weight, blood pressure, and doses with lab results on one time axis (replaces the levels curve).
- **Account (optional):** sign in or create, recovery codes, sync through the web's own engine, sign out (clears the
  phone), delete account in the app. Tested against a local copy of the server; never against live magno.fit.
- **Money:** RevenueCat project "Magno" set up (entitlement `pro`, `magno_pro_monthly`, `magno_pro_lifetime`, default
  offering); paywall in the app; Pro = RevenueCat or the server's Stripe plan. `extra.billing.live` is off, so
  everyone has Pro. Pro gates: lab import from PDF/photo and "Before:" (change since the last test), as on the web.
- **Store:** `mobile/store/app-store.md` has every App Store Connect field, drafts for privacy and age rating, review
  notes and the checklist.

Open, for Lucas: the App Store Connect record and products, RevenueCat keys and the Stripe connection, privacy and age
answers, then TestFlight. Note the web puts export behind Pro, which the iOS app does not (the playbook's "never
paywall the user's own data or export"): his call whether the web follows.

### State, 18 Oct 2026 (night: TestFlight build 2)

Lucas asked overnight for the Home widgets split, the bloods "what's up" read back, wellbeing back, an audit of
everything the web had, notifications and the doctor export. Done and simulator-tested:

- **Home:** one widget style (eyebrow, title, action) for Insights, Injections, Bloods, Wellbeing, Weight, Pressure and
  Latest. Injections show each shot's dose and day per compound, with Week/Month/3M/All ranges; compounds with no shot
  in the range are hidden.
- **Interpretation is back (Lucas's call, overrides the earlier "no interpretation" line):** Home insights, the test
  report's plain-words reads ("Read what this means"), marker explanations, using the web's own `homeInsights`,
  `labFindings`, `labRules` and `labCopy`. Dosing is still log-only. Risk: Apple 1.4.1 and the medical-device line. The
  App Store age-rating answer (Medical info: Infrequent), the not-a-medical-device declaration and the review notes
  ("does not interpret results") must be revisited before submitting.
- **Bloods:** Latest/Tests/Markers, add/edit/add-to-test with same-draw and duplicate checks, merge, compare, archive with
  undo, blood-lettings, doctor PDF.
- **Also:** Apple Health (weight and BP, both ways), reminders per kind (local notifications), export for your doctor
  (PDF and CSV, free), archive, edit any entry, site rotation, change password, recovery codes, feedback.

### 19 Oct 2026: Lucas's review of build 2, fixed for build 3

Light mode (follows the phone, or set in You > Display; `src/theme.ts` dynamic colours, `src/appearance.ts`); Apple's
sheet buttons (native X and prominent tick, `unstable_header*Items`); Injections widget: week by default, no site,
title is the count (not a compound), "See all in Timeline" opens the Timeline filtered to injections and that range;
Bloods widget removed (What needs a look already reads the bloods); pulse (bpm) on the Pressure widget and tile;
Blood pressure next to Injection on Home, plus Ancillary and Blood test buttons; ancillaries (`log/ancillary`: route
Oral or Other, compound category Ancillary, "For:" line naming the side effects) shown under the Wellbeing chart on
the same time axis and as their own Timeline type; Timeline filters in Apple pull-down menus (type, compound, range),
no sideways scrolling, and Export takes what's shown to the doctor export; no "free" copy in the app.

### 19 Oct 2026, later: Lucas's second review, fixed for build 4

- **Injection sheet:** compound, vial, syringe, needle and "Other site" are single native menus (no pill lists). The
  compound menu shows only compounds injected on that route (or set to it, or never injected); ancillaries never show.
  Vials are remembered per compound and picked again ("New vial…" to type one). Under the dose: what you did last time
  on that route ("50 mg, drew 0.25 mL, 250 mg/mL"), read back from your log. Dose and draw are still never converted
  into each other (Apple 1.4.2). Site tiles show both dates: this exact spot, and the spot next to it on the same muscle.
  The When and menu rows no longer drift up near the bottom of a sheet (SwiftUI hosts ignore the safe area).
- **Wellbeing tile** on Home has the two 0-5 lines, like the weight and pressure tiles.
- **Apple Health never deletes, either way** (Lucas): already true; written into src/health.ts.
- **Faster start:** the saved rows go straight into IndexedDB at launch (no Dexie hooks), queries read whole tables
  instead of walking cursors, Home's Latest reads only the newest rows, the charts below the fold draw a frame later,
  sync/Health/reminders/billing start after the first screen, and the shared protocolAtDraw formats the draw day once
  per test instead of once per dose. With a realistic history (2,000 weights, 450 BP, 340 shots, 13 tests) on the
  simulator: splash gone 0.82 s -> 0.58 s, all logs on screen 1.9 s -> ~1.0 s, blood tests ~1.5 s.
- **Personal target ranges** per marker (marker screen > Your target): the web's markerTargets, read by the shared
  rules, dashed lines on the chart.
- **Spreadsheet import** (Bloods > Add > Spreadsheet): CSV/TSV by the web's parseLabTable; Excel unzipped on the phone
  by modules/labreader SheetReader.swift (Compression + XMLParser).
- **Onboarding** (app/welcome.tsx, once): welcome + sign in, what you inject (name + route), Apple Health, reminders,
  appearance. Light theme was done in build 3.

**To do next (Lucas, 19 Oct 2026):** share image (MVP+). Dropped: viewing the original lab file (people keep it
themselves). Open: archive the web app? (see below), the interpretation wording for App Review.

**Money on iPhone, like Liber:** Apple in-app purchase through RevenueCat only; the app never talks to Stripe. Stripe
only matters for the website, which can keep it or move to RevenueCat Web Billing later (a web change, Lucas's call).

How to build it for the simulator:

```
cd mobile && npx expo prebuild -p ios --clean
xcodebuild -workspace ios/Magno.xcworkspace -scheme Magno -configuration Release -sdk iphonesimulator \
  -derivedDataPath ios/build/dd
xcrun simctl install booted ios/build/dd/Build/Products/Release-iphonesimulator/Magno.app
```

CocoaPods needs `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`. `mobile/ios` is generated and not committed.
