# App icons

Place the following platform icons here before packaging:

- `icon.png`  — 512×512 (Linux / generic)
- `icon.ico`  — Windows multi-resolution icon
- `icon.icns` — macOS icon bundle

electron-builder reads them via `electron-builder.json`. During `npm run dev`
the app runs fine without these; they are only required for distributable builds.
