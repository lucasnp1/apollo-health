// /app/reset?token=...: set a new password from a reset link (POST /api/auth/reset), then sign in on the iPhone.
const token = new URLSearchParams(location.search).get('token')
if (location.pathname.startsWith('/app/reset') && token) {
  document.getElementById('moved')!.hidden = true
  document.getElementById('reset')!.hidden = false
  const form = document.getElementById('reset-form') as HTMLFormElement
  const msg = document.getElementById('reset-msg')!
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const password = (document.getElementById('pw') as HTMLInputElement).value
    msg.textContent = 'Saving…'
    try {
      const res = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'That didn’t work. Ask for a new link.')
      form.hidden = true
      msg.textContent = 'Done. Sign in on the Magno iPhone app with your email and new password.'
    } catch (err) {
      msg.textContent = (err as Error).message
    }
  })
}
