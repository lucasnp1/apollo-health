import { addDays, isAfter, isBefore, parseISO, setHours, setMinutes, startOfDay } from 'date-fns'
import type { Protocol, ProtocolCadence } from './db'

const DAY = 24 * 60 * 60 * 1000

function applyTime(date: Date, timeOfDay?: string) {
  if (!timeOfDay) return date
  const [h, m] = timeOfDay.split(':').map(Number)
  return setMinutes(setHours(date, h || 0), m || 0)
}

/**
 * Every instant a protocol schedules a dose between [from, to].
 * The canonical scheduling primitive: a dose's identity is its ISO string here,
 * so logging or skipping one round-trips exactly.
 */
export function generateDoseInstants(protocol: Protocol, from: Date, to: Date): Date[] {
  const out: Date[] = []
  const start = parseISO(protocol.startedAt)
  const end = protocol.endsAt ? parseISO(protocol.endsAt) : undefined
  const cadence = protocol.cadence

  const lower = isAfter(start, from) ? start : from
  const upper = end && isBefore(end, to) ? end : to

  switch (cadence.kind) {
    case 'everyNDays': {
      const stepMs = cadence.n * DAY
      const elapsed = lower.getTime() - start.getTime()
      const firstIndex = Math.max(0, Math.ceil(elapsed / stepMs))
      for (let i = firstIndex; ; i++) {
        const date = applyTime(new Date(start.getTime() + i * stepMs), cadence.timeOfDay)
        if (isAfter(date, upper)) break
        if (isBefore(date, lower)) continue
        out.push(date)
      }
      break
    }
    case 'weekly': {
      const cursor = startOfDay(lower)
      for (let d = cursor; !isAfter(d, upper); d = addDays(d, 1)) {
        if (cadence.daysOfWeek.includes(d.getDay())) {
          out.push(applyTime(d, cadence.timeOfDay))
        }
      }
      break
    }
    case 'daily': {
      const cursor = startOfDay(lower)
      for (let d = cursor; !isAfter(d, upper); d = addDays(d, 1)) {
        for (const t of cadence.timesOfDay) out.push(applyTime(d, t))
      }
      break
    }
    case 'asNeeded':
      break
  }

  return out
}

export function describeCadence(cadence: ProtocolCadence): string {
  switch (cadence.kind) {
    case 'everyNDays':
      return cadence.n === 1 ? 'Every day' : `Every ${cadence.n} days`
    case 'weekly': {
      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return cadence.daysOfWeek.map((d) => labels[d]).join(', ')
    }
    case 'daily':
      return `Daily at ${cadence.timesOfDay.join(', ')}`
    case 'asNeeded':
      return 'As needed'
  }
}
