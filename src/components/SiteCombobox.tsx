// "Other site" selector: every site for the route, grouped by body region in
// the same top-to-bottom order as the quick list, then the user's own custom
// sites, then free text. Native <select> (works reliably on iOS Safari).

import { useState } from 'react'
import { REGIONS, type Route } from '../lib/sites'

const CUSTOM_VALUE = '__custom__'
const FIELD = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function SiteCombobox({
  value,
  onChange,
  route,
  customs = [],
}: {
  value: string
  onChange: (site: string) => void
  route: Route
  /** Sites the user typed before, offered again by name. */
  customs?: string[]
}) {
  const regions = REGIONS[route]
  const known = new Set([...regions.flatMap((r) => r.sites.map((s) => s.site)), ...customs])

  // Anything not on the list is free text being typed.
  const [showCustom, setShowCustom] = useState(value !== '' && !known.has(value))
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
      <select aria-label="Other site" value={selectValue} onChange={handleSelect} className={FIELD}>
        <option value="">Choose a site</option>
        {regions.map((r) => (
          <optgroup key={r.label} label={r.label}>
            {r.sites.map((s) => (
              <option key={s.site} value={s.site}>
                {s.muscle}{s.side ? `, ${s.side === 'L' ? 'left' : 'right'}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
        {customs.length > 0 && (
          <optgroup label="Your custom sites">
            {customs.map((c) => <option key={c} value={c}>{c}</option>)}
          </optgroup>
        )}
        <option value={CUSTOM_VALUE}>Type a custom site…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          aria-label="Custom site name"
          placeholder="e.g. Calf L"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          className={FIELD}
        />
      )}
    </div>
  )
}
