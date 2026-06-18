<div align="center">
  <h1>
    <pre>>T<</pre>
  </h1>
  <h1>Ternix</h1>
  <p><strong>One terminal. Everything.</strong></p>
  <p>A modern, cross-platform SSH & remote session manager built with Electron, React, and xterm.js.</p>

  <p>
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg" />
    <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-green.svg" />
    <img alt="Platform" src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron" />
    <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" />
  </p>
</div>

---

## 🌟 Overview

**Ternix** is a feature-rich, privacy-first desktop terminal application that handles every protocol you'll ever need — SSH, Telnet, Serial, and local shells — all from a single, beautifully designed interface. Built on Electron + React + xterm.js, it ships as a native app on Linux (AppImage/deb), macOS (dmg), and Windows (NSIS installer).

Unlike cloud-based session managers, Ternix stores **everything locally** in a SQLite database with AES-256-GCM encrypted credentials. Your SSH keys and passwords never leave your machine.

---

## ✨ Features

### 🔌 Multi-Protocol Terminal Engine

| Protocol | Details |
|---|---|
| **SSH** | Full SSH2 client with key-based auth, password auth, SSH agent forwarding, keyboard-interactive, jump-host chains (ProxyJump), banner display, and latency measurement |
| **Telnet** | RFC 854-compliant Telnet with full IAC option negotiation (NAWS, terminal-type, suppress-GA, echo), auto-login on prompt detection |
| **Serial / COM** | Native `serialport` integration supporting full serial config: baud rate (300–921600), data bits, stop bits, parity (none/even/odd/mark/space), flow control (RTS/CTS, XON/XOFF) |
| **Local Shell** | Native PTY shell sessions using `node-pty` with full POSIX shell support |
| **RDP / VNC** | Session metadata saved for future viewer binary integration (Phase 4) |

### 🖥️ Terminal Features

- **xterm.js v5** rendering engine with **WebGL** acceleration
- Up to **4 split panes** per tab with resizable dividers (horizontal and vertical)
- **In-terminal search** with next/previous navigation and highlight
- **Context menu** — Copy, Paste, Select All, Copy as HTML, Find, Clear, Reset
- Right-click configurable: context menu or instant paste
- **Trim paste whitespace** and **multiline paste confirmation** settings
- **Broadcast mode** — type once, send to all selected terminal panes simultaneously
- Real-time **cols × rows** display in the status bar
- Per-pane toolbar with quick actions
- **Compact mode** for a cleaner, minimal UI
- WebLinks addon — clickable URLs in the terminal output

### 📁 Session Management

- Unlimited sessions with **nested group folders** (drag-and-drop between groups)
- **Fuzzy search** across session name, host, and tags
- Sort sessions by **A–Z**, **last connected**, or **protocol**
- Per-session **tab accent colors** for visual distinction
- **Duplicate** sessions in one click
- Session metadata: name, protocol, host, port, username, tags, notes, env vars
- **Startup commands** — run scripts automatically when a shell opens
- **Last connected** timestamp tracking
- Full **context menu** on right-click: Connect, Split, Open SFTP, Edit, Duplicate, Tunnels, Connection Log, Copy Host, Delete

### 🔐 SSH Key Vault

- Encrypted private key storage using **AES-256-GCM** with PBKDF2-SHA512 key derivation
- Generate **ed25519**, **RSA 4096**, or **ECDSA 521** keys directly within the app
- Import existing PEM / OpenSSH format private keys by file browser or paste
- **Auto-scan `~/.ssh`** to batch-import all local private keys
- Copy public key to clipboard with one click
- **`ssh-copy-id` equivalent** — deploy a public key to any saved SSH session directly
- Export private key back to disk (with master password confirmation)
- Key fingerprint display (SHA-256) with usage tracking ("used by N sessions")
- Optional **passphrase** protection on generated and imported keys

### 🔒 Security & Vault

- **Dual-mode vault**:
  - **Keychain mode** (default): random 256-bit key stored in OS keychain (`keytar`) or a `0600` key file fallback — always unlocked
  - **Master password mode**: key derived via PBKDF2 (100,000 iterations, SHA-512) — vault locks after idle timeout or system sleep
