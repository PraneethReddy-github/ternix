/**
 * True when a value names a URL (has a `scheme://`) rather than a filesystem path.
 * URLs must open with shell.openExternal; shell.openPath is filesystem-only and
 * silently fails on a URL on Windows (Linux's xdg-open happens to tolerate both).
 */
export function isUrl(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(target)
}
