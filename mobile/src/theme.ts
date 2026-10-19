// The web app's two themes (src/index.css: :root and :root[data-theme="dark"]), oklch converted to hex for native styles.
// "Clinical instrument, dark-first": cool near-black (or cool near-white), one amber accent, mono eyebrows.
//
// `C` holds iOS dynamic colours: each token is its light and dark value, and iOS picks one from the phone's appearance
// (or the override set in You, see appearance.ts), live, with no re-render. Use them in styles. Where a plain string is
// needed (SVG charts, SwiftUI tint, alpha suffixes), take the current palette from `usePalette()`.
import { type ColorValue, DynamicColorIOS, useColorScheme } from 'react-native'

const DARK = {
  bg: '#0d0e11',
  card: '#15171a',
  raised: '#1b1e22',
  fg: '#eef0f3',
  muted: '#959aa1',
  faint: '#5d636b',
  line: 'rgba(255,255,255,0.10)',
  input: 'rgba(255,255,255,0.14)',
  secondary: '#202327',
  segOn: '#2c3036',
  toast: '#2a2d33',
  scrim: 'rgba(13,14,17,0.82)',
  primary: '#fbb636',
  primaryFg: '#1d1105',
  primarySoft: 'rgba(251,182,54,0.07)',
  primaryTint: 'rgba(251,182,54,0.12)',
  primaryLine: 'rgba(251,182,54,0.5)',
  accentInk: '#ffbe3d',
  danger: '#ed534e',
  dangerSoft: 'rgba(237,83,78,0.08)',
  dangerLine: 'rgba(237,83,78,0.33)',
  // Tailwind 400s, as the web's dark chips use
  good: '#34d399',
  goodBand: 'rgba(52,211,153,0.35)',
  warn: '#fbbf24',
  blue: '#60a5fa',
  rose: '#fb7185',
  violet: '#a78bfa',
  teal: '#2dd4bf',
}
export type Palette = typeof DARK

const LIGHT: Palette = {
  bg: '#f4f5f7',
  card: '#ffffff',
  raised: '#f7f8fa',
  fg: '#13181d',
  muted: '#60656c',
  faint: '#94999e',
  line: 'rgba(17,27,40,0.12)',
  input: 'rgba(17,27,40,0.16)',
  secondary: '#eaecef',
  segOn: '#ffffff',
  toast: '#ffffff',
  scrim: 'rgba(244,245,247,0.86)',
  primary: '#e5991c',
  primaryFg: '#1c140c',
  primarySoft: 'rgba(229,153,28,0.08)',
  primaryTint: 'rgba(229,153,28,0.14)',
  primaryLine: 'rgba(229,153,28,0.55)',
  accentInk: '#a55b00',
  danger: '#d33b36',
  dangerSoft: 'rgba(211,59,54,0.07)',
  dangerLine: 'rgba(211,59,54,0.3)',
  // Tailwind 600s, readable on white
  good: '#059669',
  goodBand: 'rgba(5,150,105,0.25)',
  warn: '#b45309',
  blue: '#2563eb',
  rose: '#e11d48',
  violet: '#7c3aed',
  teal: '#0d9488',
}

export const C = Object.fromEntries(
  (Object.keys(DARK) as (keyof Palette)[]).map((k) => [k, DynamicColorIOS({ dark: DARK[k], light: LIGHT[k] })]),
) as Record<keyof Palette, ColorValue>

/** 'light' or 'dark', as the screen shows it right now. */
export const useScheme = (): 'light' | 'dark' => (useColorScheme() === 'light' ? 'light' : 'dark')
/** The current palette as plain strings, for SVG and SwiftUI. */
export const usePalette = (): Palette => (useScheme() === 'light' ? LIGHT : DARK)

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
const TONE_KEY: Record<Tone, keyof Palette> = { good: 'good', warn: 'warn', bad: 'danger', neutral: 'muted', accent: 'accentInk' }
/** A tone's colour, as a dynamic colour for styles. */
export const TONE = Object.fromEntries(Object.entries(TONE_KEY).map(([t, k]) => [t, C[k]])) as Record<Tone, ColorValue>
/** A tone's colour in a palette, as a plain string (to add an alpha suffix). */
export const toneHex = (p: Palette, t: Tone) => p[TONE_KEY[t]]
