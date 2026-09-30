import { useEffect } from 'react'
import type { ThemePreference } from '@core/persistence'

export const THEME_ORDER: readonly ThemePreference[] = ['system', 'light', 'dark']

export const THEME_LABEL: Readonly<Record<ThemePreference, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark'
}

/** Next theme in the system → light → dark cycle. */
export function nextTheme(current: ThemePreference): ThemePreference {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length]
}

/**
 * Reflect the preference on <html>. "system" removes the attribute so the
 * `prefers-color-scheme` media query in the stylesheet decides.
 */
export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement
): void {
  if (preference === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', preference)
}

export function useTheme(preference: ThemePreference): void {
  useEffect(() => {
    applyTheme(preference)
  }, [preference])
}
