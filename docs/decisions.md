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

Syringe and vial details have no column of their own on an injection, so they are saved as lines under the note
("Syringe: 50 unit insulin", "Vial: 250 mg/mL"), which the web shows as well. The syringe is also remembered on the
compound with the web's own key, so either app picks it again next time.

### State, 18 Oct 2026 (phases 1 and 2 done)

- Runs in the iOS simulator (iPhone 18 Pro, iOS 27) as a Release build with data kept on the device.
- Home: greeting, Add to your log (injection, weight, blood pressure, check-in), pressure / weight / wellbeing tiles
  with sparklines, latest five entries.
- Timeline: every entry by day, filter by kind, press and hold to archive (restorable, like the web).
- Not in the app yet: labs (phase 3), charts and "What needs a look" (phase 4), accounts and sync (phase 5),
  in-app purchase (phase 6). Data stays on the phone until sync lands: nothing reaches magno.fit yet.

How to build it for the simulator:

```
cd mobile && npx expo prebuild -p ios --clean
xcodebuild -workspace ios/Magno.xcworkspace -scheme Magno -configuration Release -sdk iphonesimulator \
  -derivedDataPath ios/build/dd
xcrun simctl install booted ios/build/dd/Build/Products/Release-iphonesimulator/Magno.app
```

CocoaPods needs `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`. `mobile/ios` is generated and not committed.
