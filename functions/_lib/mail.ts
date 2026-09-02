// Transactional email via Resend's HTTP API (plain fetch, no SDK).
//
// Dormant until the owner adds two Cloudflare Pages secrets:
//   RESEND_API_KEY  — from resend.com (verify the sending domain first)
//   MAIL_FROM       — e.g. "Apollo Health <no-reply@theos.studio>"
// While unset, mailConfigured() is false and callers degrade gracefully.

import type { Env } from './types'

const RESEND_API = 'https://api.resend.com/emails'

export function mailConfigured(env: Env): boolean {
  return !!env.RESEND_API_KEY && !!env.MAIL_FROM
}

export async function sendMail(
  env: Env,
  msg: { to: string; subject: string; text: string; html: string },
): Promise<void> {
  if (!mailConfigured(env)) throw new Error('Mail is not configured')
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Mail send failed (${res.status}) ${body.slice(0, 200)}`)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

// The password-reset email. Plain, short, no tracking.
export function passwordResetMail(link: string): { subject: string; text: string; html: string } {
  const subject = 'Reset your Apollo Health password'
  const text = [
    'Someone asked to reset the password for your Apollo Health account.',
    '',
    'Open this link to choose a new password. It works for 60 minutes and can be used once:',
    link,
    '',
    "If you didn't ask for this, you can ignore this email. Your password stays the same.",
  ].join('\n')
  const safe = escapeHtml(link)
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#14161c;color:#f2f3f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5">
<div style="max-width:480px;margin:0 auto;background:#1d2027;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:28px">
<p style="margin:0 0 6px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#e7b45a">Apollo Health</p>
<h1 style="margin:0 0 16px;font-size:20px;font-weight:600">Reset your password</h1>
<p style="margin:0 0 16px;color:#c9ccd3">Someone asked to reset the password for your Apollo Health account. Tap the button to choose a new one. The link works for 60 minutes and can be used once.</p>
<p style="margin:0 0 20px"><a href="${safe}" style="display:inline-block;background:#e7b45a;color:#2a1f0a;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:6px">Choose a new password</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#9a9ea8">Or copy this link into your browser:</p>
<p style="margin:0 0 20px;font-size:12px;word-break:break-all"><a href="${safe}" style="color:#e7b45a">${safe}</a></p>
<p style="margin:0;font-size:13px;color:#9a9ea8">If you didn't ask for this, you can ignore this email. Your password stays the same.</p>
</div></body></html>`
  return { subject, text, html }
}
