# Magno: data protection impact assessment (draft, 23 Oct 2026)

A working draft for UK/EU GDPR. Magno handles special-category data (health), so this is required before marketing.
Not legal advice: have it read by a professional before relying on it. Residence (UK vs Switzerland) decides the
regulator and whether ICO registration (data protection fee) applies.

## What, whose, why
- **People:** adults (18+) on a hormone or peptide protocol who choose to log it.
- **Data:** injections (compound, dose as typed, site, notes), blood test results and lab PDFs/photos, weight, blood
  pressure, pulse, check-ins (mood, side effects), reminders; email and sign-in ids for those with an account;
  purchase status.
- **Purpose:** the person's own log. No advertising, no selling, no profiling, no analytics trackers.

## Where it lives
| Data | Where | Who processes it |
|---|---|---|
| The whole log | On the iPhone (SQLite) | Nobody else |
| Lab files during import | Read on the iPhone (PDFKit, Vision) | Nobody else; never uploaded |
| Weight, BP | Apple Health, if the person turns it on | Apple (their device) |
| Backup of the log, account | Cloudflare D1 + Pages Functions | Cloudflare (processor) |
| Password-reset emails | Resend | Resend (processor) |
| Purchase status, anonymous app user id | RevenueCat, Apple | RevenueCat (processor), Apple (seller) |
| Sign-in identity | Apple / Google | Controllers of their own sign-in data |

## Lawful basis
- Contract for the account and backup; **explicit consent (Art. 9(2)(a)) for storing health data on our servers**.
  Signed out, nothing leaves the phone, so no server processing happens.
- **Gap found 23 Oct 2026:** consent is bundled into "by creating an account you agree to the Terms and Privacy";
  Apple/Google sign-in shows nothing. Fix: a separate, specific yes before the first backup, recorded with a timestamp,
  withdrawable (turn off backup = delete server copy, keep phone copy). Being built in Phase 0.

## Risks and measures
| Risk | Likelihood / impact | Measure |
|---|---|---|
| Server breach exposes health logs | low / high | Minimal server data; HTTPS; hashed passwords (Argon2id); no third-party scripts on account pages; D1 access only via our functions |
| Data shown on a lock or home screen | medium / medium | Notifications and the widget never name a drug or dose |
| Wrong data from lab import | medium / medium | Every value confirmed by the person before saving |
| Advice mistaken for medical guidance | medium / high | No dosing, no diagnosis, no "what to do"; "not medical advice" in app and listing |
| Account deletion incomplete | low / high | In-app delete removes server rows and revokes Apple tokens; documented in review notes |
| Processor transfers outside UK/EU | medium / medium | Check Cloudflare, Resend and RevenueCat DPAs and SCCs/IDTA; list them in the privacy policy |

## To do before marketing
1. Explicit consent screen + record (building now).
2. Sign the processor DPAs (Cloudflare, Resend, RevenueCat) and list them in privacy.html.
3. Decide residence; if UK, pay the ICO data protection fee.
4. Have this draft reviewed.
