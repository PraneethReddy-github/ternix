import { Server, FolderUp, Code2, Plug, CircleDot, Settings, Search, KeyRound, Sun, Moon } from 'lucide-react'
import type { ActivityView } from '@shared/ui'
import { useUiStore } from '@/store/useUiStore'
import { useThemeStore } from '@/store/useThemeStore'
import { cn } from '@/utils/cn'

const VIEWS: { id: ActivityView; icon: typeof Server; label: string }[] = [
  { id: 'sessions', icon: Server, label: 'Sessions' },
  { id: 'sftp', icon: FolderUp, label: 'SFTP' },
  { id: 'snippets', icon: Code2, label: 'Snippets' },
  { id: 'tunnels', icon: Plug, label: 'Tunnels' },
  { id: 'recordings', icon: CircleDot, label: 'Recordings' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'settings', icon: Settings, label: 'Settings' }
]

export function ActivityBar() {
  const activeView = useUiStore((s) => s.activeView)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const setView = useUiStore((s) => s.setView)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const openDialog = useUiStore((s) => s.openDialog)
  const themeType = useThemeStore((s) => s.active().type)
  const setTheme = useThemeStore((s) => s.setActive)

  const toggleTheme = () => {
    // Derive the theme list lazily in the handler to avoid a fresh-array selector.
    const next = useThemeStore.getState().all().find((t) => t.type !== themeType)
    if (next) setTheme(next.id)
  }

  return (
    <div className="w-12 bg-bg border-r border-border flex flex-col items-center py-2 gap-1 shrink-0">
      {VIEWS.map(({ id, icon: Icon, label }) => {
        const active = activeView === id && !collapsed
        return (
          <button
            key={id}
            title={label}
            className={cn(
              'relative w-10 h-10 flex items-center justify-center rounded-input transition-colors',
              active ? 'text-text' : 'text-muted hover:text-text hover:bg-surface-2'
            )}
            onClick={() => (activeView === id ? toggleSidebar() : setView(id))}
          >
            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-r" />}
            <Icon size={20} />
          </button>
        )
      })}

      <div className="flex-1" />

      <button
        title="Key Vault"
        className="w-10 h-10 flex items-center justify-center rounded-input text-muted hover:text-text hover:bg-surface-2"
        onClick={() => openDialog({ kind: 'keyVault' })}
      >
        <KeyRound size={20} />
      </button>
      <button
        title="Toggle theme"
        className="w-10 h-10 flex items-center justify-center rounded-input text-muted hover:text-text hover:bg-surface-2"
        onClick={toggleTheme}
      >
        {themeType === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </div>
  )
}
