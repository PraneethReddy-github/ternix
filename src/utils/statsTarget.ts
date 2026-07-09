import type { Pane } from '@shared/ui'

export type PaneLike = Pick<Pane, 'id' | 'protocol' | 'state' | 'host' | 'title' | 'message'>

/**
 * What the monitor should be showing for the active tab.
 *
 * `pending` exists because a null tabId used to mean two different things — "this is a
 * local shell" and "no connected SSH pane" — so a session that was still handshaking
 * silently rendered the local machine's CPU and RAM as if they were the server's.
 * SSH is the only protocol that yields remote stats; everything else is a local shell.
 *
 * `pending` carries the pane's own state, because a session still handshaking and one
 * that was refused both have nothing to poll but should not look the same on screen.
 */
export type StatsTarget =
  | { kind: 'local' }
  | { kind: 'remote'; tabId: string; host: string }
  | { kind: 'pending'; host: string; state: PaneLike['state']; message?: string }

export function statsTargetFor(panes: readonly PaneLike[] | undefined): StatsTarget {
  const ssh = (panes ?? []).filter((p) => p.protocol === 'ssh')
  if (ssh.length === 0) return { kind: 'local' }
  const connected = ssh.find((p) => p.state === 'connected')
  if (connected) return { kind: 'remote', tabId: connected.id, host: connected.host ?? connected.title }
  // An SSH pane that isn't connected yet (or dropped). Never fall back to local.
  const p = ssh[0]
  return { kind: 'pending', host: p.host ?? p.title, state: p.state, message: p.message }
}

/** True once the pane has stopped trying: there will be no stats until the user reconnects. */
export function isDead(t: StatsTarget): boolean {
  return t.kind === 'pending' && (t.state === 'error' || t.state === 'disconnected')
}

/** Panes of the active tab. Kept here so every stats consumer reads the same thing. */
export function activePanes(s: {
  tabs: { id: string; panes: PaneLike[] }[]
  activeTabId: string | null
}): PaneLike[] | undefined {
  return s.tabs.find((t) => t.id === s.activeTabId)?.panes
}
