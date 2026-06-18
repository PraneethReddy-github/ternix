import { useEffect } from 'react'
import { useThemeStore } from '@/store/useThemeStore'
import { applyThemeVars, toXtermTheme } from '@/themes'

/** Loads themes once and keeps CSS variables in sync with the active theme. */
export function useTheme() {
  const active = useThemeStore((s) => s.active())
  const activeId = useThemeStore((s) => s.activeId)

  useEffect(() => {
    applyThemeVars(active)
  }, [activeId, active])

  return { theme: active, xtermTheme: toXtermTheme(active) }
}
