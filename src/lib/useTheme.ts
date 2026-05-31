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
    // Very faint grid — Apple Health barely shows grid lines
    grid:          dark ? 'rgba(84,84,88,0.35)' : 'rgba(60,60,67,0.10)',
    tick:          dark ? 'rgba(235,235,245,0.40)' : 'rgba(60,60,67,0.45)',
    // Tooltip: Apple-style card with hairline border
    tooltipBg:     dark ? '#1c1c1e' : '#ffffff',
    tooltipBorder: dark ? 'rgba(84,84,88,0.60)' : 'rgba(60,60,67,0.18)',
    tooltipText:   dark ? '#ffffff' : '#000000',
    // Semantic colours (used by charts directly)
    accent:        dark ? '#22d3ee' : '#0891b2',
    good:          dark ? '#30d158' : '#34c759',
    warn:          dark ? '#ff9f0a' : '#ff9500',
    bad:           dark ? '#ff453a' : '#ff3b30',
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
