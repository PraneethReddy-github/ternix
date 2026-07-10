import { useUiStore } from '@/store/useUiStore'

let pending: Promise<boolean> | null = null

/**
 * Resolve true once the vault is usable. In keychain mode (or already unlocked) this
 * returns immediately; in master-password mode while locked it opens the unlock dialog.
 * Concurrent callers (e.g. several panes restored at startup) share one dialog.
 * Returns false only if the user cancels.
 */
export async function ensureVaultUnlocked(): Promise<boolean> {
  const status = await window.ternix.vault.status()
  if (!status.locked) return true
  if (pending) return pending
  pending = new Promise<boolean>((resolve) => {
    useUiStore.getState().openDialog({ kind: 'unlockVault', onResolve: resolve })
  }).finally(() => {
    pending = null
  })
  return pending
}
