<div align="center">
  <h1>
    <pre>>T<</pre>
  </h1>
  <h1>Ternix</h1>
  <p><strong>One terminal. Everything.</strong></p>
  <p>A modern, cross-platform SSH &amp; remote session manager built with Electron, React, and xterm.js.</p>

  <p>
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg" />
    <img alt="Version" src="https://img.shields.io/badge/version-1.0.2-green.svg" />
    <img alt="Platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows-lightgrey.svg" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron" />
    <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript" />
  </p>
</div>

---

## 🌟 Overview

**Ternix** is a privacy-first desktop terminal and remote-session manager. It speaks SSH, Telnet, Serial, local shells, RDP, and VNC from a single interface, and bundles the tools you normally reach for separately: an SFTP file manager, an SSH key vault, port forwarding, session recording, a live system monitor, and command snippets.

Everything is stored **locally** in a SQLite database. Credentials are encrypted at rest with AES-256-GCM. Nothing is sent to a cloud service.

It ships as a native app for Linux (AppImage/deb) and Windows (NSIS installer/portable).

---

## ✨ Features

### 🔌 Protocols

| Protocol | What Ternix does |
|---|---|
| **SSH** | Password, public-key, SSH-agent, keyboard-interactive (MFA/OTP), and `none` auth. Multi-hop jump-host chains (ProxyJump). Host-key pinning. Per-session keepalives and compression. Server banner display. Round-trip latency probe. Startup commands. Optional agent forwarding (under agent auth). |
| **Telnet** | Raw TCP with IAC option negotiation — NAWS (window size, re-sent on resize), terminal-type (`xterm-256color`), suppress-go-ahead, and echo. Auto-login on `login:` / `password:` prompt detection. |
| **Serial / COM** | Native `serialport`. Port enumeration with manufacturer names. Baud 300–921600, 7/8 data bits, 1/1.5/2 stop bits, parity (none/even/odd/mark/space), flow control (RTS/CTS or XON/XOFF). |
| **Local shell** | Native PTY via `node-pty`. Defaults to `$SHELL` (or `/bin/bash`) on Unix and `$COMSPEC` (or PowerShell) on Windows. Custom shell, args, cwd, and env supported. |
| **VNC** | Embedded in-pane viewer (noVNC) over a loopback, token-gated WebSocket↔TCP bridge. VNC password auth. Scales and centres to the pane. Falls back to a native client (`vncviewer`, `xtigervncviewer`, Remmina on Linux; TightVNC on Windows). |
| **RDP** | Embedded in-pane viewer (Apache Guacamole) through a local `guacd` daemon on **Linux**. guacd reachability is probed automatically; when it's unavailable — and always on Windows — Ternix hands off to a native client (`mstsc`, with credentials pre-stashed via `cmdkey`, or `xfreerdp`/`wlfreerdp`). guacd host/port configurable in Settings → Advanced. |

### 🖥️ Terminal

- **xterm.js 5.5** with optional **WebGL** acceleration (auto-disabled when ligatures are on, since ligatures require the DOM renderer)
- Addons: fit, search, web-links (clickable URLs), Unicode 11 width
- **Find** with match-case and regex toggles, next/previous, and overview-ruler marks
- **Context menu**: Copy · Paste · Select All · Copy as HTML · Find… · Clear · Reset
- Right-click configurable: show the context menu, or paste immediately
- Paste safety: CRLF normalised to LF, optional **multiline paste confirmation**, optional **trailing-whitespace trim**
- **Copy on select** and **middle-click paste**, both optional
- **Terminal bell**: off, visual flash, or audio beep
- Font zoom with `Ctrl` `+` / `-` / `0`
- **Broadcast mode** — type once in a floating bar, send to every pane of every broadcast-enabled tab

### 🪟 Tabs & Split Panes

