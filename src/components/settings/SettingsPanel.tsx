import { Settings, TerminalSquare, Palette, Keyboard, Server, Shield, ArrowLeftRight, RefreshCw, Wrench, X } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { GeneralSettings } from './GeneralSettings'
import { TerminalSettings } from './TerminalSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { KeyboardSettings } from './KeyboardSettings'
import { SshSettings } from './SshSettings'
import { SecuritySettings } from './SecuritySettings'
import { FileTransferSettings } from './FileTransferSettings'
import { UpdateSettings } from './UpdateSettings'
import { AdvancedSettings } from './AdvancedSettings'
import { cn } from '@/utils/cn'

const SECTIONS = [
  { id: 'general', label: 'General', icon: Settings, Comp: GeneralSettings },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare, Comp: TerminalSettings },
  { id: 'appearance', label: 'Appearance', icon: Palette, Comp: AppearanceSettings },
  { id: 'ssh', label: 'SSH', icon: Server, Comp: SshSettings },
  { id: 'security', label: 'Security', icon: Shield, Comp: SecuritySettings },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard, Comp: KeyboardSettings },
  { id: 'transfers', label: 'File Transfers', icon: ArrowLeftRight, Comp: FileTransferSettings },
  { id: 'updates', label: 'Updates', icon: RefreshCw, Comp: UpdateSettings },
  { id: 'advanced', label: 'Advanced', icon: Wrench, Comp: AdvancedSettings }
] as const

export function SettingsPanel() {
  const section = useUiStore((s) => s.settingsSection)
  const setSection = useUiStore((s) => s.openSettings)
  const setView = useUiStore((s) => s.setView)
  // Fall back rather than crash if SECTIONS and SettingsSection ever drift apart.
  const Active = (SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]).Comp

  return (
    <div className="flex-1 flex min-h-0 bg-bg">
      <div className="w-56 border-r border-border bg-surface flex flex-col shrink-0">
        <div className="h-9 flex items-center justify-between px-3 border-b border-border">
          <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">Settings</span>
          <button className="text-muted hover:text-text" onClick={() => setView('sessions')} title="Close settings"><X size={14} /></button>
        </div>
        <div className="p-2 space-y-0.5 overflow-y-auto">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-input text-[13px] text-left', section === id ? 'bg-accent/15 text-text' : 'text-muted hover:bg-surface-2 hover:text-text')}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-6">
          <Active />
        </div>
      </div>
    </div>
  )
}
