/** POSIX-style path helpers for remote (SFTP) paths and breadcrumbs. */

export function posixJoin(dir: string, name: string): string {
  if (!dir || dir === '/') return '/' + name
  return dir.replace(/\/$/, '') + '/' + name
}

export function posixDirname(p: string): string {
  if (!p || p === '/') return '/'
  const trimmed = p.replace(/\/$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx <= 0 ? '/' : trimmed.slice(0, idx)
}

export function basename(p: string): string {
  return p.replace(/\/$/, '').split('/').pop() ?? p
}

/** Local path join that respects the host separator (best-effort; backend normalizes). */
export function localJoin(dir: string, name: string, sep = '/'): string {
  const useSep = dir.includes('\\') ? '\\' : sep
  return dir.replace(/[/\\]$/, '') + useSep + name
}
