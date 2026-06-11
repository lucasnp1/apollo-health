/**
 * Dark / light theme — stored in localStorage('apollo-theme').
 * Applied immediately on first import to avoid flash-of-light-mode.
 */

const STORAGE_KEY = 'apollo-theme'

export type Theme = 'light' | 'dark'

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
}

// Apply synchronously before React paint
const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
if (saved === 'dark') applyTheme('dark')

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'light'
}

export function setTheme(t: Theme) {
  localStorage.setItem(STORAGE_KEY, t)
  applyTheme(t)
  // Dispatch event so other hooks can react
  window.dispatchEvent(new CustomEvent('apollo-theme-change', { detail: t }))
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}

/**
 * Returns chart-safe color tokens — must be JS values because Recharts
 * doesn't read CSS variables from inline style strings.
 */
export function getChartColors(dark: boolean) {
  return {
    // Warm faint grid — sits on cream surface in light mode, on warm
    // brown-black in dark mode.
    grid:          dark ? 'rgba(244,201,92,0.10)' : 'rgba(26,22,16,0.08)',
    tick:          dark ? 'rgba(253,250,240,0.50)' : 'rgba(26,22,16,0.55)',
    // Tooltip: matches surface tokens, warm hairline border
    tooltipBg:     dark ? '#1f1a14' : '#fffcf5',
    tooltipBorder: dark ? 'rgba(244,201,92,0.24)' : 'rgba(26,22,16,0.12)',
    tooltipText:   dark ? '#fdfaf0' : '#1a1611',
    // Primary chart stroke: deep warm ink (matches logo line art). The
    // yellow accent is reserved for fills + emphasis, since a yellow
    // line on cream is illegible.
    accent:        dark ? '#fdfaf0' : '#1a1611',
    // Accent fill used for area gradients — yellow that reads on cream.
    accentFill:    dark ? '#f4c95c' : '#f4c95c',
    good:          dark ? '#3eb874' : '#2f8b54',
    warn:          dark ? '#e8a534' : '#c5821e',
    bad:           dark ? '#e5594b' : '#c43c2f',
  }
}

import { useEffect, useState } from 'react'

/** React hook — re-renders on theme change */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  useEffect(() => {
    const handler = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail)
    window.addEventListener('apollo-theme-change', handler)
    return () => window.removeEventListener('apollo-theme-change', handler)
  }, [])
  return {
    theme,
    isDark: theme === 'dark',
    toggle: toggleTheme,
    set: setTheme,
    chart: getChartColors(theme === 'dark'),
  }
}