- All credentials encrypted at rest: SSH passwords, key passphrases, VNC passwords
- **Auto-lock** on system suspend/sleep (configurable)
- **Idle timeout** lock (configurable 1–1440 minutes)
- **Clear clipboard** after N seconds
- CSP (Content Security Policy) headers enforced in the renderer process
- Strict `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

### 🌐 SFTP File Manager

- Dual-pane file browser: **local ↔ remote** simultaneously
- Full remote filesystem operations: browse, upload, download, mkdir, rename, delete
- **Drag-and-drop** transfers between local and remote panes
- Right-click context menu on files and directories
- **`chmod` permissions editor** — visual Unix permission bits editor
- **Transfer progress** with real-time speed (bytes/sec) and ETA
- **Pause, Resume, Cancel** individual transfers
- Resizable SFTP panel with a drag handle

### 🚇 SSH Port Forwarding (Tunnels)

- Per-session tunnel configurations saved to the database
- Three tunnel types:
  - **Local (-L)**: forward a local port to a remote host
  - **Remote (-R)**: expose a local port on the SSH server
  - **Dynamic (-D)**: SOCKS5 proxy for tunneling arbitrary traffic
- **Auto-start** option — tunnel activates automatically when the session connects
- Live bytes-transferred counter
- Start/stop tunnels without disconnecting the session

### 📝 Command Snippets

- Create and manage reusable command snippets with name, command, description, and tags
- **Variable interpolation** — `${VAR}` placeholders prompt for values at run time
- Send any snippet to the active terminal with one click
- Fuzzy search across name, description, and tags
- Export/import snippets as JSON

### 📼 Session Recordings

- Record terminal output in **asciinema v2 (`.cast`)** format
- Built-in **recording player** with timeline scrubbing, play/pause, and restart
- Configurable storage cap — auto-prune oldest recordings when limit is exceeded
- Recordings linked to sessions for organized history

### 📋 Connection Logs

- Per-session connection log: timestamps, connection/disconnection events, errors
- View the full log from the session context menu

### 🔄 Import / Export

Import from:
- **Ternix JSON** backup (full fidelity, optionally includes private keys)
- **OpenSSH config** (`~/.ssh/config`)
- **PuTTY** `.reg` export
- **WinSCP** `.ini`
- **MobaXterm** `.mxtsessions`
- **Tabby** `config.yaml`
- **CSV** (generic, with header row)

Export to:
- **Ternix JSON** backup (optionally includes encrypted private keys)
- **CSV**
- **OpenSSH config**
- **MobaXterm** `.mxtsessions`
- **Tabby** `config.yaml`

**Smart key auto-linking** — when importing from third-party formats, Ternix automatically resolves `IdentityFile` / key paths to matching keys already in the vault.

### 🎨 Themes & Appearance

**13 built-in themes:**
- Dark Default
- Light Default
- Dracula
- One Dark Pro
- Tokyo Night
- Nord
- Monokai
- Gruvbox Dark
- Catppuccin Mocha
- Catppuccin Latte
- Solarized Dark
- Solarized Light
- (and more)

**Full customization:**
- **Custom theme editor** — edit any built-in theme or create new ones from scratch
- Font family, font size, ligatures, line height, letter spacing
- Cursor style (block, underline, bar) with optional blinking
- Window transparency
- Compact mode
- Custom CSS injection
- Clock in the status bar
- Per-session tab accent colors

### ⌨️ Keyboard & Settings

- Full **custom keybinding** configuration
- Configurable startup behavior: blank tab or last session
- SSH: connect timeout, keepalive interval/count, host-key strictness (`auto-accept`, `prompt`, `strict`), SSH agent socket
- Terminal: encoding (UTF-8, ISO-8859-1, Windows-1252, GBK, Shift_JIS), scroll-back lines, right-click behavior
- **Auto-updater** integration via `electron-updater`

---

## 🏗️ Architecture

```
ternix/
├── electron/               # Main process (Node.js / Electron)
│   ├── main.ts             # App entry, window creation, CSP, power monitor
│   ├── preload.ts          # Context-isolated IPC bridge (TernixApi)
│   ├── db/
│   │   ├── schema.ts       # SQLite schema (better-sqlite3)
│   │   └── repo.ts         # Repository layer (sessions, groups, keys, etc.)
│   ├── ipc/                # IPC handler registrations
│   └── services/
│       ├── SshService.ts       # Full SSH2 client (chains, host-key pinning, KBI)
│       ├── SftpService.ts      # SFTP file operations + streaming transfers
│       ├── TelnetService.ts    # RFC 854 Telnet with IAC negotiation
│       ├── SerialService.ts    # Native serialport integration
│       ├── PtyService.ts       # Local PTY (node-pty)
│       ├── TunnelService.ts    # SSH port-forwarding (local/remote/SOCKS5)
│       ├── RecordingService.ts # asciinema v2 recording + storage cap
│       ├── KeyService.ts       # SSH key vault (generate, import, deploy)
│       ├── CryptoService.ts    # AES-256-GCM vault + PBKDF2 master password
│       ├── ImportExportService.ts # Parse/generate 7 session formats
│       ├── ConnectionManager.ts # Active connection registry
│       └── DatabaseService.ts  # SQLite database lifecycle
│
├── src/                    # Renderer process (React + TypeScript)
│   ├── App.tsx             # Root component — initializes stores
│   ├── components/
│   │   ├── layout/         # RootLayout, Sidebar, TitleBar, StatusBar
│   │   ├── terminal/       # TerminalArea, TerminalPane, SplitLayout, BroadcastBar, TerminalSearch, TerminalToolbar
│   │   ├── sidebar/        # SessionTree, GroupFolder, SessionCard, SnippetsPanel, RecordingsPanel, TunnelsPanel, SearchPanel, SftpSidebar, TransferQueue
│   │   ├── sftp/           # SftpPanel, FileList, FileRow, PermissionsEditor, TransferProgressBar
│   │   ├── settings/       # SettingsPanel + 9 settings sections
│   │   ├── dialogs/        # NewSessionDialog, KeyVaultDialog, TunnelDialog, ExportImportDialog, RecordingPlayer, ThemeEditorDialog, SnippetDialog, ConfirmDialog, PromptDialog, ConnectionLogDialog
│   │   └── ui/             # Modal, ContextMenu, and reusable primitives
│   ├── store/              # Zustand state management
│   │   ├── useTabStore.ts      # Terminal tabs, panes, split state
│   │   ├── useSessionStore.ts  # Sessions + groups CRUD
│   │   ├── useThemeStore.ts    # Active theme, custom themes
│   │   ├── useSettingsStore.ts # App-wide settings key-value store
│   │   ├── useTransferStore.ts # SFTP transfer progress subscriptions
│   │   └── useUiStore.ts       # Dialog state, notifications, view switching
│   ├── hooks/              # useTerminal, useSftp, terminalRegistry
│   ├── themes/             # 13 built-in xterm.js themes
│   └── utils/              # fuzzy filter, path utils, formatDuration, cn
│
├── electron-builder.json   # Build targets: AppImage+deb (Linux), dmg+zip (macOS), NSIS+portable (Windows)
├── electron.vite.config.ts # electron-vite build config
├── package.json
└── tsconfig.json
```

### Key Technical Decisions

- **`better-sqlite3`** for synchronous SQLite access in the main process — zero race conditions for credential storage
- **`ssh2`** library for full SSH2 protocol: multi-hop jump hosts, SFTP subsystem, exec channels, and latency ping
- **`node-pty`** for local shell PTY with proper POSIX signals
- **`serialport`** loaded lazily — app boots even if native build failed
- **`keytar`** for OS keychain integration (libsecret on Linux, Keychain on macOS, Credential Manager on Windows)
- **AES-256-GCM** encryption with random IVs and auth tags — all credential blobs stored as `[IV | TAG | CIPHERTEXT]`
- **Zustand** for lightweight, hook-friendly global state without Redux boilerplate
- **Vite + electron-vite** for fast HMR in development
- **Context isolation + no `nodeIntegration`** — renderer is sandboxed, all native access goes through the typed `TernixApi` bridge

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** 10+
- Linux: `libsecret-1-dev` (for keytar / OS keychain)

### Install & Run

```bash
git clone https://github.com/PraneethReddy-github/ternix.git
cd ternix
npm install
npm run dev
```

### Rebuild Native Modules

If you see native module errors (`node-pty`, `better-sqlite3`, `serialport`, `keytar`):

```bash
npm run rebuild
```

### Build for Distribution

```bash
# Linux (AppImage + .deb)
npm run build:linux

