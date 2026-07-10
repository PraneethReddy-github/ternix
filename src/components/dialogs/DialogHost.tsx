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
import { UnlockVaultDialog } from './UnlockVaultDialog'

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
        // Key by the dialog's stable id (not array index) so a chained dialog
        // that replaces another gets a fresh component instead of inheriting its state.
        const key = dialog._id

        switch (dialog.kind) {
          case 'confirm':
            return <ConfirmDialog key={key} {...dialog} onClose={onClose} />
          case 'newSession':
            return <NewSessionDialog key={key} session={dialog.session} groupId={dialog.groupId} duplicate={dialog.duplicate} onClose={onClose} />
          case 'keyVault':
            return <KeyVaultDialog key={key} onClose={onClose} />
          case 'tunnels':
            return <TunnelDialog key={key} sessionId={dialog.sessionId} onClose={onClose} />
          case 'snippet':
            return <SnippetDialog key={key} id={dialog.id} onClose={onClose} />
          case 'themeEditor':
            return <ThemeEditorDialog key={key} baseId={dialog.baseId} onClose={onClose} />
          case 'exportImport':
            return <ExportImportDialog key={key} onClose={onClose} />
          case 'connectionLog':
            return <ConnectionLogDialog key={key} sessionId={dialog.sessionId} onClose={onClose} />
          case 'prompt':
            return <PromptDialog key={key} {...dialog} onClose={onClose} />
          case 'unlockVault':
            return <UnlockVaultDialog key={key} onResolve={dialog.onResolve} onClose={onClose} />
          default:
            return null
        }
      })}
    </>
  )
}
