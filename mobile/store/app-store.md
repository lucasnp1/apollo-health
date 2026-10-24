# Magno on the App Store

Everything App Store Connect asks for, ready to paste. Keep this file and the store in step, and both in step with the
app and the website (prices in `mobile/src/money/plans.ts` and the web's `src/lib/plans.ts`).

**Entered in App Store Connect on 18 Oct 2026** (app id 6824289899, record "Magno: Protocol Log", SKU magno-ios,
primary language English (UK)): everything below, screenshots included. Lucas said "you do it"; answers I chose are marked
in the notes below so he can check them.

## Names and text

| Field | Value | Limit |
|---|---|---|
| Name | `Magno: Protocol Log` | 19 / 30 |
| Subtitle | `Injections, labs and BP` | 23 / 30 |
| Keywords | `trt,testosterone,hrt,hormone,peptide,tracker,bloodwork,lab,shot,site,rotation,blood,pressure,weight` | 99 / 100 |
| Promotional text | Every injection, blood test, weight and blood pressure reading in one clean timeline, kept on your phone. | 104 / 170 |
| Primary category | Health & Fitness | |
| Secondary category | Medical | |
| Copyright | `2026 Lucas Paraizo` | |
| Support URL | `https://magno.fit` | |
| Marketing URL | `https://magno.fit` | |
| Privacy policy URL | `https://magno.fit/privacy` | |

Name and subtitle say "protocol", never "TRT" or a drug name (the playbook's copy rule; Apple 1.4.3 and the ad rules
in references/regulatory-risk.md). "peptide" in keywords is a search word only, never a promise; drop it if review asks. Keywords never repeat words already in the name or subtitle (Apple indexes those). Version 1.1 (created 23 Oct 2026, Prepare for Submission) carries the new set: trt/hrt/hormone/testosterone/site rotation added; log, injection, results, diary, journal, health, shots dropped. 1.0 kept the old set (keywords lock on release).

### Description

```
Magno is a clean log for your protocol: every injection, blood test, weight and blood pressure reading in one timeline.

LOG IT IN SECONDS
• Injections exactly as you took them: compound, dose, what you drew, syringe, needle, site and vial notes
• Weight, blood pressure and pulse
• Check-ins: mood, energy, sleep, libido and side effects on a 0 to 5 scale
• Log now or any time before: pick the date and time

YOUR BLOOD TESTS, READABLE
• Import a lab report from a PDF, a photo or a spreadsheet. It's read on your iPhone, and you check every value before it's saved
• Or type results in by hand
• Every result against your lab's own reference range, or a target range you set with your doctor
• Each marker over time, across all your tests

SEE IT TOGETHER
• Every shot by compound, with the dose and the day
• Weight, blood pressure and pulse, from Apple Health or typed in
• How you've felt, next to the ancillaries you took for side effects
• Reminders you set yourself, and a clean PDF or spreadsheet for your doctor

YOURS
• No account needed: everything stays on your iPhone
• With a Magno account it's backed up and the same on your other devices
• Export everything any time, on every plan
• Delete your account from the app, any time
• No ads, no trackers

Magno is a log. It records what you did and what your tests measured. It does not diagnose, treat or prevent any condition, it never works out a dose, and it is not a medical device. Talk to your doctor about your treatment and your results.

MAGNO PRO
Pro imports blood tests from a PDF, photo or spreadsheet, explains in plain words which results are outside your lab's range and how related markers sit together, and shows what changed since your last test. It comes as a monthly subscription (first month free) or a single lifetime purchase.

Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period, and are charged to your Apple ID. Manage or cancel them in Settings.

Terms: https://magno.fit/terms.html
Privacy: https://magno.fit/privacy.html
```

## Screenshots (redone 24 Oct 2026, go up with the next version after 1.1)

The old set was raw captures with no headline. The new set follows what the big apps share (vault
`04-Growth/app-store-benchmark.md`; health references Function and Welltory): a mono eyebrow, a headline of five words
or fewer with the keyword in amber, one plain sub-line (health apps add one), one idea per shot, a big phone that runs
off the bottom, and a pop-out lifting the detail that proves the headline. Shot 1 is the promise plus honest proof
chips (PRIVATE · NO ADS · NEVER PRESCRIBES); no ratings or awards to show yet, and none are invented.

1. `01-home`: Your protocol, *in one log.* (stat row lifted out)
2. `02-trends`: See what your *bloods* are doing. (marker chart lifted out)
3. `03-results`: Every result, *with its range.*
4. `04-import`: Drop in a *lab PDF.*
5. `05-log`: Log a shot *in seconds.*
6. `06-timeline`: Your whole history, *one timeline.*

`screenshots-6.9/` (1320 x 2868) and `screenshots-6.3/` (1206 x 2622). Raw captures are in `raw/` (the 18 Oct sample-data
captures); words, pop-outs and order are in `shots.json`; from this folder `node render.mjs shots.json .` renders both
sizes through `frame.html`. Note: the raw screens show compound names and user-entered doses (the app's own UI, as
approved on 1.0); captions never name a compound or a dose.

**Next version's text (proposed, goes with the version after 1.1):** subtitle `Injection, Labs & BP Tracker` (28),
which puts "injection" and "tracker" in an indexed field, so the keyword field can drop `tracker` and add another term.

## In-app purchases (created 18 Oct 2026; both "Ready to Submit", they go up with the first app version)

| Product ID | Type | Price | Notes |
|---|---|---|---|
| `magno_pro_monthly` | Auto-renewable subscription, group "Magno Pro" | £4.99 / month | Introductory offer: 1 month free (as on the web) |
| `magno_pro_lifetime` | Non-consumable | £99 | |

RevenueCat project **Magno** (created 18 Oct 2026): app `Magno iOS` (app.magno.ios), entitlement `pro`, both products
attached, default offering with `$rc_monthly` and `$rc_lifetime`. The public SDK key is in `app.json`
(`extra.billing.revenuecatIosKey`). Lucas added the In-App Purchase key and the App Store Connect API key (18 Oct 2026). Optional: connecting the Stripe account to RevenueCat (Project settings > Stripe) so web
purchases count there too. Then set `extra.billing.live` to `true`. Blocked today on Apple's Paid Apps agreement.

## App Privacy (published 18 Oct 2026)

- **Signed out:** no data collected. Everything stays on the device.
- **Signed in (optional account):** Data Linked to You, used for App Functionality only, not for tracking:
  - Health & Fitness: health (injections, blood tests, blood pressure, weight, check-ins)
  - Contact Info: email address
  - Identifiers: user ID
  - Purchases: **not declared yet**: with billing off the app sends no purchase data. Add "Purchase history" when
    `extra.billing.live` goes true.
- Tracking: **No.** No third-party analytics or ads in the app.

## Age rating (answered 18 Oct 2026)

- Medical or Treatment Information: **Infrequent**. Apple defines it as content giving diagnoses or guidance; Magno
  gives neither, but flags results outside the lab's range. Health or wellness topics (self-care advice): No.
- Alcohol, Tobacco, or Drug Use or References: **Infrequent** (prescription compounds are typed in by the user).
- Every feature question (parental controls, web, user content, social, chat, ads) and every other theme: None/No.
- Calculated 13+, **overridden to 18+** because magno.fit's terms require users to be 18 (Apple asks the rating to match
  the minimum age in the terms).
