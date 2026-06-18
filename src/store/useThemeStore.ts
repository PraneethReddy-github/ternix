import { create } from 'zustand'
import type { TerminalTheme } from '@shared/index'
import { BUILTIN_THEMES, DEFAULT_THEME_ID, themeById, applyThemeVars } from '@/themes'

interface ThemeState {
  activeId: string
  custom: TerminalTheme[]
  load: () => Promise<void>
  setActive: (id: string) => Promise<void>
  saveCustom: (theme: TerminalTheme) => Promise<void>
  deleteCustom: (id: string) => Promise<void>
  active: () => TerminalTheme
  all: () => TerminalTheme[]
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  activeId: DEFAULT_THEME_ID,
  custom: [],

  load: async () => {
    const [savedId, custom] = await Promise.all([window.ternix.settings.get('appearance.theme'), window.ternix.themes.listCustom()])
    const activeId = savedId ?? DEFAULT_THEME_ID
    set({ activeId, custom })
    applyThemeVars(themeById(activeId, custom))
  },

  setActive: async (id) => {
    set({ activeId: id })
    applyThemeVars(themeById(id, get().custom))
    await window.ternix.settings.set('appearance.theme', id)
  },

  saveCustom: async (theme) => {
    await window.ternix.themes.saveCustom(theme)
    set((s) => ({ custom: [...s.custom.filter((t) => t.id !== theme.id), theme] }))
  },

  deleteCustom: async (id) => {
    await window.ternix.themes.deleteCustom(id)
    set((s) => ({ custom: s.custom.filter((t) => t.id !== id) }))
    if (get().activeId === id) await get().setActive(DEFAULT_THEME_ID)
  },

  active: () => themeById(get().activeId, get().custom),
  all: () => [...BUILTIN_THEMES, ...get().custom]
}))
