<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → Updates as "What's new". Short bullets only — this comment is not shown.
-->

**🎉 New Feature: Phone Access & Multi-Shell Support**
- **Your Terminal on Your Phone:** Scan a QR code in Ternix, and your phone opens a terminal right in its browser. You can launch your own sessions or mirror one already running on your desktop.
- **Connect Anywhere:** Works over your local Wi-Fi, or through a secure tunnel from anywhere in the world.
- **End-to-End Encrypted:** The pairing key travels in the QR code, never over the network. Every keystroke is sealed with a key only your two devices hold, keeping it completely hidden even from the tunnel that carries it.
- **Vault-Aware Security:** The locked desktop vault now securely blocks mobile access to any sessions that require stored passwords or SSH keys, ensuring secrets remain safe until unlocked locally.
- **Mobile UI Overhaul:** Complete redesign of the mobile access interface for a smoother connection experience.

**Features & Enhancements**
- **Shell Picker:** Right-clicking the **+** (New Tab) button now presents a menu of all detected local shell profiles—including WSL distributions, PowerShell, Git Bash, Command Prompt, bash, zsh, and fish.
- **VeNCrypt & TLS for VNC:** Built-in VNC viewer now supports VeNCrypt X.509 TLS security modes with interactive certificate validation prompts and dynamic credential prompts for ARD, VeNCrypt, and MS-Logon servers.
- **Terminal Fonts:** Added a new Font Picker in Appearance Settings featuring bundled developer fonts (JetBrains Mono, Fira Code, Cascadia Code, IBM Plex Mono) without relying on system fonts.
- **Live Terminal Settings:** Changes to font family, size, line height, and letter spacing now apply instantly to all active terminals without needing to reload or restart sessions.
- **Session Grouping:** Group collapse state in the sidebar is now persistently saved and survives tab switches and app restarts.
- **New Session Checks:** The New Session dialog now automatically checks for and prevents duplicate session names to avoid confusion.
- **Update Previews:** The in-app update checker now directly fetches and renders markdown release notes and publication details for installed and available releases.
- **UI Polish:** Improved split pane rendering to prevent half-pixel glyph blur, added font load remeasurement for terminals, and added smooth pop animations for menus.

**Security & Bug Fixes**
- **Update Checks:** Switched to a secure DOMParser to extract release notes safely, preventing potential markup injection vulnerabilities from GitHub release bodies.
- Fixed an issue with auto-updates on Windows by explicitly configuring a hyphenated artifact name for the NSIS installer.