- Regulated medical device declaration: **No, not a regulated medical device in any country.** Content rights: no
  third-party content.

## Review notes (rewritten 19 Oct 2026, build 5)

```
Magno is a personal log for people on a hormone or peptide protocol prescribed by their doctor. It records what the user did and what their lab tests measured.

Dosing: Magno never calculates a dose. The dose and the amount drawn are two separate fields saved exactly as typed; nothing is converted or suggested (Guideline 1.4.2).

Lab results: values are shown as the lab printed them, against the lab's own reference range (or a range the user enters from their doctor). Magno Pro adds short explanations: which results are outside the range, how related markers sit together (for example testosterone and estradiol), and why a marker commonly moves on a protocol. It does not diagnose, does not estimate hormone levels, and never tells the user what to take, what to change or when to act; the app states that it is not medical advice (1.4.1). It never sells or links to any substance (1.4.3).

Apple Health: with the user's permission it reads and writes weight and blood pressure only, and never deletes anything in Health.

No account is needed; every feature except backup works signed out. Account deletion: You > Delete account.
Lab import reads PDFs with PDFKit, photos with Vision and spreadsheets on the device; nothing is uploaded.
Magno Pro: a monthly subscription with a one-month free trial, or a one-time lifetime purchase (In-App Purchase, through RevenueCat). Open You > Magno Pro, or any Pro feature such as Bloods > Add > PDF report. Restore purchases is on the same screen.
```

