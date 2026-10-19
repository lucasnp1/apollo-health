// Reminders to log: local notifications only (no server, no push token), kept on this phone (localStorage), as Health is.
// Weekday reminders repeat on their own (one WEEKLY trigger a day picked). "Every few days" injections and the blood test
// are DATE triggers worked out from what's logged, so the whole set is redone at launch, when the app comes back, and
// whenever an injection or a blood test changes. Copy never names a drug or a dose.
import { liveQuery } from 'dexie'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { useSyncExternalStore } from 'react'
import { Alert, AppState, Linking } from 'react-native'
import { db } from '@shared/lib/db'

export type Kind = 'injection' | 'ancillary' | 'weight' | 'bp' | 'checkin' | 'bloods'
export type Timed = { on: boolean; time: string; days: number[] }
export type Injection = Timed & { mode: 'days' | 'interval'; intervalDays: number }
export type Bloods = { on: boolean; everyWeeks: number }
export type State = { injection: Injection; ancillary: Timed; weight: Timed; bp: Timed; checkin: Timed; bloods: Bloods }

const KEY = 'magno.reminders'
const DAY = 86_400_000
const ID = 'magno-'
const AHEAD = 8

const fresh = (): State => ({
  injection: { on: false, time: '09:00', days: [1, 4], mode: 'days', intervalDays: 3.5 },
  ancillary: { on: false, time: '08:30', days: [1, 2, 3, 4, 5, 6, 0] },
  weight: { on: false, time: '08:00', days: [1, 2, 3, 4, 5, 6, 0] },
  bp: { on: false, time: '09:00', days: [1, 2, 3, 4, 5, 6, 0] },
  checkin: { on: false, time: '20:00', days: [0] },
  bloods: { on: false, everyWeeks: 8 },
})
let state: State = (() => {
  const base = fresh()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<State>
    for (const k of Object.keys(base) as Kind[]) Object.assign(base[k], saved[k])
  } catch {}
  return base
})()
const subs = new Set<() => void>()
function save(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
  subs.forEach((f) => f())
}
export const useReminders = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)

