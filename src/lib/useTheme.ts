/**
 * Dark / light theme — stored in localStorage('apollo-theme').
 * Applied immediately on first import to avoid flash-of-light-mode.
 */

const STORAGE_KEY = 'apollo-theme'

export type Theme = 'light' | 'dark'

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
}

// Apply synchronously before React paint. Dark (the clinical-instrument look)
// is the DEFAULT — only an explicit 'light' preference opts out.
const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
applyTheme(saved === 'light' ? 'light' : 'dark')

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark'
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
    // Cool faint gridlines on the instrument surface.
    grid:          dark ? 'rgba(255,255,255,0.07)' : 'rgba(20,24,33,0.08)',
    tick:          dark ? 'rgba(233,237,245,0.50)' : 'rgba(20,24,33,0.55)',
    // Tooltip: matches the cool near-black panel + amber hairline.
    tooltipBg:     dark ? '#1c1f27' : '#ffffff',
    tooltipBorder: dark ? 'rgba(245,176,66,0.28)' : 'rgba(20,24,33,0.12)',
    tooltipText:   dark ? '#eef1f6' : '#141821',
    // Primary chart stroke: high-contrast ink so lines read on either ground.
    accent:        dark ? '#eef1f6' : '#141821',
    // Amber signal for area fills + emphasis.
    accentFill:    '#f5b042',
    good:          dark ? '#3ecf8e' : '#0f9d63',
    warn:          dark ? '#f5b042' : '#b26a05',
    bad:           dark ? '#f26b5e' : '#d23b30',
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