- Up to **6 panes per tab**, tiled as at most **2 rows × 3 columns**. Panes share space equally.
- Split **right** (`Ctrl+Shift+D`) or **down** (`Ctrl+Shift+E`); a new pane inherits the active pane's session
- Tabs: drag to reorder, middle-click to close, rename, `Ctrl+1`…`Ctrl+9` to jump
- Tab context menu: open in new tab, rename, duplicate session, split right/down, close tab / others / to the right
- **Restore last session** on startup, or open a blank tab, or open the session picker
- **Auto-reconnect** with configurable retries and delay; `Ctrl+R` to reconnect a dropped pane manually
- The active pane is outlined when a tab holds more than one

### ⌨️ Command Palette & Keybindings

`Ctrl+P` opens a fuzzy palette over every saved session plus quick actions (new SSH session, new local shell, split, toggle sidebar, open SFTP, key vault, broadcast, settings, import/export).

All 21 shortcuts below are **rebindable** in Settings → Keyboard (click a row, press the combo). Overrides are stored as JSON.

| Action | Default | Action | Default |
|---|---|---|---|
| New tab (local shell) | `Ctrl+T` | Toggle SFTP panel | `Ctrl+Shift+F` |
| New SSH session | `Ctrl+Shift+N` | Toggle broadcast | `Ctrl+Shift+B` |
| Close tab | `Ctrl+W` | Increase font size | `Ctrl+=` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` | Decrease font size | `Ctrl+-` |
| Split right | `Ctrl+Shift+D` | Reset font size | `Ctrl+0` |
| Split down | `Ctrl+Shift+E` | Clear terminal | `Ctrl+L` |
| Toggle sidebar | `Ctrl+B` | Disconnect | `Ctrl+Shift+Q` |
| Command palette | `Ctrl+P` | Toggle recording | `Ctrl+Shift+R` |
| Find in terminal | `Ctrl+F` | Open key vault | `Ctrl+Shift+K` |
| Open settings | `Ctrl+,` | Full screen | `F11` |

`Ctrl+1`…`Ctrl+9` (jump to tab) and `Ctrl+R` (reconnect) are fixed.

### 📁 Sessions

- Unlimited sessions organised into **nested group folders**; drag a session onto a group to move it
- **Fuzzy search** across name, host, and tags
- Sort by **A–Z**, **last connected**, or **protocol**
- **Duplicate** a session in one click
- Metadata: name, protocol, host, port, username, tags, notes, environment variables, startup commands
- Right-click a session: Connect · Edit · Duplicate · Tunnels… · Connection log · Copy host · Delete
- **Last connected** timestamps

### 🔐 SSH Key Vault

- Private keys encrypted at rest with **AES-256-GCM**
- **Generate** ed25519, RSA 4096, or ECDSA 521 keys in-app, with an optional passphrase (`aes256-cbc`)
- **Import** PEM / OpenSSH private keys by file picker or paste
- **Scan `~/.ssh`** to batch-import local keys (passphrase-protected keys are skipped — they can't be fingerprinted unattended)
- **Deploy a public key** to any saved SSH session — the `ssh-copy-id` equivalent
- Copy public key, export private key, delete
- `SHA256:` fingerprints and a "used by *N* sessions" count

### 🛡️ Host Key Verification

Host keys are pinned in a `known_hosts` table (SQLite, not the OpenSSH file). Three modes via `ssh.hostKeyStrictness`:

- **prompt** (default) — unknown keys raise a dialog showing the fingerprint
- **auto-accept** — pin silently on first sight
- **strict** — refuse to connect to an unknown host

A **changed** host key always raises a warning dialog showing both the stored and the offered fingerprint, in every mode.

### 🔒 Vault & Security

- **Keychain mode** (default) — a random 256-bit key is generated on first run and kept in your OS credential store (Windows Credential Manager, Linux Secret Service). The vault is always unlocked.
- **Master-password mode** — the key is derived with **PBKDF2 (100,000 iterations, SHA-512)** and never written anywhere. Setting, changing, or removing the master password re-encrypts every stored secret in a single transaction.
- Encrypted at rest: SSH passwords, key passphrases, VNC passwords, and private keys. Blobs are `[IV | GCM tag | ciphertext]` with a fresh random IV per encryption.
- **Auto-lock** on idle (0–1440 min) and on system sleep — *master-password mode only*
- **Clipboard auto-clear** after 0–600 s, and only if the clipboard still holds what Ternix copied

> See [Security Notes](#-security-notes) for exactly where the key lives in each mode. It matters.

### 🌐 SFTP File Manager

- Stacked **local** and **remote** panes, each with its own scroller; the whole panel is resizable by a drag handle
- Browse, upload, download, mkdir, rename, delete (recursive on remote directories), `chmod`
- Columns for permissions and owner/group, parsed from the server's long listing
- **Sort** by default (server order), name, or date modified — re-picking the active sort returns to server order
- Toggle hidden files, editable path bar, up/refresh
- **Multi-select** with `Ctrl`/`Cmd`-click, `Shift`-click ranges, and `Ctrl+A`
- **Drag and drop** between panes — *and* from your desktop / Explorer / Finder straight onto the remote pane to upload
- Dropping a **folder** uploads it recursively
- Double-click a remote file to download and open it locally
- Visual **`chmod` editor** — a 3×3 permission grid tied to a live octal field
- Name-collision policy: prompt, overwrite, skip, or auto-rename

### 📊 Transfers

- Live **progress, speed, and ETA** per file
- **Pause**, **resume**, and **cancel any individual file** — cancelling one file in a 30-file folder transfer lets the other 29 finish
- Cancelling removes the partially-written file (local for downloads, remote for uploads) so a half-file is never mistaken for a real one
- Configurable **parallelism** (`transfer.maxConcurrent`, default 3), applied across an entire folder tree rather than per-directory
- Optional **timestamp preservation**
- Transfers move in ~254 KiB chunks — the maximum a single SFTP request allows

### 🚇 SSH Port Forwarding

- **Local (`-L`)**, **Remote (`-R`)**, and **Dynamic (`-D`, SOCKS5)** tunnels, saved per session
- **Auto-start** on session connect
- Live bytes-transferred counter, status dot, copy address, stop, restart

### 📝 Command Snippets

- Reusable commands with name, description, and tags
- **`${VAR}` interpolation** — each unique variable prompts once at run time
- Multi-line snippets run **line by line**, each gated on the shell prompt returning, so long commands don't eat the next line as type-ahead
- **Global** snippets appear everywhere; unchecking "Global" scopes a snippet to the session that owns it
- Fuzzy search; JSON import/export

### 📼 Session Recording

- Records terminal output as **asciinema v2 (`.cast`)**
- Built-in player: play/pause, restart, and a **scrubbable timeline** (idle gaps compressed to 2 s)
- **Auto-record** every session, optionally
- Storage cap that prunes the oldest recordings; export any `.cast`

### 📈 System Monitor

A live dashboard for the machine you're connected to — **local or remote over SSH** — polled every 3 seconds:

- CPU % with a heat-coloured sparkline, load averages, process count, and top process
- Memory and swap
- Per-mount disk usage
- Network RX/TX sparklines (bytes/sec)
- Uptime and temperature sensors

Remote stats are gathered by a small `/proc` probe over the SSH connection. While a session is still handshaking the panel says so rather than quietly showing your **local** machine's numbers.

### 📋 Connection Log & Global Search

- Every connect/disconnect is logged with host, timestamp, duration, and disconnect reason (last 500)
- **Global Search** view queries sessions and snippets together

### 🔄 Import / Export

**Import** from 7 formats — Ternix JSON backup, OpenSSH `config`, PuTTY `.reg`, WinSCP `.ini`, MobaXterm `.mxtsessions`, Tabby `config.yaml`, and generic CSV.

**Export** to 5 — Ternix JSON, CSV, OpenSSH `config`, MobaXterm, Tabby. *(PuTTY and WinSCP are import-only.)*

**Smart key auto-linking** — `IdentityFile` and other key paths are resolved against the vault by **fingerprint first, then filename**. Keys found on disk are imported automatically; keys that can't be located are recorded in the session's notes so nothing silently breaks. Duplicate sessions (same name + protocol + host + user) are skipped.

Exporting a backup *with private keys* requires the master password, when one is set.

### 🎨 Themes & Appearance

**12 built-in themes:** Default Dark · Default Light · Dracula · Nord · Solarized Dark · Solarized Light · Tokyo Night · Gruvbox Dark · Monokai · One Dark Pro · Catppuccin Mocha · Catppuccin Latte

- **Theme builder** — edit background, foreground, cursor, selection, UI accent/surface/border, and all **16 ANSI colours**, with a live preview. Import/export themes as JSON.
- Font family, size, ligatures, line height, letter spacing
- Cursor style (block/underline/bar) with optional blink
- Custom CSS injection, optional status-bar clock, compact mode

### ⚙️ Settings

<details>
<summary><strong>Every setting key and its default</strong></summary>

| Section | Key | Default |
|---|---|---|
| General | `general.defaultShell` | *(empty)* |
| General | `general.startupBehavior` | `blank` (blank / reopen / picker) |
| General | `general.newTabProtocol` | `local` |
| General | `general.confirmCloseActive` | `true` |
| General | `general.autoReconnect` | `false` |
| General | `general.autoReconnectRetries` | `3` |
| General | `general.autoReconnectDelay` | `3` |
| Terminal | `terminal.scrollback` | `5000` |
| Terminal | `terminal.bell` | `none` (none / visual / audio) |
| Terminal | `terminal.wordSeparators` | `` ()[]{}'"` `` |
| Terminal | `terminal.copyOnSelect` | `false` |
| Terminal | `terminal.pasteOnMiddleClick` | `true` |
| Terminal | `terminal.pasteConfirmMultiline` | `true` |
| Terminal | `terminal.trimPasteWhitespace` | `false` |
| Terminal | `terminal.rightClick` | `menu` (menu / paste) |
| Appearance | `appearance.theme` | `dark-default` |
| Appearance | `appearance.fontFamily` | JetBrains Mono, Fira Code, … |
| Appearance | `appearance.fontSize` | `14` |
| Appearance | `appearance.ligatures` | `false` |
| Appearance | `appearance.lineHeight` | `1.2` |
| Appearance | `appearance.letterSpacing` | `0` |
| Appearance | `appearance.cursorStyle` | `block` |
| Appearance | `appearance.cursorBlink` | `true` |
| Appearance | `appearance.compactMode` | `false` |
| Appearance | `appearance.showClock` | `false` |
| Appearance | `appearance.customCss` | *(empty)* |
| SSH | `ssh.defaultPort` | `22` |
| SSH | `ssh.defaultUsername` | *(empty)* |
| SSH | `ssh.agentSock` | *(empty)* |
| SSH | `ssh.hostKeyStrictness` | `prompt` (strict / prompt / auto-accept) |
| SSH | `ssh.connectTimeout` | `20000` ms |
| SSH | `ssh.showBanner` | `true` |
| Security | `security.vaultLockTimeout` | `0` min (0 = never) |
| Security | `security.lockOnSleep` | `false` |
| Security | `security.clearClipboard` | `0` s (0 = never) |
| Transfers | `transfer.downloadDir` | *(empty → local pane's dir)* |
| Transfers | `transfer.conflict` | `prompt` (prompt / overwrite / skip / rename) |
| Transfers | `transfer.maxConcurrent` | `3` |
| Transfers | `transfer.preserveTimestamps` | `true` |
| Recording | `recording.autoRecord` | `false` |
| Recording | `recording.maxStorageMb` | `0` (0 = unlimited) |
| Updates | `updates.autoCheck` | `true` |
| Updates | `updates.channel` | `stable` |
| Advanced | `rdp.guacdHost` | `127.0.0.1` |
| Advanced | `rdp.guacdPort` | `4822` |
| Advanced | `advanced.hardwareAcceleration` | `true` |
| Advanced | `advanced.rendererType` | `webgl` (webgl / canvas) |
| Advanced | `advanced.debugLogLevel` | `info` |

</details>

### 🔃 Auto-Update

Powered by `electron-updater` against GitHub Releases. Ternix checks on startup (when enabled) and surfaces a toast with a **View** button that jumps straight to Settings → Updates, where you can download with a live progress bar and restart to install.

The **Beta** channel opts you into GitHub pre-releases; **Stable** offers only full releases. The choice takes effect on the next check — no restart needed. Updates only work in packaged builds.

---

## 🏗️ Architecture

```
ternix/
├── electron/                    # Main process (Node.js / Electron)
│   ├── main.ts                  # Window, CSP, power monitor, navigation lockdown
│   ├── preload.ts               # Context-isolated IPC bridge (TernixApi)
│   ├── db/
│   │   ├── schema.ts            # SQLite schema (WAL, foreign keys on)
│   │   ├── migrations/          # user_version-based forward migrations
│   │   ├── repo.ts              # Repository layer
│   │   └── snippetScope.ts      # Global vs session-scoped snippet invariant
│   ├── ipc/                     # 20 IPC namespaces, {ok,data}/{ok,error} envelope
│   └── services/
│       ├── SshService.ts        # SSH2 client: jump chains, host-key pinning, MFA
│       ├── SftpService.ts       # SFTP ops + chunked transfers, pause/cancel
│       ├── TelnetService.ts     # Telnet with IAC option negotiation
│       ├── SerialService.ts     # serialport (lazy-loaded)
│       ├── PtyService.ts        # Local PTY (node-pty)
│       ├── RdpGatewayService.ts # guacd gateway (guacamole-lite)
│       ├── VncBridgeService.ts  # Token-gated loopback WebSocket↔TCP bridge
│       ├── NativeClientService.ts # mstsc / xfreerdp / vncviewer fallbacks
│       ├── TunnelService.ts     # -L / -R / -D (SOCKS5)
│       ├── RecordingService.ts  # asciinema v2 + storage cap
│       ├── KeyService.ts        # Key vault: generate, import, deploy
│       ├── CryptoService.ts     # AES-256-GCM vault + PBKDF2
│       ├── ImportExportService.ts # 7 import / 5 export formats
│       ├── ConnectionManager.ts # Active connection registry, OSC 7 cwd tracking
│       └── DatabaseService.ts   # SQLite lifecycle
│
├── src/                         # Renderer process (React + TypeScript)
│   ├── components/
│   │   ├── layout/              # RootLayout, ActivityBar, Sidebar, TabBar, StatusBar,
│   │   │                        #   TitleBar, CommandPalette, Toast, StatsPoller
│   │   ├── terminal/            # TerminalArea, TerminalPane, SplitLayout, BroadcastBar,
│   │   │                        #   TerminalSearch, TerminalToolbar, RemoteDesktopPane
│   │   ├── sidebar/             # SessionTree, GroupFolder, SessionCard, SnippetsPanel,
│   │   │                        #   TunnelsPanel, RecordingsPanel, StatsPanel,
│   │   │                        #   SearchPanel, SftpSidebar, TransferQueue
│   │   ├── sftp/                # SftpPanel, FileList, FileRow, PermissionsEditor
│   │   ├── settings/            # SettingsPanel + 9 sections
│   │   ├── dialogs/             # NewSession, KeyVault, Tunnel, ExportImport,
│   │   │                        #   RecordingPlayer, ThemeEditor, Snippet, ConnectionLog
│   │   └── ui/                  # Modal, ContextMenu
│   ├── store/                   # Zustand: tabs, sessions, settings, theme, sftp,
│   │                            #   transfers, stats, ui
│   ├── hooks/                   # useTerminal, useSftp, useKeyboard, useTheme, useSsh
│   ├── themes/                  # 12 built-in themes
│   └── utils/                   # fuzzy, path, sftpSort, statsTarget, snippets, format*
│
├── electron-builder.json        # AppImage + deb (Linux), NSIS + portable (Windows)
└── electron.vite.config.ts
```

### Key technical decisions

- **`better-sqlite3`**, synchronous, in the main process — no races on credential storage. WAL journal, foreign keys on, `user_version` migrations applied in a transaction.
- **`ssh2`** for the full protocol: multi-hop jump hosts, the SFTP subsystem, exec channels, and the latency probe.
- **SFTP transfers use ~254 KiB chunks** (`OPENSSH_MAX_PKT_LEN − PKT_RW_OVERHEAD`). ssh2's SFTP streams issue one request and wait for the reply, so on a high-latency link the chunk size *is* the throughput.
- **`node-pty`** for local shells with real signal handling; **`serialport`** loaded lazily so the app still boots if its native build failed.
- **AES-256-GCM** with a random IV per encryption; blobs stored as `[IV | tag | ciphertext]`.
- **Zustand** for state — the transfer queue subscribes per row, so a progress tick re-renders one row rather than the whole list.
- **The renderer never touches Node.** Everything goes through one typed `contextBridge` surface; each IPC call returns an `{ok, data}` / `{ok, error}` envelope and pings the vault idle timer.
- **Nothing blocks the main process.** System-stats collection is async with TTL caches, because Electron routes your input events through that process.

---

## 🚀 Installation

### Windows
Download the `.exe` installer or the portable build from [Releases](https://github.com/PraneethReddy-github/ternix/releases).

### Linux
Download the `.AppImage` or `.deb` from [Releases](https://github.com/PraneethReddy-github/ternix/releases).

For **embedded RDP**, install `guacd` (the `.deb` declares it as a dependency). Without it, RDP falls back to a native client.

---

## 🛠️ Building from Source

### Prerequisites

- **Node.js 20+** (CI builds on 22)
- Native modules compile via node-gyp, so you need a toolchain:
  - **Linux:** `libsecret-1-dev` (keytar), `libudev-dev` (serialport); `rpm` and `libarchive-tools` to package
  - **Windows:** Python with `setuptools` (the distutils shim node-gyp needs on Python 3.12+)

### Install & run

```bash
git clone https://github.com/PraneethReddy-github/ternix.git
cd ternix
npm install
npm run dev
```

### Rebuild native modules

If you hit native module errors (`node-pty`, `better-sqlite3`, `serialport`, `keytar`):

```bash
npm run rebuild
```

### Build for distribution

```bash
npm run build:linux   # AppImage + .deb   → dist-electron/linux
npm run build:win     # NSIS + portable   → dist-electron/win
```

---

## 🧪 Development

```bash
npm run typecheck     # tsc across renderer + main
npm run lint          # eslint over .ts / .tsx
```

Ternix has no test framework. Instead, non-trivial pure logic keeps a **runnable self-check** beside it — plain `assert`, no fixtures. Run them with Node's type stripping:

```bash
node --experimental-strip-types electron/db/snippetScope.check.ts
node --experimental-strip-types electron/services/sftpOwner.check.ts
node --experimental-strip-types electron/services/transferOutcome.check.ts
node --experimental-strip-types electron/services/vaultKeyPlan.check.ts
node --experimental-strip-types src/utils/sftpSort.check.ts
node --experimental-strip-types src/utils/statsTarget.check.ts
```

---

## 🔒 Security Notes

Ternix keeps every credential on your machine. Here is precisely how.

### What is encrypted

SSH passwords, key passphrases, VNC passwords, and stored private keys are encrypted with **AES-256-GCM**. Each blob is laid out as `[12-byte IV | 16-byte auth tag | ciphertext]` with a fresh random IV per encryption, so identical secrets never produce identical ciphertext, and any tampering fails the GCM tag check on decrypt.

Hosts, usernames, ports, notes, tags, and snippet commands are **not** encrypted — they are ordinary columns in the SQLite database.

### Where the vault key lives

Everything above is encrypted with one 256-bit **vault key**. There are two modes.

**Keychain mode (default).** The key is generated on first run and stored in your operating system's credential store:

| Platform | Backing store |
|---|---|
| Windows | Credential Manager |
| Linux | Secret Service (libsecret / GNOME Keyring / KWallet) |

Ternix writes the key, then **reads it back and compares** before trusting the store. On every launch the key is read from the keychain — it is not kept on disk.

If the machine has no credential store at all (a headless Linux box without libsecret, or a failed `keytar` build), Ternix falls back to a `0600` key file at `<userData>/.vaultkey`. That fallback is the only situation in which the key touches the filesystem, and in that case the file protects the vault exactly as well as your user account does.

**Master-password mode.** The key is derived from your password with **PBKDF2 (100,000 iterations, SHA-512)** against a stored random salt, and is never written anywhere — not the keychain, not the disk. It exists only in memory while the vault is unlocked. Switching modes re-encrypts every stored secret in a single database transaction, and old keys are zeroed in memory afterwards.

Your password itself is never stored. It is verified by decrypting a known verifier string: the wrong password fails the GCM auth tag.

### Locking

Master-password mode locks the vault on an idle timeout and on system sleep, zeroing the key. **Keychain mode is always unlocked** — the key is available whenever the app runs, so the idle and sleep settings do nothing there. Choose master-password mode if you want a vault that actually locks.

### Other notes

- Exporting a private key prompts for the master password **only when one is set**.
- **Host keys** are pinned on first use; a changed key always raises a warning showing both the stored and the offered fingerprint.
- **Embedded RDP does not validate server certificates** (`ignore-cert`). Treat in-pane RDP as protected by the network path, not by TLS identity.
- The renderer never touches Node: `contextIsolation` is on, `nodeIntegration` is off, `webviewTag` is off, in-app navigation is blocked, `window.open` is denied, and a Content-Security-Policy is injected on every response.
- Clipboard entries copied by Ternix can auto-clear after a timeout, and only if the clipboard still holds what Ternix put there.

---

## ⚠️ Known Limitations

Documented so you don't discover them the hard way:

- **Split panes share space equally**; there are no draggable dividers between them.
- **Compact mode** only hides the per-pane toolbar.
- **Per-session terminal encoding** is stored but not applied — SSH is UTF-8, Telnet and Serial are byte-transparent.
- **X11 forwarding**, `server_alive_interval`, and RDP colour-depth/fullscreen are exposed in the session editor but not yet wired to the connection.
- **Agent forwarding** only takes effect when the session's auth type is *agent*.
- Session, group, and tab **accent colours** exist in the data model but no UI sets them yet.
- Accepting a **changed host key** does not overwrite the stored pin, so you'll be asked again next connect.
- **Embedded RDP is Linux only**; Windows always uses `mstsc`.
- `~/.ssh` scanning **skips passphrase-protected keys** (they can't be fingerprinted without the passphrase).
- **macOS is not supported.** It has never been tested, nothing is built or released for it, and no macOS artifacts exist.

---

## 📦 Core Dependencies

| Package | Purpose |
|---|---|
| `@xterm/xterm` + addons (fit, search, web-links, webgl, unicode11) | Terminal emulator |
| `ssh2` | SSH2 protocol client + SFTP |
| `node-pty` | Local shell PTY |
| `serialport` | Serial / COM |
| `better-sqlite3` | Synchronous SQLite |
| `keytar` | OS keychain (optional) |
| `guacamole-lite` + `guacamole-common-js` | Embedded RDP via guacd |
| `@novnc/novnc` + `ws` | Embedded VNC over a loopback bridge |
| `js-yaml` | Tabby YAML import/export |
| `react` + `react-dom` + `zustand` | UI and state |
| `lucide-react` | Icons |
| `electron-updater` *(optional)* | Auto-update against GitHub Releases |

---

## 🤝 Contributing

Contributions are welcome — please open an issue first to discuss substantial changes.

1. Fork the repository
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Run `npm run typecheck` and the relevant `*.check.ts` self-checks
4. Commit (`git commit -m 'feat: add amazing feature'`)
5. Open a Pull Request

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <p>Built with ❤️ using Electron, React, and xterm.js</p>
  <p><strong>>T&lt;</strong></p>
</div>

