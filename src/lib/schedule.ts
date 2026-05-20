import { addDays, addMinutes, isAfter, isBefore, parseISO, setHours, setMinutes, startOfDay } from 'date-fns'
import type { Protocol, ProtocolCadence, ProtocolDose } from './db'

const DAY = 24 * 60 * 60 * 1000

function applyTime(date: Date, timeOfDay?: string) {
  if (!timeOfDay) return date
  const [h, m] = timeOfDay.split(':').map(Number)
  return setMinutes(setHours(date, h || 0), m || 0)
}

// Generate scheduled dose instants for a protocol between [from, to].
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

export type ScheduledItem = {
  protocol: Protocol
  scheduledAt: Date
  dose?: ProtocolDose
}

export function nextDose(
  protocols: Protocol[],
  doses: ProtocolDose[],
  from = new Date(),
  horizonDays = 30,
): ScheduledItem | undefined {
  return upcomingSchedule(protocols, doses, from, horizonDays)[0]
}

export function upcomingSchedule(
  protocols: Protocol[],
  doses: ProtocolDose[],
  from = new Date(),
  horizonDays = 14,
): ScheduledItem[] {
  const to = addMinutes(from, horizonDays * 24 * 60)
  const persisted = new Map<string, ProtocolDose>()
  for (const dose of doses) {
    persisted.set(`${dose.protocolId}|${dose.scheduledAt}`, dose)
  }
  const items: ScheduledItem[] = []
  for (const protocol of protocols.filter((p) => !p.archived)) {
    for (const instant of generateDoseInstants(protocol, from, to)) {
      const key = `${protocol.id}|${instant.toISOString()}`
      const dose = persisted.get(key)
      if (dose?.status === 'done' || dose?.status === 'skipped') continue
      items.push({ protocol, scheduledAt: instant, dose })
    }
  }
  return items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
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

export function timeUntil(target: Date, from = new Date()): string {
  const diff = target.getTime() - from.getTime()
  if (diff < 0) {
    const abs = Math.abs(diff)
    if (abs < 60 * 60 * 1000) return `${Math.round(abs / 60000)}m overdue`
    if (abs < DAY) return `${Math.round(abs / 3600000)}h overdue`
    return `${Math.round(abs / DAY)}d overdue`
  }
  if (diff < 60 * 60 * 1000) return `in ${Math.round(diff / 60000)}m`
  if (diff < DAY) return `in ${Math.round(diff / 3600000)}h`
  const days = Math.floor(diff / DAY)
  const hours = Math.round((diff % DAY) / 3600000)
  return hours ? `in ${days}d ${hours}h` : `in ${days}d`
}
