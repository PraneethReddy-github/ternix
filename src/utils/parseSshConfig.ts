import type { SessionInput } from '@shared/index'

/**
 * Lightweight client-side parse of an OpenSSH config string into draft sessions.
 * (The authoritative import lives in the main process ImportExportService; this mirror
 * lets the UI preview entries before committing.)
 */
export function parseSshConfig(text: string): SessionInput[] {
  const sessions: SessionInput[] = []
  let current: SessionInput | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [kw, ...rest] = line.split(/\s+/)
    const value = rest.join(' ')
    const key = kw.toLowerCase()
    if (key === 'host') {
      if (current) sessions.push(current)
      current = value.includes('*') ? null : { name: value, protocol: 'ssh', host: value, port: 22, auth_type: 'agent' }
    } else if (current) {
      if (key === 'hostname') current.host = value
      else if (key === 'port') current.port = parseInt(value, 10)
      else if (key === 'user') current.username = value
      else if (key === 'identityfile') current.auth_type = 'key'
    }
  }
  if (current) sessions.push(current)
  return sessions
}
