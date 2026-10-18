// The web app's dark theme (src/index.css, :root[data-theme="dark"]), oklch converted to hex for native styles.
// "Clinical instrument, dark-first": cool near-black, one amber accent, mono eyebrows.
export const C = {
  bg: '#0d0e11',
  card: '#15171a',
  raised: '#1b1e22',
  fg: '#eef0f3',
  muted: '#959aa1',
  faint: '#5d636b',
  line: 'rgba(255,255,255,0.10)',
  input: 'rgba(255,255,255,0.14)',
  secondary: '#202327',
  primary: '#fbb636',
  primaryFg: '#1d1105',
  accentInk: '#ffbe3d',
  danger: '#ed534e',
  // Tailwind 400s, as the web's dark chips use
  good: '#34d399',
  warn: '#fbbf24',
  blue: '#60a5fa',
  rose: '#fb7185',
  violet: '#a78bfa',
}

/** Font names as loaded in app/_layout.tsx */
export const F = {
  body: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semi: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemi: 'JetBrainsMono_600SemiBold',
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'accent'
export const TONE: Record<Tone, string> = { good: C.good, warn: C.warn, bad: C.danger, neutral: C.muted, accent: C.accentInk }
