import { RANGE_DAYS, type TimeRange } from '../lib/timeRange'
import { Segmented } from '@/components/ui/segmented'

// Time-range control for the trend charts. Uses the shared Segmented pill so it
// reads the same as the other on-card toggles (e.g. Active levels).
export function TimeRangePicker({ value, onChange }: { value: TimeRange; onChange: (next: TimeRange) => void }) {
  const options = (Object.keys(RANGE_DAYS) as TimeRange[]).map((v) => ({ value: v, label: v }))
  return <Segmented size="sm" value={value} onChange={onChange} options={options} />
}