# macOS (.dmg + .zip)
npm run build:mac

# Windows (NSIS installer + portable .exe)
npm run build:win
```

Outputs land in `dist-electron/linux`, `dist-electron/mac`, or `dist-electron/win` respectively.

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `@xterm/xterm` | Terminal emulator engine |
| `@xterm/addon-fit` | Auto-fit terminal to container |
| `@xterm/addon-search` | In-terminal search |
| `@xterm/addon-web-links` | Clickable URLs |
| `@xterm/addon-webgl` | GPU-accelerated rendering |
| `@xterm/addon-unicode11` | Unicode 11 character width |
| `better-sqlite3` | Synchronous SQLite (session DB) |
| `ssh2` | SSH2 protocol client |
| `node-pty` | Pseudo-terminal for local shells |
| `serialport` | Serial port communication |
| `keytar` | OS keychain integration |
| `js-yaml` | YAML parsing for Tabby import/export |
| `lucide-react` | Icon library |
| `react` + `react-dom` | UI framework |
| `zustand` | State management |
| `electron-updater` | Auto-update support |

---

## 🔒 Security Notes

- All credentials (SSH passwords, key passphrases, VNC passwords) are encrypted with **AES-256-GCM** before being stored in SQLite
- In keychain mode, the encryption key lives in the OS keychain — nothing sensitive is stored in plaintext on disk
- In master-password mode, the key is derived via **PBKDF2** (100,000 iterations, SHA-512) and never persisted; the vault auto-locks after idle or sleep
- The renderer process runs in a **sandboxed context** — no direct Node.js or Electron API access; everything is mediated through the typed IPC bridge
- Navigation and external window opens are blocked at the `webContents` level
- CSP headers restrict script sources in production builds

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <p>Built with ❤️ using Electron, React, and xterm.js</p>
  <p><strong>>T&lt;</strong></p>
</div>
