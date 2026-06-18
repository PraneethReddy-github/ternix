import type { TerminalTheme } from '@shared/index'
import { darkDefault } from './dark-default'
import { lightDefault } from './light-default'
import { dracula } from './dracula'
import { nord } from './nord'
import { solarizedDark } from './solarized-dark'
import { solarizedLight } from './solarized-light'
import { tokyoNight } from './tokyo-night'
import { gruvboxDark } from './gruvbox-dark'
import { monokai } from './monokai'
import { oneDarkPro } from './one-dark-pro'
import { catppuccinMocha } from './catppuccin-mocha'
import { catppuccinLatte } from './catppuccin-latte'

export const BUILTIN_THEMES: TerminalTheme[] = [
  darkDefault,
  lightDefault,
  dracula,
  nord,
  solarizedDark,
  solarizedLight,
  tokyoNight,
  gruvboxDark,
  monokai,
  oneDarkPro,
  catppuccinMocha,
  catppuccinLatte
]

export const DEFAULT_THEME_ID = 'dark-default'

export function themeById(id: string, custom: TerminalTheme[] = []): TerminalTheme {
  return [...BUILTIN_THEMES, ...custom].find((t) => t.id === id) ?? darkDefault
}

/** Apply a theme's UI palette to the document root as CSS variables. */
export function applyThemeVars(theme: TerminalTheme): void {
  const r = document.documentElement.style
  r.setProperty('--tx-bg', theme.ui.bg)
  r.setProperty('--tx-surface', theme.ui.surface)
  r.setProperty('--tx-surface-2', theme.ui.surface2)
  r.setProperty('--tx-border', theme.ui.border)
  r.setProperty('--tx-accent', theme.ui.accent)
  r.setProperty('--tx-accent-muted', theme.ui.accentMuted)
  r.setProperty('--tx-text', theme.ui.text)
  r.setProperty('--tx-muted', theme.ui.muted)
  r.setProperty('--tx-success', theme.ui.success)
  r.setProperty('--tx-warning', theme.ui.warning)
  r.setProperty('--tx-danger', theme.ui.danger)
}

/** Convert a TerminalTheme into the xterm.js ITheme shape. */
export function toXtermTheme(t: TerminalTheme) {
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.cursorAccent,
    selectionBackground: t.selectionBackground,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite
  }
}
