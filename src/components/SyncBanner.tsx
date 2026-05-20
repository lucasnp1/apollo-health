// Slim sync pill — shown inline in the topbar while rows are pending push.
// Disappears automatically once dirty.total hits zero.

import { CloudUpload } from 'lucide-react'
import { useDirtyCounts } from '../lib/useDirtyCounts'

export function SyncBanner({ syncing }: { syncing: boolean }) {
  const dirty = useDirtyCounts()
  if (!dirty.total) return null

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        background: 'var(--accent-soft)',
        border: '1px solid rgba(15,118,110,0.2)',
        color: 'var(--accent-ink)',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        letterSpacing: '-0.01em',
      }}
    >
      <CloudUpload size={11} />
      {syncing ? `Syncing ${dirty.total}…` : `${dirty.total} pending`}
    </span>
  )
}
