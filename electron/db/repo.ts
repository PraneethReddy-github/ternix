import { DatabaseService } from '../services/DatabaseService'
import { CryptoService } from '../services/CryptoService'
import { scopeSnippet } from './snippetScope'
import type {
  Group,
  Session,
  SessionInput,
  Snippet,
  Tunnel,
  ConnectionLogEntry,
  Recording,
  KnownHost,
  SshKey
} from '@shared/index'

// ---------------------------------------------------------------------------
// Row <-> model mapping helpers
// ---------------------------------------------------------------------------

const j = {
  parseObj(v: string | null): Record<string, string> {
    if (!v) return {}
    try {
      return JSON.parse(v)
    } catch {
      return {}
    }
  },
  parseArr(v: string | null): string[] {
    if (!v) return []
    try {
      const x = JSON.parse(v)
      return Array.isArray(x) ? x : []
    } catch {
      return []
    }
  }
}

function rowToSession(r: any): Session {
  return {
    id: r.id,
    group_id: r.group_id,
    name: r.name,
    protocol: r.protocol,
    host: r.host,
    port: r.port,
    username: r.username,
    auth_type: r.auth_type,
    hasPassword: !!r.password_enc,
    ssh_key_id: r.ssh_key_id,
    hasPassphrase: !!r.passphrase_enc,
    jump_host_id: r.jump_host_id,
    keepalive_interval: r.keepalive_interval,
    keepalive_count_max: r.keepalive_count_max,
    x11_forwarding: !!r.x11_forwarding,
    agent_forwarding: !!r.agent_forwarding,
    compression: !!r.compression,
    server_alive_interval: r.server_alive_interval,
    baud_rate: r.baud_rate,
    data_bits: r.data_bits,
    stop_bits: r.stop_bits,
    parity: r.parity,
    flow_control: r.flow_control,
    com_port: r.com_port,
    rdp_domain: r.rdp_domain,
    rdp_width: r.rdp_width,
    rdp_height: r.rdp_height,
    rdp_color_depth: r.rdp_color_depth,
    rdp_fullscreen: !!r.rdp_fullscreen,
    hasVncPassword: !!r.vnc_password_enc,
    terminal_encoding: r.terminal_encoding,
    terminal_cols: r.terminal_cols,
    terminal_rows: r.terminal_rows,
    env_vars: j.parseObj(r.env_vars),
    startup_commands: j.parseArr(r.startup_commands),
    notes: r.notes,
    tags: j.parseArr(r.tags),
    last_connected: r.last_connected,
    connect_count: r.connect_count,
    sort_order: r.sort_order,
    color: r.color,
    icon: r.icon,
    created_at: r.created_at,
    updated_at: r.updated_at
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export const groupsRepo = {
  list(): Group[] {
    return DatabaseService.get().prepare(`SELECT * FROM groups ORDER BY sort_order, name`).all() as Group[]
  },
  create(data: Partial<Group> & { name: string }): Group {
    const db = DatabaseService.get()
    const info = db
      .prepare(`INSERT INTO groups (name, parent_id, sort_order, color, icon) VALUES (?, ?, ?, ?, ?)`)
      .run(data.name, data.parent_id ?? null, data.sort_order ?? 0, data.color ?? null, data.icon ?? null)
    return db.prepare(`SELECT * FROM groups WHERE id = ?`).get(info.lastInsertRowid) as Group
  },
  update(id: number, data: Partial<Group>): Group {
    const db = DatabaseService.get()
    const cur = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(id) as Group
    if (!cur) throw new Error('Group not found')
    db.prepare(`UPDATE groups SET name = ?, parent_id = ?, sort_order = ?, color = ?, icon = ? WHERE id = ?`).run(
      data.name ?? cur.name,
      data.parent_id !== undefined ? data.parent_id : cur.parent_id,
      data.sort_order ?? cur.sort_order,
      data.color !== undefined ? data.color : cur.color,
      data.icon !== undefined ? data.icon : cur.icon,
      id
    )
    return db.prepare(`SELECT * FROM groups WHERE id = ?`).get(id) as Group
  },
  delete(id: number): void {
    DatabaseService.get().prepare(`DELETE FROM groups WHERE id = ?`).run(id)
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const SESSION_DEFAULTS = {
  keepalive_interval: 30,
  keepalive_count_max: 3,
  server_alive_interval: 0,
  baud_rate: 9600,
  data_bits: 8,
  stop_bits: 1,
  parity: 'none',
  flow_control: 'none',
  rdp_width: 1920,
  rdp_height: 1080,
  rdp_color_depth: 32,
  terminal_encoding: 'utf-8'
}

export const sessionsRepo = {
  list(): Session[] {
    return (DatabaseService.get().prepare(`SELECT * FROM sessions ORDER BY sort_order, name`).all() as any[]).map(
      rowToSession
    )
  },
  get(id: number): Session | null {
    const r = DatabaseService.get().prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as any
    return r ? rowToSession(r) : null
  },
  /** Raw secret access — only for the connection layer, never returned over IPC. */
  getSecrets(id: number): { password: string | null; passphrase: string | null; vncPassword: string | null } {
    const r = DatabaseService.get()
      .prepare(`SELECT password_enc, passphrase_enc, vnc_password_enc FROM sessions WHERE id = ?`)
      .get(id) as any
    if (!r) return { password: null, passphrase: null, vncPassword: null }
    return {
      password: CryptoService.decrypt(r.password_enc),
      passphrase: CryptoService.decrypt(r.passphrase_enc),
      vncPassword: CryptoService.decrypt(r.vnc_password_enc)
    }
  },
  create(data: SessionInput): Session {
    const db = DatabaseService.get()
    const d = { ...SESSION_DEFAULTS, ...data }
    const info = db
      .prepare(
        `INSERT INTO sessions (
          group_id, name, protocol, host, port, username, auth_type, password_enc, ssh_key_id, passphrase_enc,
          jump_host_id, keepalive_interval, keepalive_count_max, x11_forwarding, agent_forwarding, compression,
          server_alive_interval, baud_rate, data_bits, stop_bits, parity, flow_control, com_port,
          rdp_domain, rdp_width, rdp_height, rdp_color_depth, rdp_fullscreen, vnc_password_enc,
          terminal_encoding, terminal_cols, terminal_rows, env_vars, startup_commands, notes, tags,
          sort_order, color, icon
        ) VALUES (
          @group_id, @name, @protocol, @host, @port, @username, @auth_type, @password_enc, @ssh_key_id, @passphrase_enc,
          @jump_host_id, @keepalive_interval, @keepalive_count_max, @x11_forwarding, @agent_forwarding, @compression,
          @server_alive_interval, @baud_rate, @data_bits, @stop_bits, @parity, @flow_control, @com_port,
          @rdp_domain, @rdp_width, @rdp_height, @rdp_color_depth, @rdp_fullscreen, @vnc_password_enc,
          @terminal_encoding, @terminal_cols, @terminal_rows, @env_vars, @startup_commands, @notes, @tags,
          @sort_order, @color, @icon
        )`
      )
      .run({
        group_id: d.group_id ?? null,
        name: d.name,
        protocol: d.protocol,
        host: d.host ?? null,
        port: d.port ?? null,
        username: d.username ?? null,
        auth_type: d.auth_type ?? null,
        password_enc: data.password ? CryptoService.encrypt(data.password) : null,
        ssh_key_id: d.ssh_key_id ?? null,
        passphrase_enc: data.passphrase ? CryptoService.encrypt(data.passphrase) : null,
        jump_host_id: d.jump_host_id ?? null,
        keepalive_interval: d.keepalive_interval,
        keepalive_count_max: d.keepalive_count_max,
        x11_forwarding: d.x11_forwarding ? 1 : 0,
        agent_forwarding: d.agent_forwarding ? 1 : 0,
        compression: d.compression ? 1 : 0,
        server_alive_interval: d.server_alive_interval,
        baud_rate: d.baud_rate,
        data_bits: d.data_bits,
        stop_bits: d.stop_bits,
        parity: d.parity,
        flow_control: d.flow_control,
        com_port: d.com_port ?? null,
        rdp_domain: d.rdp_domain ?? null,
        rdp_width: d.rdp_width,
        rdp_height: d.rdp_height,
        rdp_color_depth: d.rdp_color_depth,
        rdp_fullscreen: d.rdp_fullscreen ? 1 : 0,
        vnc_password_enc: data.vncPassword ? CryptoService.encrypt(data.vncPassword) : null,
        terminal_encoding: d.terminal_encoding,
        terminal_cols: d.terminal_cols ?? null,
        terminal_rows: d.terminal_rows ?? null,
        env_vars: JSON.stringify(d.env_vars ?? {}),
        startup_commands: JSON.stringify(d.startup_commands ?? []),
        notes: d.notes ?? null,
        tags: JSON.stringify(d.tags ?? []),
        sort_order: d.sort_order ?? 0,
        color: d.color ?? null,
        icon: d.icon ?? null
      })
    return this.get(Number(info.lastInsertRowid))!
  },
  update(id: number, data: SessionInput): Session {
    const db = DatabaseService.get()
    const cur = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as any
    if (!cur) throw new Error('Session not found')

    // Only re-encrypt secrets when the caller supplied a new plaintext or asked to clear.
    let passwordEnc = cur.password_enc
    if (data.clearPassword) passwordEnc = null
    else if (data.password) passwordEnc = CryptoService.encrypt(data.password)

    let passphraseEnc = cur.passphrase_enc
    if (data.clearPassphrase) passphraseEnc = null
    else if (data.passphrase) passphraseEnc = CryptoService.encrypt(data.passphrase)

    let vncEnc = cur.vnc_password_enc
    if (data.vncPassword) vncEnc = CryptoService.encrypt(data.vncPassword)

    const pick = <K extends string>(k: K, fallback: any) => ((data as any)[k] !== undefined ? (data as any)[k] : fallback)

    db.prepare(
      `UPDATE sessions SET
        group_id=@group_id, name=@name, protocol=@protocol, host=@host, port=@port, username=@username,
        auth_type=@auth_type, password_enc=@password_enc, ssh_key_id=@ssh_key_id, passphrase_enc=@passphrase_enc,
        jump_host_id=@jump_host_id, keepalive_interval=@keepalive_interval, keepalive_count_max=@keepalive_count_max,
        x11_forwarding=@x11_forwarding, agent_forwarding=@agent_forwarding, compression=@compression,
        server_alive_interval=@server_alive_interval, baud_rate=@baud_rate, data_bits=@data_bits, stop_bits=@stop_bits,
        parity=@parity, flow_control=@flow_control, com_port=@com_port, rdp_domain=@rdp_domain, rdp_width=@rdp_width,
        rdp_height=@rdp_height, rdp_color_depth=@rdp_color_depth, rdp_fullscreen=@rdp_fullscreen,
        vnc_password_enc=@vnc_password_enc, terminal_encoding=@terminal_encoding, terminal_cols=@terminal_cols,
        terminal_rows=@terminal_rows, env_vars=@env_vars, startup_commands=@startup_commands, notes=@notes, tags=@tags,
        sort_order=@sort_order, color=@color, icon=@icon, updated_at=CURRENT_TIMESTAMP
      WHERE id=@id`
    ).run({
      id,
      group_id: pick('group_id', cur.group_id),
      name: pick('name', cur.name),
      protocol: pick('protocol', cur.protocol),
      host: pick('host', cur.host),
      port: pick('port', cur.port),
      username: pick('username', cur.username),
      auth_type: pick('auth_type', cur.auth_type),
      password_enc: passwordEnc,
      ssh_key_id: pick('ssh_key_id', cur.ssh_key_id),
      passphrase_enc: passphraseEnc,
      jump_host_id: pick('jump_host_id', cur.jump_host_id),
      keepalive_interval: pick('keepalive_interval', cur.keepalive_interval),
      keepalive_count_max: pick('keepalive_count_max', cur.keepalive_count_max),
      x11_forwarding: pick('x11_forwarding', cur.x11_forwarding) ? 1 : 0,
      agent_forwarding: pick('agent_forwarding', cur.agent_forwarding) ? 1 : 0,
      compression: pick('compression', cur.compression) ? 1 : 0,
      server_alive_interval: pick('server_alive_interval', cur.server_alive_interval),
      baud_rate: pick('baud_rate', cur.baud_rate),
      data_bits: pick('data_bits', cur.data_bits),
      stop_bits: pick('stop_bits', cur.stop_bits),
      parity: pick('parity', cur.parity),
      flow_control: pick('flow_control', cur.flow_control),
      com_port: pick('com_port', cur.com_port),
      rdp_domain: pick('rdp_domain', cur.rdp_domain),
      rdp_width: pick('rdp_width', cur.rdp_width),
      rdp_height: pick('rdp_height', cur.rdp_height),
      rdp_color_depth: pick('rdp_color_depth', cur.rdp_color_depth),
      rdp_fullscreen: pick('rdp_fullscreen', cur.rdp_fullscreen) ? 1 : 0,
      vnc_password_enc: vncEnc,
      terminal_encoding: pick('terminal_encoding', cur.terminal_encoding),
      terminal_cols: pick('terminal_cols', cur.terminal_cols),
      terminal_rows: pick('terminal_rows', cur.terminal_rows),
      env_vars: data.env_vars !== undefined ? JSON.stringify(data.env_vars) : cur.env_vars,
      startup_commands: data.startup_commands !== undefined ? JSON.stringify(data.startup_commands) : cur.startup_commands,
      notes: pick('notes', cur.notes),
      tags: data.tags !== undefined ? JSON.stringify(data.tags) : cur.tags,
      sort_order: pick('sort_order', cur.sort_order),
      color: pick('color', cur.color),
      icon: pick('icon', cur.icon)
    })
    return this.get(id)!
  },
  delete(id: number): void {
    DatabaseService.get().prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
  },
  duplicate(id: number): Session {
    const db = DatabaseService.get()
    const r = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as any
    if (!r) throw new Error('Session not found')
    const info = db
      .prepare(
        `INSERT INTO sessions (
          group_id, name, protocol, host, port, username, auth_type, password_enc, ssh_key_id, passphrase_enc,
          jump_host_id, keepalive_interval, keepalive_count_max, x11_forwarding, agent_forwarding, compression,
          server_alive_interval, baud_rate, data_bits, stop_bits, parity, flow_control, com_port,
          rdp_domain, rdp_width, rdp_height, rdp_color_depth, rdp_fullscreen, vnc_password_enc,
          terminal_encoding, terminal_cols, terminal_rows, env_vars, startup_commands, notes, tags, sort_order, color, icon
        )
        SELECT group_id, name || ' (copy)', protocol, host, port, username, auth_type, password_enc, ssh_key_id, passphrase_enc,
          jump_host_id, keepalive_interval, keepalive_count_max, x11_forwarding, agent_forwarding, compression,
          server_alive_interval, baud_rate, data_bits, stop_bits, parity, flow_control, com_port,
          rdp_domain, rdp_width, rdp_height, rdp_color_depth, rdp_fullscreen, vnc_password_enc,
          terminal_encoding, terminal_cols, terminal_rows, env_vars, startup_commands, notes, tags, sort_order, color, icon
        FROM sessions WHERE id = ?`
      )
      .run(id)
    return this.get(Number(info.lastInsertRowid))!
  },
  reorder(updates: { id: number; group_id: number | null; sort_order: number }[]): void {
    const db = DatabaseService.get()
    const stmt = db.prepare(`UPDATE sessions SET group_id = ?, sort_order = ? WHERE id = ?`)
    const tx = db.transaction(() => {
      for (const u of updates) stmt.run(u.group_id, u.sort_order, u.id)
    })
    tx()
  },
  markConnected(id: number): void {
    DatabaseService.get()
      .prepare(`UPDATE sessions SET last_connected = CURRENT_TIMESTAMP, connect_count = connect_count + 1 WHERE id = ?`)
      .run(id)
  }
}

// ---------------------------------------------------------------------------
// SSH keys
// ---------------------------------------------------------------------------

export const keysRepo = {
  list(): SshKey[] {
    const db = DatabaseService.get()
    const rows = db.prepare(`SELECT id, name, key_type, public_key, fingerprint, comment, created_at FROM ssh_keys ORDER BY name`).all() as SshKey[]
    const counts = db.prepare(`SELECT ssh_key_id AS kid, COUNT(*) AS n FROM sessions WHERE ssh_key_id IS NOT NULL GROUP BY ssh_key_id`).all() as { kid: number; n: number }[]
    const map = new Map(counts.map((c) => [c.kid, c.n]))
    return rows.map((r) => ({ ...r, usedBy: map.get(r.id) ?? 0 }))
  },
  insert(name: string, keyType: string, publicKey: string, privatePem: string, fingerprint: string, comment: string): SshKey {
    const db = DatabaseService.get()
    const info = db
      .prepare(`INSERT INTO ssh_keys (name, key_type, public_key, private_key_enc, fingerprint, comment) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(name, keyType, publicKey, CryptoService.encrypt(privatePem), fingerprint, comment)
    return db.prepare(`SELECT id, name, key_type, public_key, fingerprint, comment, created_at FROM ssh_keys WHERE id = ?`).get(info.lastInsertRowid) as SshKey
  },
  findByFingerprint(fingerprint: string): SshKey | undefined {
    return DatabaseService.get()
      .prepare(`SELECT id, name, key_type, public_key, fingerprint, comment, created_at FROM ssh_keys WHERE fingerprint = ?`)
      .get(fingerprint) as SshKey | undefined
  },
  findByName(name: string): SshKey | undefined {
    return DatabaseService.get()
      .prepare(`SELECT id, name, key_type, public_key, fingerprint, comment, created_at FROM ssh_keys WHERE name = ?`)
      .get(name) as SshKey | undefined
  },
  getPrivate(id: number): string | null {
    const r = DatabaseService.get().prepare(`SELECT private_key_enc FROM ssh_keys WHERE id = ?`).get(id) as { private_key_enc: Buffer } | undefined
    return r ? CryptoService.decrypt(r.private_key_enc) : null
  },
  getPublic(id: number): string | null {
    const r = DatabaseService.get().prepare(`SELECT public_key FROM ssh_keys WHERE id = ?`).get(id) as { public_key: string } | undefined
    return r?.public_key ?? null
  },
  delete(id: number): void {
    DatabaseService.get().prepare(`DELETE FROM ssh_keys WHERE id = ?`).run(id)
  }
}

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

function rowToSnippet(r: any): Snippet {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    command: r.command,
    tags: j.parseArr(r.tags),
    is_global: !!r.is_global,
    session_id: r.session_id,
    created_at: r.created_at
  }
}

export const snippetsRepo = {
  list(): Snippet[] {
    return (DatabaseService.get().prepare(`SELECT * FROM snippets ORDER BY name`).all() as any[]).map(rowToSnippet)
  },
  create(data: Partial<Snippet> & { name: string; command: string }): Snippet {
    const db = DatabaseService.get()
    const scope = scopeSnippet(data.is_global, data.session_id)
    const info = db
      .prepare(`INSERT INTO snippets (name, description, command, tags, is_global, session_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(data.name, data.description ?? null, data.command, JSON.stringify(data.tags ?? []), scope.is_global, scope.session_id)
    return rowToSnippet(db.prepare(`SELECT * FROM snippets WHERE id = ?`).get(info.lastInsertRowid))
  },
  update(id: number, data: Partial<Snippet>): Snippet {
    const db = DatabaseService.get()
    const cur = rowToSnippet(db.prepare(`SELECT * FROM snippets WHERE id = ?`).get(id))
    const scope = scopeSnippet(
      data.is_global ?? cur.is_global,
      data.session_id !== undefined ? data.session_id : cur.session_id
    )
    db.prepare(`UPDATE snippets SET name=?, description=?, command=?, tags=?, is_global=?, session_id=? WHERE id=?`).run(
      data.name ?? cur.name,
      data.description !== undefined ? data.description : cur.description,
      data.command ?? cur.command,
      JSON.stringify(data.tags ?? cur.tags),
      scope.is_global,
      scope.session_id,
      id
    )
    return rowToSnippet(db.prepare(`SELECT * FROM snippets WHERE id = ?`).get(id))
  },
  delete(id: number): void {
    DatabaseService.get().prepare(`DELETE FROM snippets WHERE id = ?`).run(id)
  }
}

// ---------------------------------------------------------------------------
// Tunnels
// ---------------------------------------------------------------------------

function rowToTunnel(r: any): Tunnel {
  return {
    id: r.id,
    session_id: r.session_id,
    name: r.name,
    tunnel_type: r.tunnel_type,
    local_host: r.local_host,
    local_port: r.local_port,
    remote_host: r.remote_host,
    remote_port: r.remote_port,
    auto_start: !!r.auto_start,
    created_at: r.created_at
  }
}

export const tunnelsRepo = {
  listForSession(sessionId: number): Tunnel[] {
    return (DatabaseService.get().prepare(`SELECT * FROM tunnels WHERE session_id = ? ORDER BY id`).all(sessionId) as any[]).map(rowToTunnel)
  },
  get(id: number): Tunnel | null {
    const r = DatabaseService.get().prepare(`SELECT * FROM tunnels WHERE id = ?`).get(id)
    return r ? rowToTunnel(r) : null
  },
  create(data: Partial<Tunnel> & { session_id: number; tunnel_type: string; local_port: number }): Tunnel {
    const db = DatabaseService.get()
    const info = db
      .prepare(`INSERT INTO tunnels (session_id, name, tunnel_type, local_host, local_port, remote_host, remote_port, auto_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(data.session_id, data.name ?? null, data.tunnel_type, data.local_host ?? '127.0.0.1', data.local_port, data.remote_host ?? null, data.remote_port ?? null, data.auto_start ? 1 : 0)
    return rowToTunnel(db.prepare(`SELECT * FROM tunnels WHERE id = ?`).get(info.lastInsertRowid))
  },
  update(id: number, data: Partial<Tunnel>): Tunnel {
    const db = DatabaseService.get()
    const cur = rowToTunnel(db.prepare(`SELECT * FROM tunnels WHERE id = ?`).get(id))
    db.prepare(`UPDATE tunnels SET name=?, tunnel_type=?, local_host=?, local_port=?, remote_host=?, remote_port=?, auto_start=? WHERE id=?`).run(
      data.name !== undefined ? data.name : cur.name,
      data.tunnel_type ?? cur.tunnel_type,
      data.local_host ?? cur.local_host,
      data.local_port ?? cur.local_port,
      data.remote_host !== undefined ? data.remote_host : cur.remote_host,
      data.remote_port !== undefined ? data.remote_port : cur.remote_port,
      (data.auto_start ?? cur.auto_start) ? 1 : 0,
      id
    )
    return rowToTunnel(db.prepare(`SELECT * FROM tunnels WHERE id = ?`).get(id))
  },
  delete(id: number): void {
    DatabaseService.get().prepare(`DELETE FROM tunnels WHERE id = ?`).run(id)
  }
}

// ---------------------------------------------------------------------------
// Connection log
// ---------------------------------------------------------------------------

export const logRepo = {
  list(sessionId?: number): ConnectionLogEntry[] {
    const db = DatabaseService.get()
    if (sessionId != null) {
      return db.prepare(`SELECT * FROM connection_log WHERE session_id = ? ORDER BY connected_at DESC LIMIT 500`).all(sessionId) as ConnectionLogEntry[]
    }
    return db.prepare(`SELECT * FROM connection_log ORDER BY connected_at DESC LIMIT 500`).all() as ConnectionLogEntry[]
  },
  start(sessionId: number | null, sessionName: string, host: string | null): number {
    const info = DatabaseService.get()
      .prepare(`INSERT INTO connection_log (session_id, session_name, host, connected_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`)
      .run(sessionId, sessionName, host)
    return Number(info.lastInsertRowid)
  },
  end(logId: number, reason: string): void {
    const db = DatabaseService.get()
    const row = db.prepare(`SELECT connected_at FROM connection_log WHERE id = ?`).get(logId) as { connected_at: string } | undefined
    let duration: number | null = null
    if (row?.connected_at) duration = Math.max(0, Math.round((Date.now() - new Date(row.connected_at + 'Z').getTime()) / 1000))
    db.prepare(`UPDATE connection_log SET disconnected_at = CURRENT_TIMESTAMP, duration_seconds = ?, disconnect_reason = ? WHERE id = ?`).run(duration, reason, logId)
  },
  clear(): void {
    DatabaseService.get().prepare(`DELETE FROM connection_log`).run()
  }
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

export const recordingsRepo = {
  list(): Recording[] {
    return DatabaseService.get().prepare(`SELECT * FROM recordings ORDER BY started_at DESC`).all() as Recording[]
  },
  create(sessionId: number | null, sessionName: string, castPath: string): number {
    const info = DatabaseService.get()
      .prepare(`INSERT INTO recordings (session_id, session_name, cast_path) VALUES (?, ?, ?)`)
      .run(sessionId, sessionName, castPath)
    return Number(info.lastInsertRowid)
  },
  finish(id: number, durationMs: number): void {
    DatabaseService.get().prepare(`UPDATE recordings SET duration_ms = ? WHERE id = ?`).run(durationMs, id)
  },
  get(id: number): Recording | null {
    return (DatabaseService.get().prepare(`SELECT * FROM recordings WHERE id = ?`).get(id) as Recording) ?? null
  },
  delete(id: number): void {
    DatabaseService.get().prepare(`DELETE FROM recordings WHERE id = ?`).run(id)
  }
}

// ---------------------------------------------------------------------------
// Known hosts
// ---------------------------------------------------------------------------

export const knownHostsRepo = {
  get(host: string, port: number): KnownHost | null {
    return (DatabaseService.get().prepare(`SELECT * FROM known_hosts WHERE host = ? AND port = ?`).get(host, port) as KnownHost) ?? null
  },
  upsert(host: string, port: number, keyType: string, fingerprint: string, rawKey: string): void {
    DatabaseService.get()
      .prepare(
        `INSERT INTO known_hosts (host, port, key_type, fingerprint, raw_key) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(host, port) DO UPDATE SET key_type = excluded.key_type, fingerprint = excluded.fingerprint, raw_key = excluded.raw_key`
      )
      .run(host, port, keyType, fingerprint, rawKey)
  },
  remove(host: string, port: number): void {
    DatabaseService.get().prepare(`DELETE FROM known_hosts WHERE host = ? AND port = ?`).run(host, port)
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsRepo = {
  get(key: string): string | null {
    const r = DatabaseService.get().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
    return r?.value ?? null
  },
  set(key: string, value: string): void {
    DatabaseService.get()
      .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, value)
  },
  getAll(): Record<string, string> {
    const rows = DatabaseService.get().prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }
}

// ---------------------------------------------------------------------------
// Custom themes
// ---------------------------------------------------------------------------

export const themesRepo = {
  list(): any[] {
    const rows = DatabaseService.get().prepare(`SELECT payload FROM custom_themes ORDER BY created_at`).all() as { payload: string }[]
    return rows.map((r) => JSON.parse(r.payload))
  },
  save(id: string, payload: any): void {
    DatabaseService.get()
      .prepare(`INSERT INTO custom_themes (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`)
      .run(id, JSON.stringify(payload))
  },
  delete(id: string): void {
    DatabaseService.get().prepare(`DELETE FROM custom_themes WHERE id = ?`).run(id)
  }
}
