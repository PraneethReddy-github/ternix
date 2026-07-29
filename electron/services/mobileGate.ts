/**
 * Decides whether a saved session can be opened from a phone.
 *
 * The desktop answers three kinds of blocking prompt mid-connect — a missing credential,
 * an unrecognised host key, and keyboard-interactive challenges — by opening a modal.
 * A phone has no modal to open, so a session that would raise one connects to a spinner
 * that never resolves. Rather than half-implement three prompt flows on a 5-inch screen,
 * the phone only offers sessions that are already answerable, and says why for the rest.
 */

export type BlockReason = 'password' | 'key' | 'hostkey' | 'protocol' | 'vault'

export interface GateSession {
  protocol: string
  auth_type: string | null
  host: string | null
  port: number | null
  /** Whether an encrypted password is stored for this session. */
  hasPassword: boolean
  ssh_key_id: number | null
  jump_host_id: number | null
}

export interface GateVerdict {
  ok: boolean
  reason?: BlockReason
}

const MESSAGES: Record<BlockReason, string> = {
  password: 'No saved password — open it once on the desktop',
  key: 'No SSH key linked — open it once on the desktop',
  hostkey: 'Host key not trusted yet — open it once on the desktop',
  protocol: 'Not a terminal session',
  vault: 'Vault is locked — unlock Ternix on the desktop'
}

export function blockMessage(reason: BlockReason): string {
  return MESSAGES[reason]
}

/**
 * `knownHost` reports whether a host key is already pinned for a host/port.
 * `lookup` resolves a jump-host id to another session, so a chain is only openable when
 * every hop in it is.
 * `vaultLocked` is the desktop vault's state — see the check inside.
 */
export function gateSession(
  s: GateSession,
  knownHost: (host: string, port: number) => boolean,
  strictness: string,
  lookup: (id: number) => GateSession | null,
  seen: Set<number> = new Set(),
  vaultLocked = false
): GateVerdict {
  if (s.protocol === 'rdp' || s.protocol === 'vnc') return { ok: false, reason: 'protocol' }

  // A locked vault cannot hand over a stored password, passphrase or private key, and the
  // only way to unlock it is a desktop modal. Without this the session looks openable and
  // then dies mid-connect with a message about a vault the phone cannot do anything about.
  // Sessions holding no secret at all (agent auth, a bare telnet host) are unaffected.
  if (vaultLocked && (s.hasPassword || s.ssh_key_id != null)) return { ok: false, reason: 'vault' }

  // Local, telnet and serial either need no secret or prompt inside the terminal itself,
  // where a phone can answer perfectly well.
  if (s.protocol !== 'ssh') return { ok: true }

  if (s.auth_type === 'password' && !s.hasPassword) return { ok: false, reason: 'password' }
  if (s.auth_type === 'key' && !s.ssh_key_id) return { ok: false, reason: 'key' }

  // auto-accept pins whatever key it is handed, so no prompt can appear. Every other
  // strictness either prompts (blocking) or refuses outright on an unknown host.
  if (strictness !== 'auto-accept' && !knownHost(s.host ?? '', s.port ?? 22)) {
    return { ok: false, reason: 'hostkey' }
  }

  if (s.jump_host_id != null && !seen.has(s.jump_host_id)) {
    seen.add(s.jump_host_id)
    const jump = lookup(s.jump_host_id)
    // A dangling jump-host id fails at connect time on the desktop too; let it through
    // so the phone shows the same error rather than silently hiding the session.
    if (jump) return gateSession(jump, knownHost, strictness, lookup, seen, vaultLocked)
  }

  return { ok: true }
}
