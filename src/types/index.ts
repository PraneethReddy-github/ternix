// Shared domain models — imported by both the Electron main process and the React renderer.
// Keep this file dependency-free so it can be bundled into either side.

export type Protocol = 'ssh' | 'telnet' | 'serial' | 'rdp' | 'vnc' | 'local'
export type AuthType = 'password' | 'key' | 'agent' | 'keyboard-interactive' | 'none'
export type TunnelType = 'local' | 'remote' | 'dynamic'
export type Parity = 'none' | 'even' | 'odd' | 'mark' | 'space'
export type FlowControl = 'none' | 'rtscts' | 'xon/xoff'

export interface Group {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
  color: string | null
  icon: string | null
  created_at: string
}

/**
 * A saved connection. Secret fields (`password`, `passphrase`, `vncPassword`) are only
 * ever present in plaintext transiently in the renderer when the user types them; the
 * main process encrypts them into the *_enc BLOB columns and never returns plaintext.
 */
export interface Session {
  id: number
  group_id: number | null
  name: string
  protocol: Protocol
  host: string | null
  port: number | null
  username: string | null
  auth_type: AuthType | null
  hasPassword: boolean // whether an encrypted password is stored (plaintext never leaves main)
  ssh_key_id: number | null
  hasPassphrase: boolean
  // SSH
  jump_host_id: number | null
  keepalive_interval: number
  keepalive_count_max: number
  x11_forwarding: boolean
  agent_forwarding: boolean
  compression: boolean
  server_alive_interval: number
  // Serial
  baud_rate: number
  data_bits: number
  stop_bits: number
  parity: Parity
  flow_control: FlowControl
  com_port: string | null
  // RDP
  rdp_domain: string | null
  rdp_width: number
  rdp_height: number
  rdp_color_depth: number
  rdp_fullscreen: boolean
  // VNC
  hasVncPassword: boolean
  // Terminal prefs
  terminal_encoding: string
  terminal_cols: number | null
  terminal_rows: number | null
  env_vars: Record<string, string>
  startup_commands: string[]
  notes: string | null
  tags: string[]
  last_connected: string | null
  connect_count: number
  sort_order: number
  color: string | null
  icon: string | null
  created_at: string
  updated_at: string
}

/** Payload used to create/update a session. Plaintext secrets allowed here (input only). */
export interface SessionInput extends Partial<Omit<Session, 'id' | 'hasPassword' | 'hasPassphrase' | 'hasVncPassword'>> {
  name: string
  protocol: Protocol
  password?: string | null
  passphrase?: string | null
  vncPassword?: string | null
  clearPassword?: boolean
  clearPassphrase?: boolean
}

export interface SshKey {
  id: number
  name: string
  key_type: string
  public_key: string | null
  fingerprint: string | null
  comment: string | null
  created_at: string
  usedBy?: number // number of sessions referencing this key
}

export interface KeyGenerateOptions {
  name: string
  type: 'ed25519' | 'rsa' | 'ecdsa'
  bits?: number // rsa: 2048/4096, ecdsa: 256/384/521
  comment?: string
  passphrase?: string
}

export interface Snippet {
  id: number
  name: string
  description: string | null
  command: string
  tags: string[]
  is_global: boolean
  session_id: number | null
  created_at: string
}

export interface Tunnel {
  id: number
  session_id: number
  name: string | null
  tunnel_type: TunnelType
  local_host: string
  local_port: number
  remote_host: string | null
  remote_port: number | null
  auto_start: boolean
  created_at: string
}

export interface ActiveTunnel extends Tunnel {
  status: 'active' | 'pending' | 'failed'
  bytesTransferred: number
  error?: string
  tabId?: string
}

export interface ConnectionLogEntry {
  id: number
  session_id: number | null
  session_name: string | null
  host: string | null
  connected_at: string | null
  disconnected_at: string | null
  duration_seconds: number | null
  disconnect_reason: string | null
}

export interface Recording {
  id: number
  session_id: number | null
  session_name: string | null
  started_at: string
  duration_ms: number | null
  cast_path: string | null
}

export interface KnownHost {
  id: number
  host: string
  port: number
  key_type: string
  fingerprint: string
  created_at: string
}

// ---- Terminal / connection runtime ----

export interface SpawnOptions {
  tabId: string
  sessionId?: number | null // null/undefined => local shell
  cols: number
  rows: number
  localShell?: { shell?: string; args?: string[]; cwd?: string }
}

export interface SpawnResult {
  tabId: string
  protocol: Protocol
  ok: boolean
  error?: string
  banner?: string
}

export interface HostKeyPrompt {
  tabId: string
  host: string
  port: number
  keyType: string
  fingerprint: string
  changed: boolean
  oldFingerprint?: string
}

export type HostKeyDecision = 'accept' | 'always' | 'reject'

export interface KeyboardInteractivePrompt {
  tabId: string
  name: string
  instructions: string
  prompts: { prompt: string; echo: boolean }[]
}

// ---- SFTP ----

export interface SftpEntry {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
  mode: number
  permissions: string // e.g. "rwxr-xr-x"
  modified: number // epoch ms
  owner: string
  group: string
}

export interface TransferProgress {
  transferId: string
  direction: 'upload' | 'download'
  filename: string
  localPath: string
  remotePath: string
  transferred: number
  total: number
  bytesPerSecond: number
  etaSeconds: number
  status: 'pending' | 'active' | 'paused' | 'done' | 'error' | 'cancelled'
  error?: string
}

// ---- IPC envelope ----

/** Every IPC handler returns this envelope instead of throwing. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface VaultStatus {
  locked: boolean
  hasMasterPassword: boolean
  usingKeychain: boolean
}

// ---- Theme ----

export interface TerminalTheme {
  id: string
  name: string
  type: 'dark' | 'light'
  // xterm.js ITheme tokens
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
  // UI chrome tokens
  ui: {
    bg: string
    surface: string
    surface2: string
    border: string
    accent: string
    accentMuted: string
    text: string
    muted: string
    success: string
    warning: string
    danger: string
  }
}

// ---- Import / Export ----

export type ImportSource = 'putty' | 'winscp' | 'sshconfig' | 'csv' | 'ternix' | 'mobaxterm' | 'tabby'
export type ExportTarget = 'ternix' | 'csv' | 'sshconfig' | 'mobaxterm' | 'tabby'

export interface ImportResult {
  imported: number
  skipped: number
  sessions: SessionInput[]
}
