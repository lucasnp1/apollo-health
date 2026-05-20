// Compact banner shown on Overview while local rows are pending push.
// Disappears automatically once `dirty.total` hits zero.

import { CloudUpload, Loader } from 'lucide-react'
import { useDirtyCounts } from '../lib/useDirtyCounts'

export function SyncBanner({ syncing }: { syncing: boolean }) {
  const dirty = useDirtyCounts()
  if (!dirty.total) return null

  const topTables = Object.entries(dirty)
    .filter(([k, v]) => k !== 'total' && typeof v === 'number' && v > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 4)
    .map(([slug, n]) => `${n} ${slug}`)

  return (
    <div
      className="surface col-12"
      style={{
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--accent-soft)',
        border: '1px solid rgba(15, 118, 110, 0.18)',
        color: 'var(--accent-ink)',
      }}
    >
      {syncing ? <Loader size={16} className="num" /> : <CloudUpload size={16} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 13 }}>
          Syncing {dirty.total} {dirty.total === 1 ? 'row' : 'rows'} to your account
        </strong>
        <span style={{ display: 'block', color: 'var(--ink-dim)', fontSize: 11, marginTop: 2 }}>
          {topTables.join(' · ') || 'Working in the background.'}
        </span>
      </div>
    </div>
  )
}
