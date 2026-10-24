---
title: Is Magno legit? Who built it, what it never does, where your data lives
description: A plain account of who makes Magno, what it will never do, where your health log is stored, how it makes money, and the questions to ask of any tracker.
slug: is-magno-legit
eyebrow: Trust
published: 2026-10-24
---

**TL;DR.** Magno is an iPhone app for logging a protocol: injections, bloods, blood pressure, weight and symptoms. It is made by Lucas Paraizo in the United Kingdom, it is paid for by its users rather than by advertisers, and it never tells you what to take or how much. Your log lives on your phone, and it only goes to a server if you make an account and say yes to that.

*Made by Lucas Paraizo, who builds Magno. Every claim below links to the page it comes from, so you can check it rather than take my word for it.*

## Who makes Magno?

Magno is built by Lucas Paraizo and run as Magno from the United Kingdom, as the [privacy policy](/privacy) states. Support goes to hello@magno.fit, and the [terms](/terms) commit to a reply within two working days.

It is a small, independent app, and that cuts both ways. The person who wrote the code reads your message. It is also young (it reached the App Store in October 2026), there is no large company standing behind it, and there are no published studies of it. The section on what happens if Magno closes covers the biggest risk that brings.

## What does Magno never do?

Magno is a log. It records what you typed and shows your lab results against the lab's own range. The [terms](/terms) put the limits in writing:

- **No medical advice.** Nothing in the app is a diagnosis, a treatment recommendation, or a suggestion to start, stop or change any medication or substance.
- **No doses.** Magno never suggests a compound, a dose or a schedule. Each dose is saved exactly as you typed it.
- **No supply.** Magno does not sell, supply, recommend or endorse any substance.
- **No selling or sharing your data.** The [privacy policy](/privacy) rules out selling, renting or sharing it with anyone, and using it to train models, build profiles or market to you.
- **No trackers.** No analytics, advertising or tracking scripts of any kind, and no third-party cookies.

When a result sits outside the lab's range, Magno flags it as something to raise with your doctor. What to do about it stays between you and your clinician.

## Where is my health data stored?

On your iPhone first. Magno is local-first: without an account, nothing you log leaves the phone, according to the [privacy policy](/privacy).

If you sign in, Magno asks for your explicit consent before it stores your health log on its servers, and records when you agreed. Without that yes, nothing from your log is stored there. The account copy sits on Cloudflare, traffic uses HTTPS, and Cloudflare encrypts stored data at rest.

Lab reports are a special case. A PDF or a photo of your bloods is read on the phone, with Apple's own PDF and text recognition, and the file is never uploaded. Only the values you choose to save join your log.

A handful of providers each get only what they need: Cloudflare (website and account database), Resend (password reset emails), RevenueCat (whether you have Pro), Apple (App Store, payments, Sign in with Apple, Apple Health) and Google (only if you sign in with Google).

## Can I get my data out, or delete it?

Yes, both from inside the app, on every plan. Export gives you a PDF or a CSV of your doses, blood pressure, weight, symptoms and lab markers, the same record described in [walking into your GP with a clean record](/guides/doctor-export).

Delete account (You, Delete account) removes the account and everything stored with it from the servers straight away, and clears the copy on that phone. Encrypted infrastructure backups may keep a copy for up to 30 days before they are purged automatically.

If you use Apple Health, you can also see and revoke what Magno reads and writes. In the Health app, tap your profile picture, then Privacy, then Apps, and pick Magno. [TWiT's walkthrough](https://twit.tv/posts/tech/how-audit-and-control-apps-accessing-your-health-data-iphone) shows the same steps for any app.

## How does Magno make money?

From people who pay for Pro, through Apple. Logging, the timeline, sync, export and the doctor report are free. Pro adds lab import from a PDF or photo and the plain-words read of your bloods, as a monthly subscription or a one-time lifetime purchase. Magno never sees your card or Apple ID details.

This matters because, as [Consumer Reports](https://www.consumerreports.org/mobile-apps/health-app-questions-to-ask/) points out, a free or cheap app may be making its money from your data. The [terms](/terms) add two promises: if prices rise, existing subscribers keep the price they signed up at, and any change is announced in the app at least 30 days ahead.

## What happens if Magno shuts down?

The [terms](/terms) say Magno will tell you in the app and by email at least 90 days before closing. Export keeps working until the end. The app keeps working on your iPhone after that, because your log lives there; only the account backup and sync would stop.

A lifetime purchase keeps Pro for as long as Magno runs, not forever. That wording is deliberate.

## How do I check any health tracker, not just Magno?

Health apps are not held to the same rules as your doctor. In the US, Consumer Reports notes, using an app for health does not bring it under HIPAA, and in most cases there are no special privacy protections. A [2019 study in the BMJ](https://europepmc.org/article/MED/30894349) ran 24 top-rated Android medicines apps through scripted tests and watched the network traffic: 19 of the 24 shared user data, with 55 different companies receiving or processing it.

Questions worth asking of any tracker, Magno included:

- **Who makes it, and how do they earn money?** A named person or company, and a business model that is not your data.
- **Where is my lab file read?** On the phone, or uploaded to a server first. The habit behind [getting a lab PDF into a tracker](/guides/lab-pdf-to-tracker) is the same either way, but the privacy is not.
- **Does it work without an account?** If it does, you can try it before handing over anything.
- **Can I export everything and delete my account myself?** In the app, without emailing anyone.
- **What does the App Store privacy label say?** Read it, and remember the developer fills it in themselves, as [Apple's own guidance](https://developer.apple.com/app-store/app-privacy-details/) explains.
- **Does it tell me what to take?** A log that starts recommending doses has stopped being a log.

## Try it

Magno is free to log and works without an account, so you can judge it before you hand over anything. If you want to see it for yourself, [get Magno on the App Store](https://apps.apple.com/app/apple-store/id6824289899?pt=129598658&ct=seo-is-magno-legit&mt=8).
