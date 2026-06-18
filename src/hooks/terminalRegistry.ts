// Lightweight registry letting global shortcuts act on a specific pane's terminal
// without prop-drilling controllers through the tree.

export interface PaneActions {
  clear: () => void
  focus: () => void
  toggleSearch: () => void
  paste: (text: string) => void
}

const registry = new Map<string, PaneActions>()

export function registerPane(paneId: string, actions: PaneActions): () => void {
  registry.set(paneId, actions)
  return () => registry.delete(paneId)
}

export function paneActions(paneId: string | undefined | null): PaneActions | null {
  return paneId ? registry.get(paneId) ?? null : null
}