## Before submitting

- [ ] **Account type (Guideline 5.1.1(ix)):** Apple asks that healthcare apps be submitted by a legal entity. Lucas chose
      to submit as an individual first (18 Oct 2026). If review rejects on 5.1.1(ix), convert the developer account to an
      organisation (needs a D-U-N-S number) and resubmit.
- [x] App ID `app.magno.ios` registered and the App Store Connect record created (18 Oct 2026).
- [x] Agreements (19 Oct 2026): Free and Paid Apps active, Wise bank account active, W-8BEN active (UK treaty,
      Article 12(1), 0%), MRDP answered (no personal services). DSA trader status still "in review" at Apple.
- [x] Screenshots: 6 uploaded 18 Oct 2026 at 1206x2622 (`store/screenshots-6.3/`; sources at 1320x2868 in
      `store/screenshots-6.9/`), Release build with made-up sample data.
- [x] Privacy answers and age rating (entered 18 Oct 2026; see above).
- [ ] Export compliance: HTTPS only, no custom encryption, so `usesNonExemptEncryption: false` (already in app.json).
- [x] TestFlight build 1 uploaded and processed 18 Oct 2026 ("Ready to submit", invite sent); internal group "Me" (Lucas, automatic distribution). Next uploads:
      `mobile/scripts/testflight.sh` (bumps the build number).
- [ ] Lucas tests build 1 on his iPhone.
- [x] Plain-words reads: from build 5 the app flags and explains but never says what to do ("what people usually do"
      and retest lines removed, Lucas 19 Oct 2026). Review notes and description rewritten to match; age rating stays
      "Medical or Treatment Information: Infrequent".
- [x] Release: manual (set). Review contact: Lucas, same as Liber's. Sign-in required: off.

## Ready to submit (19 Oct 2026, build 6)

- Billing live (`extra.billing.live: true`); StoreKit returns both products. Build 6 selected on version 1.0.
- 6 new screenshots (1206x2622, dark, sample data, Pro view). App Privacy now also declares Purchase history
  (linked, app functionality, no tracking). Review notes and description rewritten (no advice lines).
- Both purchases have their review screenshot (`store/iap-review.png`); monthly has the 1-month free intro offer.
- To submit: version 1.0 > Add for review; in the draft submission add the Magno Pro subscription group and the
  lifetime purchase (the first ones must go with a version), then Submit. Release is manual.

## Submitted (19 Oct 2026, 15:33)

Version 1.0 (build 6) sent to App Review with the lifetime purchase, the monthly subscription and its group
("4 items"), status Waiting for Review. Apple says up to 48 hours; release is manual, so it goes live only when
Lucas presses Release. Set on the way: price Free, available in 174 countries (all but mainland China, which needs
an ICP filing), subscription group display name "Magno Pro" (English UK).
