// The home-screen widget: when your last shot was and when the next injection reminder is due. Tapping it opens the
// injection sheet. Like the reminders, it never names a drug or a dose: a home screen is seen by others.
// A 'widget' function runs in its own small runtime: no hooks, no imports, nothing from outside it; data comes in as
// props (src/widgets/sync.ts).
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import { containerBackground, font, foregroundStyle, frame, kerning, minimumScaleFactor, widgetURL } from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'

export type NextShotProps = { last?: number; next?: number }

const NextShot = (props: NextShotProps, env: WidgetEnvironment) => {
  'widget'
  const dark = env.colorScheme !== 'light'
  const bg = dark ? '#15171a' : '#ffffff'
  const fg = dark ? '#eef0f3' : '#13181d'
  const muted = dark ? '#959aa1' : '#60656c'
  const amber = dark ? '#fbb636' : '#a55b00'
  const now = env.date.getTime()
  const midnight = (ms: number) => {
    const d = new Date(ms)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const days = (ms: number) => Math.round((midnight(ms) - midnight(now)) / 86_400_000)
  const hm = (ms: number) => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const ago = (ms: number) => {
    const n = -days(ms)
    return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`
  }
  const upcoming = (ms: number) => {
    const n = days(ms)
    return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? WEEKDAY[new Date(ms).getDay()] : `In ${n} days`
  }
  const next = props.next !== undefined && props.next > now ? props.next : undefined
  const eyebrow = [font({ size: 10, weight: 'semibold', design: 'monospaced' }), kerning(1.2), foregroundStyle(muted)]
  const big = [font({ size: 22, weight: 'semibold' }), foregroundStyle(fg), minimumScaleFactor(0.6)]
  const small = [font({ size: 12 }), foregroundStyle(muted)]

  const headline =
    next !== undefined ? { label: 'NEXT SHOT', value: upcoming(next), sub: hm(next) }
    : props.last !== undefined ? { label: 'LAST SHOT', value: ago(props.last), sub: 'Tap to log the next' }
    : { label: 'INJECTIONS', value: 'None yet', sub: 'Tap to log your first' }

  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[frame({ maxWidth: 10_000, maxHeight: 10_000, alignment: 'topLeading' }), containerBackground(bg, 'widget'), widgetURL('magno://log/injection')]}
    >
      <HStack spacing={6}>
        <Image systemName="syringe.fill" size={13} color={amber} />
        <Text modifiers={eyebrow}>MAGNO</Text>
      </HStack>
      <Spacer />
      <Text modifiers={eyebrow}>{headline.label}</Text>
      <Text modifiers={big}>{headline.value}</Text>
      <Text modifiers={small}>{headline.sub}</Text>
      {next !== undefined && props.last !== undefined ? <Text modifiers={small}>{`Last: ${ago(props.last).toLowerCase()}`}</Text> : null}
    </VStack>
  )
}

export default createWidget<NextShotProps>('NextShot', NextShot)
