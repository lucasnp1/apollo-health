// Injection site selector. Uses a native <select> (works reliably on iOS Safari)
// with an optional "Custom…" free-text input for sites not in the standard list.

import { useState } from 'react'
import { IM_SITES, SUBQ_SITES } from '../lib/sites'

const CUSTOM_VALUE = '__custom__'

export function SiteCombobox({
  value,
  onChange,
  recentSites,
}: {
  value: string
  onChange: (site: string) => void
  recentSites?: string[]
}) {
  const allSites = [
    ...IM_SITES.flatMap((g) => g.sites),
    ...SUBQ_SITES.flatMap((g) => g.sites),
  ]
  const recents = (recentSites ?? []).filter((s) => s)

  // If the current value is not in the standard list, treat it as custom
  const isCustom = value !== '' && !allSites.includes(value)
  const [showCustom, setShowCustom] = useState(isCustom)
  const selectValue = showCustom ? CUSTOM_VALUE : value

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === CUSTOM_VALUE) {
      setShowCustom(true)
      onChange('')
    } else {
      setShowCustom(false)
      onChange(e.target.value)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={selectValue}
        onChange={handleSelect}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">— Select site —</option>
        {recents.length > 0 && (
          <optgroup label="Recent">
            {recents.map((s) => (
              <option key={`r-${s}`} value={s}>{s}</option>
            ))}
          </optgroup>
        )}
        <optgroup label="IM sites">
          {IM_SITES.flatMap((g) =>
            g.sites.map((s) => (
              <option key={s} value={s}>{s} · {g.label}</option>
            ))
          )}
        </optgroup>
        <optgroup label="SubQ sites">
          {SUBQ_SITES.flatMap((g) =>
            g.sites.map((s) => (
              <option key={s} value={s}>{s} · {g.label}</option>
            ))
          )}
        </optgroup>
        <option value={CUSTOM_VALUE}>Custom…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          placeholder="Type custom site name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      )}
    </div>
  )
}
