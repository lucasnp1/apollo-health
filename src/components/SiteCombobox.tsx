// Free-type combobox for injection site selection.
// Shows all standard sites as datalist options (browser dropdown),
// but lets the user type anything custom. Previously used sites
// from their own injection history are surfaced first.

import { useId } from 'react'
import { IM_SITES, SUBQ_SITES } from '../lib/sites'

export function SiteCombobox({
  value,
  onChange,
  recentSites,
}: {
  value: string
  onChange: (site: string) => void
  recentSites?: string[]   // from injection history, shown at top
}) {
  const listId = useId()

  const recents = (recentSites ?? []).filter((s) => s)

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        list={listId}
        value={value}
        placeholder="e.g. Ventrogluteal L"
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        style={{ width: '100%' }}
      />
      <datalist id={listId}>
        {recents.length > 0 && (
          <>
            {recents.map((s) => <option key={`r-${s}`} value={s} label={`${s} (recent)`} />)}
          </>
        )}
        <optgroup label="IM sites">
          {IM_SITES.flatMap((g) =>
            g.sites.map((s) => <option key={s} value={s} label={`${s} · ${g.label}`} />)
          )}
        </optgroup>
        <optgroup label="SubQ sites">
          {SUBQ_SITES.flatMap((g) =>
            g.sites.map((s) => <option key={s} value={s} label={`${s} · ${g.label}`} />)
          )}
        </optgroup>
      </datalist>
    </div>
  )
}
