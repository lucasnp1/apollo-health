import { RANGE_DAYS, type TimeRange } from '../lib/timeRange'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function TimeRangePicker({ value, onChange }: { value: TimeRange; onChange: (next: TimeRange) => void }) {
  const options = Object.keys(RANGE_DAYS) as TimeRange[]
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as TimeRange)}>
      <TabsList className="h-8">
        {options.map((opt) => (
          <TabsTrigger key={opt} value={opt} className="px-2.5 text-xs">
            {opt}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
