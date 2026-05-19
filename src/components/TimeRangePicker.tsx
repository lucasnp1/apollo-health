import { RANGE_DAYS, type TimeRange } from '../lib/timeRange'

export function TimeRangePicker({ value, onChange }: { value: TimeRange; onChange: (next: TimeRange) => void }) {
  const options = Object.keys(RANGE_DAYS) as TimeRange[]
  return (
    <div className="pill-tabs" role="tablist">
      {options.map((opt) => (
        <button
          key={opt}
          role="tab"
          aria-selected={value === opt}
          className={value === opt ? 'active' : undefined}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
