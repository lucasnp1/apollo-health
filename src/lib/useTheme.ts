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
    grid:          dark ? '#3c3835' : '#e7e5e4',
    tick:          dark ? '#78716c' : '#a8a29e',
    tooltipBg:     dark ? '#1c1917' : '#ffffff',
    tooltipBorder: dark ? '#3c3835' : '#e7e5e4',
    tooltipText:   dark ? '#fafaf9' : '#0a0a0a',
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
