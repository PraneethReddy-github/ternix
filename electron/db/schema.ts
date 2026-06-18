// All SQLite table definitions for Ternix. Encrypted credential columns are BLOBs
// holding AES-256-GCM ciphertext produced by CryptoService.

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  sort_order  INTEGER DEFAULT 0,
  color       TEXT,
  icon        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ssh_keys (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  key_type         TEXT NOT NULL,
  public_key       TEXT,
  private_key_enc  BLOB NOT NULL,
  fingerprint      TEXT,
  comment          TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id         INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  protocol         TEXT NOT NULL CHECK(protocol IN ('ssh','telnet','serial','rdp','vnc','local')),
  host             TEXT,
  port             INTEGER,
  username         TEXT,
  auth_type        TEXT CHECK(auth_type IN ('password','key','agent','keyboard-interactive','none')),
  password_enc     BLOB,
  ssh_key_id       INTEGER REFERENCES ssh_keys(id) ON DELETE SET NULL,
  passphrase_enc   BLOB,
  jump_host_id     INTEGER REFERENCES sessions(id),
  keepalive_interval INTEGER DEFAULT 30,
  keepalive_count_max INTEGER DEFAULT 3,
  x11_forwarding   INTEGER DEFAULT 0,
  agent_forwarding INTEGER DEFAULT 0,
  compression      INTEGER DEFAULT 0,
  server_alive_interval INTEGER DEFAULT 0,
  baud_rate        INTEGER DEFAULT 9600,
  data_bits        INTEGER DEFAULT 8,
  stop_bits        REAL DEFAULT 1,
  parity           TEXT DEFAULT 'none',
  flow_control     TEXT DEFAULT 'none',
  com_port         TEXT,
  rdp_domain       TEXT,
  rdp_width        INTEGER DEFAULT 1920,
  rdp_height       INTEGER DEFAULT 1080,
  rdp_color_depth  INTEGER DEFAULT 32,
  rdp_fullscreen   INTEGER DEFAULT 0,
  vnc_password_enc BLOB,
  terminal_encoding TEXT DEFAULT 'utf-8',
  terminal_cols    INTEGER,
  terminal_rows    INTEGER,
  env_vars         TEXT,
  startup_commands TEXT,
  notes            TEXT,
  tags             TEXT,
  last_connected   DATETIME,
  connect_count    INTEGER DEFAULT 0,
  sort_order       INTEGER DEFAULT 0,
  color            TEXT,
  icon             TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS snippets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  command     TEXT NOT NULL,
  tags        TEXT,
  is_global   INTEGER DEFAULT 1,
  session_id  INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tunnels (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name            TEXT,
  tunnel_type     TEXT NOT NULL CHECK(tunnel_type IN ('local','remote','dynamic')),
  local_host      TEXT DEFAULT '127.0.0.1',
  local_port      INTEGER NOT NULL,
  remote_host     TEXT,
  remote_port     INTEGER,
  auto_start      INTEGER DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connection_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  session_name TEXT,
  host        TEXT,
  connected_at DATETIME,
  disconnected_at DATETIME,
  duration_seconds INTEGER,
  disconnect_reason TEXT
);

CREATE TABLE IF NOT EXISTS recordings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  session_name TEXT,
  started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_ms INTEGER,
  cast_path   TEXT
);

CREATE TABLE IF NOT EXISTS known_hosts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  host        TEXT NOT NULL,
  port        INTEGER NOT NULL DEFAULT 22,
  key_type    TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  raw_key     TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(host, port)
);

CREATE TABLE IF NOT EXISTS custom_themes (
  id          TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_meta (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  salt          BLOB,
  verifier_enc  BLOB,
  using_keychain INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_tunnels_session ON tunnels(session_id);
CREATE INDEX IF NOT EXISTS idx_snippets_session ON snippets(session_id);
CREATE INDEX IF NOT EXISTS idx_log_session ON connection_log(session_id);
`
