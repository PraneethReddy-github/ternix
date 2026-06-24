import { useUiStore } from '@/store/useUiStore'
import { ConfirmDialog } from './ConfirmDialog'
import { NewSessionDialog } from './NewSessionDialog'
import { KeyVaultDialog } from './KeyVaultDialog'
import { TunnelDialog } from './TunnelDialog'
import { SnippetDialog } from './SnippetDialog'
import { ThemeEditorDialog } from './ThemeEditorDialog'
import { ExportImportDialog } from './ExportImportDialog'
import { ConnectionLogDialog } from './ConnectionLogDialog'
import { PromptDialog } from './PromptDialog'

export function DialogHost() {
  const dialogs = useUiStore((s) => s.dialogs)
  const close = useUiStore((s) => s.closeDialog)
  if (!dialogs || dialogs.length === 0) return null

  return (
    <>
      {dialogs.map((dialog, i) => {
        const isTop = i === dialogs.length - 1
        // Only the top-most dialog handles ESC key to close
        const onClose = isTop ? close : () => {}
        
        switch (dialog.kind) {
          case 'confirm':
            return <ConfirmDialog key={i} {...dialog} onClose={onClose} />
          case 'newSession':
            return <NewSessionDialog key={i} session={dialog.session} groupId={dialog.groupId} duplicate={dialog.duplicate} onClose={onClose} />
          case 'keyVault':
            return <KeyVaultDialog key={i} onClose={onClose} />
          case 'tunnels':
            return <TunnelDialog key={i} sessionId={dialog.sessionId} onClose={onClose} />
          case 'snippet':
            return <SnippetDialog key={i} id={dialog.id} onClose={onClose} />
          case 'themeEditor':
            return <ThemeEditorDialog key={i} baseId={dialog.baseId} onClose={onClose} />
          case 'exportImport':
            return <ExportImportDialog key={i} onClose={onClose} />
          case 'connectionLog':
            return <ConnectionLogDialog key={i} sessionId={dialog.sessionId} onClose={onClose} />
          case 'prompt':
            return <PromptDialog key={i} {...dialog} onClose={onClose} />
          default:
            return null
        }
      })}
    </>
  )
}
