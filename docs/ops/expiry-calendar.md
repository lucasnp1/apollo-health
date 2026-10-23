# Magno expiry calendar

Everything that can expire or lapse and take Magno down with it. Review monthly; act 30 days before each date.
Last checked: 23 Oct 2026.

| Item | Where | Expires / renews | Auto-renew | Action 30 days before |
|---|---|---|---|---|
| magno.fit domain | Cloudflare Registrar | 27 Sep 2027 | Check: needs a card on the Cloudflare account | Confirm renewal, card valid |
| Apple Developer Program | developer.apple.com (team 69Y8AJD573, shared with Liber) | 12 Oct 2027 | **No card on file** (see Liber) | Add a card or renew by hand; a lapse removes both apps from sale |
| App Store distribution certificate | Xcode automatic signing | yearly, auto-managed | yes (Xcode) | Nothing, unless an upload fails on signing |
| Paid Apps agreement, tax, banking (Wise) | App Store Connect > Business | yearly agreement updates | no | Accept new agreement versions when Apple posts them; payouts stop otherwise |
| Sign in with Apple key V6GBRAT3D2 | developer.apple.com > Keys; Pages secret APPLE_PRIVATE_KEY | no expiry | n/a | Revoke and replace if leaked |
| Google OAuth client (iOS) | Google Cloud project fast-flight-512115-n6 | no expiry; consent screen in production | n/a | Re-verify if Google asks for app verification |
| Resend API key + magno.fit domain DKIM | resend.com; Pages secret RESEND_API_KEY | no expiry | n/a | Rotate yearly; check DNS records still verify |
| RevenueCat project projb8d7e318 | revenuecat.com | free tier, no expiry | n/a | Check the App Store shared secret / API key still validates |
| Cloudflare Pages `magnohq` + D1 `apollo-health-db` | Cloudflare | free tier | n/a | Check D1 size against the free limit monthly |
| ADMIN_STATS_TOKEN | Pages secret, ~/.claude/apollo-stats.env | no expiry | n/a | Rotate yearly |
