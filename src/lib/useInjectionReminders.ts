/**
 * useInjectionReminders
 *
 * Schedules browser notifications for upcoming injection doses.
 * Fires a notification ~1 minute before each scheduled dose (if within the next 24 h).
 * Re-schedules whenever protocols, doses, or compounds change.
 *
 * Only runs when:
 *   - localStorage 'apollo-notif' === '1'
 *   - Notification.permission === 'granted'
 */
import { useEffect } from 'react'
import type { Compound, Protocol, ProtocolDose } from './db'
import { upcomingSchedule } from './schedule'

export function useInjectionReminders(
  protocols: Protocol[],
  doses: ProtocolDose[],
  compounds: Compound[],
) {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      localStorage.getItem('apollo-notif') !== '1'
    ) {
      return
    }

    const compoundMap = new Map(compounds.map((c) => [c.id, c]))
    const now = new Date()

    const upcoming = upcomingSchedule(protocols, doses, now, 1) // next 24 h

    const timers: ReturnType<typeof setTimeout>[] = []

    for (const item of upcoming) {
      const dueAt = item.scheduledAt
      const compound = compoundMap.get(item.protocol.compoundId)
      const compoundName = compound?.name ?? 'injection'
      const dose = item.protocol.dose ?? ''
      const unit = compound?.unit ?? ''

      // Fire the notification 60 s before the dose (or immediately if already within 60 s)
      const fireAt = Math.max(0, dueAt.getTime() - now.getTime() - 60_000)

      const timer = setTimeout(() => {
        try {
          new Notification('💉 Apollo Health — Dose reminder', {
            body: `Time for your ${compoundName}${dose ? ` — ${dose} ${unit}` : ''}.`,
            icon: '/icons/icon-192.png',
            tag: `apollo-dose-${item.protocol.id}-${dueAt.toISOString()}`,
          } as NotificationOptions)
        } catch {
          // Notifications may fail silently in some contexts
        }
      }, fireAt)

      timers.push(timer)
    }

    return () => {
      for (const t of timers) clearTimeout(t)
    }
  // Re-run when protocols or doses change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocols, doses, compounds])
}
