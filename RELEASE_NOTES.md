<!--
Edit this before tagging a release. It becomes the GitHub release body and is what users
see in Settings → Updates as "What's new". Short bullets only — this comment is not shown.
-->

**🎉 New Feature: Phone Access **
- **Your Terminal on Your Phone:** Scan a QR code in Ternix, and your phone opens a terminal right in its browser. You can launch your own sessions or mirror one already running on your desktop.
- **Connect Anywhere:** Works over your local Wi-Fi, or through a secure tunnel from anywhere in the world.
- **End-to-End Encrypted:** The pairing key travels in the QR code, never over the network. Every keystroke is sealed with a key only your two devices hold, keeping it completely hidden even from the tunnel that carries it.
- **Vault-Aware Security:** The locked desktop vault now securely blocks mobile access to any sessions that require stored passwords or SSH keys, ensuring secrets remain safe until unlocked locally.
- **Mobile UI Overhaul:** Complete redesign of the mobile access interface,for a smoother connection experience.

**Features & Enhancements**
- **Terminal Fonts:** Added a new Font Picker in Appearance Settings featuring bundled developer fonts (JetBrains Mono, Fira Code, Cascadia Code, IBM Plex Mono) without relying on system fonts.
- **Live Terminal Settings:** Changes to font family, size, line height, and letter spacing now apply instantly to all active terminals without needing to reload or restart sessions.
- **Session Grouping:** Group collapse state in the sidebar is now persistently saved and survives tab switches and app restarts.
- **New Session Checks:** The New Session dialog now automatically checks for and prevents duplicate session names to avoid confusion.
- **Update Previews:** The in-app update checker now directly shows the "What's new" release notes for the new version.
- **UI Polish:** Added a new smooth pop animation for dropdown menus and improved styling across settings controls like selects and toggles.
- **Local Shell Picker:** You can now choose a specific shell for individual local terminal sessions, rather than being forced to use the global default.

**Security & Bug Fixes**
- **Update Checks:** Switched to a secure DOMParser to extract release notes safely, preventing potential markup injection vulnerabilities from GitHub release bodies.
- Fixed an issue with auto-updates on Windows by explicitly configuring a hyphenated artifact name for the NSIS installer.
- **Unattended Connections:** Fixed an issue where phone-initiated connections could hang indefinitely when encountering interactive SSH prompts (like unknown host keys or keyboard-interactive logins); they now fail gracefully with instructions to complete the prompt on the desktop.
- **Terminal Rendering:** Fixed a cursor alignment bug where the cursor would overlap the prompt text upon first launch due to webfonts being measured before they finished loading.
- **File Transfers:** Fixed an issue where SFTP total transfer speeds would display incorrectly high numbers during concurrent transfers by accurately measuring aggregate SSH channel throughput instead.