/** Changes one kind. Turning one on asks for notifications first; if that's refused it stays off. */
export async function setReminder<K extends Kind>(kind: K, patch: Partial<State[K]>): Promise<boolean> {
  if (patch.on && !state[kind].on) {
    const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
    if (!p.granted) {
      Alert.alert('Notifications are off', 'To get reminders, allow notifications for Magno in Settings > Notifications > Magno.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ])
      return false
    }
  }
  save({ ...state, [kind]: { ...state[kind], ...patch } })
  rescheduleSoon(0)
  return true
}

const COPY: Record<Kind, { title: string; body: string; url: string }> = {
  injection: { title: 'Injection day', body: 'Time to log your injection in Magno.', url: 'magno://log/injection' },
  ancillary: { title: 'Ancillary', body: 'Took it? Log it in Magno.', url: 'magno://log/ancillary' },
  weight: { title: 'Weigh-in', body: 'Step on the scale and log it.', url: 'magno://log/weight' },
  bp: { title: 'Blood pressure', body: 'Take a reading and log it.', url: 'magno://log/bp' },
  checkin: { title: 'How are you feeling?', body: 'A quick check-in takes ten seconds.', url: 'magno://log/checkin' },
  bloods: { title: 'Blood test due', body: '', url: '/labs' },
}
const hm = (t: string) => t.split(':').map(Number) as [number, number]
const content = (kind: Kind, body = COPY[kind].body) => ({ title: COPY[kind].title, body, sound: 'default', data: { url: COPY[kind].url } })

/** n * interval days after `from`: whole days on the calendar (so a clock change doesn't move it), then any half day. */
function after(from: Date, days: number) {
  const d = new Date(from)
  const whole = Math.floor(days)
  d.setDate(d.getDate() + whole)
  return new Date(d.getTime() + (days - whole) * DAY)
}

export async function rescheduleAll() {
  const ours = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(ID))
  await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)))
  if (!Object.values(state).some((r) => r.on) || !(await Notifications.getPermissionsAsync()).granted) return
  const now = Date.now()
  const at = (identifier: string, kind: Kind, date: Date, body?: string) =>
    Notifications.scheduleNotificationAsync({ identifier, content: content(kind, body), trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date } })

  for (const kind of ['injection', 'ancillary', 'weight', 'bp', 'checkin'] as const) {
    const r = state[kind]
    if (!r.on) continue
    const [hour, minute] = hm(r.time)
    if (kind === 'injection' && state.injection.mode === 'interval') {
      const every = state.injection.intervalDays
      const last = await db.injections.orderBy('takenAt').reverse().filter((i) => !i.archivedAt && !i.deletedAtSync && i.route !== 'Oral' && i.route !== 'Other').first()
      // anchored on the day of the last injection, at the chosen time (nothing logged yet: today)
      const anchor = last ? new Date(last.takenAt) : new Date()
      anchor.setHours(hour, minute, 0, 0)
      for (let n = last ? 1 : 0, made = 0; made < AHEAD && n < 1000; n++) {
        const d = after(anchor, n * every)
        if (d.getTime() <= now + 30_000) continue
        await at(`${ID}injection-i${made++}`, 'injection', d)
      }
      continue
    }
    for (const day of r.days) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID}${kind}-w${day}`,
        content: content(kind),
        // expo's weekday is 1 (Sunday) to 7 (Saturday)
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: day + 1, hour, minute },
      })
    }
  }

  if (state.bloods.on) {
    const weeks = state.bloods.everyWeeks
    const last = await db.exams.orderBy('collectedAt').reverse().filter((e) => !e.archivedAt && !e.deletedAtSync).first()
    if (last) {
      const due = after(new Date(last.collectedAt), weeks * 7)
      due.setHours(10, 0, 0, 0)
      // ponytail: an overdue test gets no reminder (it would fire again every launch); add a one-off nudge if missed
      if (due.getTime() > now + 30_000) await at(`${ID}bloods`, 'bloods', due, `It's been ${weeks} weeks since your last blood test.`)
    }
  }
}

// one at a time, the latest wins: a burst of writes (a sync) schedules once
let chain = Promise.resolve()
let soon: ReturnType<typeof setTimeout> | undefined
export function rescheduleSoon(ms = 500) {
  clearTimeout(soon)
  soon = setTimeout(() => void (chain = chain.then(rescheduleAll).catch((e) => console.warn('Magno: reminders', e))), ms)
}

let started = false
/** At launch, once the data is in: keep reminders in step with what's logged, and open the right sheet from a tap. */
export function startReminders() {
  if (started) return
  started = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  })
  liveQuery(() =>
    Promise.all([
      db.injections.count(),
      db.exams.count(),
      db.injections.orderBy('takenAt').last().then((i) => i?.takenAt),
      db.exams.orderBy('collectedAt').last().then((e) => e?.collectedAt),
    ]).then((xs) => xs.join('|')),
  ).subscribe({ next: () => rescheduleSoon(), error: (e) => console.warn(e) })
  AppState.addEventListener('change', (s) => void (s === 'active' && rescheduleSoon()))

  let last = ''
  const opened = (r: Notifications.NotificationResponse | null) => {
    if (!r) return
    const id = r.notification.request.identifier
    const url = r.notification.request.content.data?.url
    if (!id.startsWith(ID) || typeof url !== 'string' || id + r.notification.date === last) return // a cold launch can report the same tap twice
    last = id + r.notification.date
    Notifications.clearLastNotificationResponse()
    setTimeout(() => router.push(url.replace('magno://', '/') as never), 300)
  }
  opened(Notifications.getLastNotificationResponse())
  Notifications.addNotificationResponseReceivedListener(opened)
}
