# Magno incidents

## Severity
- **S1:** data lost, leaked or wrong for any user; purchases charged without Pro; the app won't open. Act now, any hour.
- **S2:** a core flow broken for many (logging, sync, sign-in, lab import, restore purchases). Same day.
- **S3:** a feature broken with a workaround, or one user affected. Next working day.

## First 30 minutes (S1/S2)
1. Contain: stop the harm (roll back the Pages deploy, pause sync on the server, pull a TestFlight build, or ask Apple to expedite a fix).
2. Keep the core promise: nobody's log is deleted; their phone copy is the source of truth.
3. Write the status note (below) on magno.fit/status.html and in the app's feedback reply.
4. Repair before explaining: fix, then tell affected users what happened and what we did.

## Status note template
> **[date, time UTC] Magno: [what is affected, in plain words].**
> What you might see: [...]. Your log on your phone is safe / [what is at risk].
> What we're doing: [...]. Next update by [time].

## After
Postmortem within 7 days in docs/decisions.md: what happened, why, what changed so it can't recur. An apology is not repair.
