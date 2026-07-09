# App icons

- `icon.png` — 1024×1024 master icon. electron-builder generates the Windows `.ico`
  from it at pack time, so no `.ico` needs to be committed.
- `icons/` — pre-sized PNGs used for the Linux desktop entry.
- `icon.svg` — vector source.

Paths are wired up in `electron-builder.json`. During `npm run dev` the app runs fine
without any of these; they are only used for distributable builds.
