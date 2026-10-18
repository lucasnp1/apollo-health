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
| Keywords | `injection,tracker,log,bloodwork,lab,results,blood,pressure,weight,diary,journal,health,shots,peptide` | 99 / 100 |
| Promotional text | Every injection, blood test, weight and blood pressure reading in one clean timeline, kept on your phone. | 104 / 170 |
| Primary category | Health & Fitness | |
| Secondary category | Medical | |
| Copyright | `2026 Lucas Paraizo` | |
| Support URL | `https://magno.fit` | |
| Marketing URL | `https://magno.fit` | |
| Privacy policy URL | `https://magno.fit/privacy.html` | |

Name and subtitle say "protocol", never "TRT" or a drug name (the playbook's copy rule; Apple 1.4.3 and the ad rules
in references/regulatory-risk.md). "peptide" in keywords is a search word only, never a promise; drop it if review asks.

### Description

```
Magno is a clean log for your protocol: every injection, blood test, weight and blood pressure reading in one timeline.

LOG IT IN SECONDS
• Injections exactly as you took them: compound, dose, what you drew, syringe, needle, site and vial notes
• Weight, blood pressure and pulse
• Check-ins: mood, energy, sleep, libido and side effects on a 0 to 5 scale
• Log now or any time before: pick the date and time

YOUR BLOOD TESTS, READABLE
• Import a lab report from a PDF or a photo. It's read on your iPhone, and you check every value before it's saved
• Or type results in by hand
• Every result against your lab's own reference range
• Each marker over time, across all your tests

SEE IT TOGETHER
• Your doses and your lab results on the same timeline
• Weight and blood pressure trends
• Home shows what you logged last and your week at a glance

YOURS
• No account needed: everything stays on your iPhone
• With a free Magno account it's backed up and the same on magno.fit
• Export everything any time, free
• Delete your account from the app, any time
• No ads, no trackers

Magno is a log. It records what you did and what your tests measured. It does not diagnose, treat or prevent any condition, it never works out a dose, and it is not a medical device. Talk to your doctor about your treatment and your results.

MAGNO PRO
Pro imports blood tests from a PDF or photo and shows what changed since your last test. It comes as a monthly subscription (first month free) or a single lifetime purchase. Pro bought on magno.fit works here when you sign in.

Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period, and are charged to your Apple ID. Manage or cancel them in Settings.

Terms: https://magno.fit/terms.html
Privacy: https://magno.fit/privacy.html
```

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

## Review notes

```
Magno is a personal log for people on a hormone or peptide protocol prescribed by their doctor. It records what the user did and what their lab tests measured.

It does not calculate doses: the dose and the amount drawn are two separate fields saved exactly as typed, and nothing is converted or suggested (Guideline 1.4.2). It does not estimate hormone levels or interpret results: lab values are shown as the lab printed them, against the lab's own reference range (1.4.1). It never sells or links to any substance (1.4.3).

No account is needed; every feature except backup works signed out. Account deletion: You > Delete account.
Lab import reads PDFs with PDFKit and photos with Apple's Vision framework, on the device.
Magno Pro is free for everyone in this version (billing is not live yet).
```

## Before submitting

- [ ] **Account type (Guideline 5.1.1(ix)):** Apple asks that healthcare apps be submitted by a legal entity. Lucas chose
      to submit as an individual first (18 Oct 2026). If review rejects on 5.1.1(ix), convert the developer account to an
      organisation (needs a D-U-N-S number) and resubmit.
- [x] App ID `app.magno.ios` registered and the App Store Connect record created (18 Oct 2026).
- [ ] **Lucas: accept the updated Apple Developer Program License Agreement** (banner in App Store Connect; only the
      account holder can, and Apple blocks new app submissions until then).
- [x] Screenshots: 6 uploaded 18 Oct 2026 at 1206x2622 (`store/screenshots-6.3/`; sources at 1320x2868 in
      `store/screenshots-6.9/`), Release build with made-up sample data.
- [x] Privacy answers and age rating (entered 18 Oct 2026; see above).
- [ ] Export compliance: HTTPS only, no custom encryption, so `usesNonExemptEncryption: false` (already in app.json).
- [x] TestFlight build 1 uploaded and processed 18 Oct 2026 ("Ready to submit", invite sent); internal group "Me" (Lucas, automatic distribution). Next uploads:
      `mobile/scripts/testflight.sh` (bumps the build number).
- [ ] Lucas tests build 1 on his iPhone.
- [ ] Build 2 (18 Oct night) brings the plain-words reads of results back. Before submitting: rewrite the review notes
      (they say results are not interpreted), recheck the age-rating "Medical info" answer and the description's
      "It does not interpret" lines.
- [x] Release: manual (set). Review contact: Lucas, same as Liber's. Sign-in required: off.
