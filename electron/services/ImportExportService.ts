import os from 'node:os'
import { join } from 'node:path'
import type { AuthType, ImportKeyRef, ImportResult, ImportSource, ExportTarget, SessionInput } from '@shared/index'
import { sessionsRepo, groupsRepo, snippetsRepo, tunnelsRepo, keysRepo } from '../db/repo'
import { KeyService } from './KeyService'
import jsyaml from 'js-yaml'

/** Parsing for foreign session formats and serialization of Ternix backups. */
class ImportExportServiceImpl {
  parse(source: ImportSource, payload: string): ImportResult {
    const result = this.parseSessions(source, payload)
    // Surface the distinct key files referenced so the UI can show their status
    // (in vault / will import from disk / not found) before the user commits.
    result.keyRefs = this.keyRefsFor(result.sessions)
    return result
  }

  private parseSessions(source: ImportSource, payload: string): ImportResult {
    switch (source) {
      case 'sshconfig':
        return this.fromSshConfig(payload)
      case 'putty':
        return this.fromPutty(payload)
      case 'winscp':
        return this.fromWinScp(payload)
      case 'csv':
        return this.fromCsv(payload)
      case 'ternix':
        return this.fromTernix(payload)
      case 'mobaxterm':
        return this.fromMobaXterm(payload)
      case 'tabby':
        return this.fromTabby(payload)
      default:
        throw new Error(`Unknown import source: ${source}`)
    }
  }

  /**
   * @param located Optional map of original key path → user-located absolute path,
   *   for keys whose original path doesn't exist on this machine (Phase 2 "Locate").
   */
  commit(sessions: SessionInput[], located: Record<string, string> = {}): number {
    // Resolve each distinct referenced key file to a vault key id (deduped):
    // read it once, import into the vault once, and reuse the id for every
    // session that pointed at the same path.
    const keyIdByPath = new Map<string, number | null>()
    for (const s of sessions) {
      const raw = s.importKeyPath
      if (!raw || keyIdByPath.has(raw)) continue
      keyIdByPath.set(raw, this.resolveKeyToVault(raw, located[raw]))
    }

    let n = 0
    const existing = sessionsRepo.list()
    for (const s of sessions) {
      const { importKeyPath, ...input } = s
      if (importKeyPath) {
        const keyId = keyIdByPath.get(importKeyPath) ?? null
        if (keyId) input.ssh_key_id = keyId
        else input.notes = [input.notes, `Requires key: ${importKeyPath}`].filter(Boolean).join('\n')
      }
      const isDuplicate = existing.some(e =>
        e.name === input.name &&
        e.protocol === input.protocol &&
        (e.host || '') === (input.host || '') &&
        (e.username || '') === (input.username || '')
      )
      if (!isDuplicate) {
        sessionsRepo.create(input)
        n++
      }
    }
    return n
  }

  /** Inspect a located key file (Phase 2) so the UI can update its status after the user picks it. */
  inspectKey(absPath: string): { encrypted: boolean; fingerprint: string | null } | null {
    return KeyService.inspectKeyFile(absPath)
  }

  /** Auth fields for a parsed session: a key path defers vault resolution to commit time. */
  private keyFields(keyPath: string | undefined, fallback: AuthType = 'password'): { auth_type: AuthType; importKeyPath?: string } {
    if (!keyPath) return { auth_type: fallback }
    return { auth_type: 'key', importKeyPath: keyPath }
  }

  /** Strip a `file://` scheme and expand a leading `~` so the path can be read locally. */
  private normalizeKeyPath(raw: string): string {
    let p = raw.trim()
    if (p.startsWith('file://')) {
      p = p.slice('file://'.length)
      try {
        p = decodeURIComponent(p)
      } catch {
        /* leave undecoded */
      }
    }
    if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = join(os.homedir(), p.slice(1))
    return p
  }

  /** The basename of a key path, used as the vault key's display name. */
  private keyName(raw: string): string {
    const cleaned = raw.replace(/^file:\/\//, '').replace(/[/\\]+$/, '')
    return cleaned.split(/[/\\]/).pop() || cleaned
  }

  /** Build the distinct list of referenced key files with their resolution status. */
  private keyRefsFor(sessions: SessionInput[]): ImportKeyRef[] {
    const seen = new Set<string>()
    const refs: ImportKeyRef[] = []
    for (const s of sessions) {
      const raw = s.importKeyPath
      if (!raw || seen.has(raw)) continue
      seen.add(raw)
      refs.push(this.inspectKeyRef(raw))
    }
    return refs
  }

  private inspectKeyRef(raw: string): ImportKeyRef {
    const name = this.keyName(raw)
    const inspected = KeyService.inspectKeyFile(this.normalizeKeyPath(raw))
    if (inspected) {
      const match = inspected.fingerprint ? keysRepo.findByFingerprint(inspected.fingerprint) : keysRepo.findByName(name)
      if (match) return { path: raw, name, status: 'vault', keyId: match.id, encrypted: inspected.encrypted }
      return { path: raw, name, status: 'found', encrypted: inspected.encrypted }
    }
    // Not readable on this machine — reuse a same-named vault key if one exists.
    const byName = keysRepo.findByName(name)
    if (byName) return { path: raw, name, status: 'vault', keyId: byName.id }
    return { path: raw, name, status: 'missing' }
  }

  /** Read a referenced key file into the vault (deduped) and return its id, or null if unreadable. */
  private resolveKeyToVault(raw: string, locatedAbs?: string): number | null {
    const name = this.keyName(raw)
    const abs = locatedAbs || this.normalizeKeyPath(raw)
    const res = KeyService.ensureKeyFromFile(abs, name)
    if (res) return res.id
    return keysRepo.findByName(name)?.id ?? null
  }

  // ---- OpenSSH config ----
  private fromSshConfig(text: string): ImportResult {
    const sessions: SessionInput[] = []
    let current: SessionInput | null = null
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const [keyword, ...rest] = line.split(/\s+/)
      const value = rest.join(' ')
      const kw = keyword.toLowerCase()
      if (kw === 'host') {
        if (current) sessions.push(current)
        if (value.includes('*')) {
          current = null
          continue
        }
        current = { name: value, protocol: 'ssh', host: value, port: 22, auth_type: 'agent' }
      } else if (current) {
        switch (kw) {
          case 'hostname':
            current.host = value
            break
          case 'port':
            current.port = parseInt(value, 10)
            break
          case 'user':
            current.username = value
            break
          case 'identityfile': {
            current.auth_type = 'key'
            current.importKeyPath = value
            break
          }
          case 'proxyjump':
            current.notes = `${current.notes ?? ''}\nProxyJump ${value}`.trim()
            break
        }
      }
    }
    if (current) sessions.push(current)
    return { imported: 0, skipped: 0, sessions }
  }

  // ---- PuTTY (.reg export or session text) ----
  private fromPutty(text: string): ImportResult {
    const sessions: SessionInput[] = []
    // Registry blocks: [HKEY_CURRENT_USER\...\Sessions\<name>]
    const blocks = text.split(/\[HKEY_CURRENT_USER.*?Sessions\\/i).slice(1)
    for (const block of blocks) {
      const nameMatch = block.match(/^([^\]]+)\]/)
      if (!nameMatch) continue
      const name = decodeURIComponent(nameMatch[1])
      const get = (k: string): string | undefined => {
        const m = block.match(new RegExp(`"${k}"="?([^"\\n]*)"?`, 'i'))
        return m?.[1]
      }
      const getDword = (k: string): number | undefined => {
        const m = block.match(new RegExp(`"${k}"=dword:([0-9a-f]+)`, 'i'))
        return m ? parseInt(m[1], 16) : undefined
      }
      const proto = (get('Protocol') || 'ssh').toLowerCase()
      const keyFile = get('PublicKeyFile')
      const kf = this.keyFields(keyFile)

      sessions.push({
        name,
        protocol: proto === 'serial' ? 'serial' : proto === 'telnet' ? 'telnet' : 'ssh',
        host: get('HostName') || '',
        port: getDword('PortNumber') ?? (proto === 'telnet' ? 23 : 22),
        username: get('UserName'),
        auth_type: kf.auth_type,
        importKeyPath: kf.importKeyPath
      })
    }
    return { imported: 0, skipped: 0, sessions }
  }

  // ---- WinSCP .ini ----
  private fromWinScp(text: string): ImportResult {
    const sessions: SessionInput[] = []
    const sections = text.split(/\[Sessions\\/).slice(1)
    for (const section of sections) {
      const nameMatch = section.match(/^([^\]]+)\]/)
      if (!nameMatch) continue
      const name = decodeURIComponent(nameMatch[1].replace(/%2F/gi, '/'))
      const get = (k: string): string | undefined => section.match(new RegExp(`^${k}=(.*)$`, 'im'))?.[1]?.trim()
      const keyFile = get('PublicKeyFile')
      const kf = this.keyFields(keyFile)

      sessions.push({
        name,
        protocol: 'ssh',
        host: get('HostName') || '',
        port: parseInt(get('PortNumber') || '22', 10),
        username: get('UserName'),
        auth_type: kf.auth_type,
        importKeyPath: kf.importKeyPath
      })
    }
    return { imported: 0, skipped: 0, sessions }
  }

  // ---- generic CSV ----
  private fromCsv(text: string): ImportResult {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (!lines.length) return { imported: 0, skipped: 0, sessions: [] }
    const headers = this.splitCsv(lines[0]).map((h) => h.trim().toLowerCase())
    const idx = (name: string) => headers.indexOf(name)
    const sessions: SessionInput[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsv(lines[i])
      const at = (name: string) => (idx(name) >= 0 ? cols[idx(name)]?.trim() : undefined)
      const name = at('name') || at('host')
      if (!name) continue
      const proto = (at('protocol') || 'ssh').toLowerCase()
      sessions.push({
        name,
        protocol: ['ssh', 'telnet', 'serial', 'rdp', 'vnc', 'local'].includes(proto) ? (proto as any) : 'ssh',
        host: at('host') || '',
        port: at('port') ? parseInt(at('port')!, 10) : 22,
        username: at('username'),
        tags: at('tags') ? at('tags')!.split(/[;|]/).map((t) => t.trim()) : [],
        notes: at('notes')
      })
    }
    return { imported: 0, skipped: 0, sessions }
  }

  private fromTernix(text: string): ImportResult {
    const data = JSON.parse(text)
    const sessions: SessionInput[] = (data.sessions ?? []).map((s: any) => ({ ...s }))
    return { imported: 0, skipped: 0, sessions }
  }

  // ---- MobaXterm .mxtsessions ----
  private fromMobaXterm(text: string): ImportResult {
    const sessions: SessionInput[] = []
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    let inBookmarks = false
    for (const line of lines) {
      if (line.startsWith('[')) {
        inBookmarks = true
        continue
      }
      if (!inBookmarks || !line.includes('=')) continue
      
      const idx = line.indexOf('=')
      const name = line.slice(0, idx)
      const valueStr = line.slice(idx + 1)
      const parts = valueStr.split('%')
      
      if (parts.length > 5) {
        // usually: Protocol%Host%Port%Username%...
        // protocol like #109#0 indicates SSH, #105#0 indicates Telnet etc.
        // Actually MobaXterm protocol identifiers can vary, but typically the first field indicates it indirectly, or it's just based on port.
        // Let's do a basic parse: we assume Host is parts[1], Port is parts[2], Username is parts[3]
        const host = parts[1] || ''
        const port = parseInt(parts[2], 10) || 22
        const username = parts[3] || ''
        
        const keyFile = parts.find((p) => p.toLowerCase().endsWith('.ppk') || p.toLowerCase().endsWith('.pem') || p.includes('.ssh/'))
        const kf = this.keyFields(keyFile)

        sessions.push({
          name,
          protocol: port === 23 ? 'telnet' : port === 3389 ? 'rdp' : 'ssh',
          host,
          port,
          username,
          auth_type: kf.auth_type,
          importKeyPath: kf.importKeyPath
        })
      }
    }
    return { imported: 0, skipped: 0, sessions }
  }

  // ---- Tabby config.yaml ----
  private fromTabby(text: string): ImportResult {
    const sessions: SessionInput[] = []
    try {
      const data = jsyaml.load(text) as any
      if (data && data.profiles && Array.isArray(data.profiles)) {
        for (const profile of data.profiles) {
          if (!profile.type || !profile.options) continue
          
          if (profile.type === 'ssh') {
            const keyFile = profile.options.privateKeys?.length ? profile.options.privateKeys[0] : undefined
            // Honor an explicit non-key auth mode (e.g. agent) when there's no key file.
            const fallback: AuthType = profile.options.auth === 'agent' ? 'agent' : 'password'
            const kf = this.keyFields(keyFile, fallback)

            sessions.push({
              name: profile.name || profile.options.host,
              protocol: 'ssh',
              host: profile.options.host || '',
              port: profile.options.port || 22,
              username: profile.options.user || '',
              auth_type: kf.auth_type,
              importKeyPath: kf.importKeyPath
            })
          } else if (profile.type === 'local') {
            sessions.push({
              name: profile.name || 'Local',
              protocol: 'local',
              host: null,
              port: null,
              username: null,
              auth_type: 'none',
              startup_commands: profile.options.command ? [profile.options.command] : []
            })
          } else if (profile.type === 'telnet' || profile.type === 'serial') {
            sessions.push({
              name: profile.name || profile.options.host || 'Serial/Telnet',
              protocol: profile.type as any,
              host: profile.options.host || '',
              port: profile.options.port || (profile.type === 'telnet' ? 23 : null)
            })
          }
        }
      }
    } catch (e) {
      // invalid yaml
    }
    return { imported: 0, skipped: 0, sessions }
  }

  private splitCsv(line: string): string[] {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = !inQuotes
      } else if (c === ',' && !inQuotes) {
        out.push(cur)
        cur = ''
      } else cur += c
    }
    out.push(cur)
    return out
  }

  // ---- export ----
  export(target: ExportTarget, includeKeys: boolean): string {
    switch (target) {
      case 'ternix':
        return this.toTernix(includeKeys)
      case 'csv':
        return this.toCsv()
      case 'sshconfig':
        return this.toSshConfig()
      case 'mobaxterm':
        return this.toMobaXterm()
      case 'tabby':
        return this.toTabby()
    }
  }

  private toTernix(includeKeys: boolean): string {
    const sessions = sessionsRepo.list()
    const payload: any = {
      format: 'ternix-backup',
      version: 1,
      exported_at: new Date().toISOString(),
      groups: groupsRepo.list(),
      sessions,
      snippets: snippetsRepo.list(),
      tunnels: sessions.flatMap((s) => tunnelsRepo.listForSession(s.id))
    }
    if (includeKeys) {
      payload.keys = keysRepo.list().map((k) => ({ ...k, private_key: keysRepo.getPrivate(k.id) }))
    }
    return JSON.stringify(payload, null, 2)
  }

  private toCsv(): string {
    const rows = [['name', 'protocol', 'host', 'port', 'username', 'tags', 'notes']]
    for (const s of sessionsRepo.list()) {
      rows.push([
        s.name,
        s.protocol,
        s.host ?? '',
        String(s.port ?? ''),
        s.username ?? '',
        s.tags.join(';'),
        (s.notes ?? '').replace(/\n/g, ' ')
      ])
    }
    return rows
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n')
  }

  private toSshConfig(): string {
    const lines: string[] = ['# Generated by Ternix', '']
    for (const s of sessionsRepo.list()) {
      if (s.protocol !== 'ssh') continue
      lines.push(`Host ${s.name.replace(/\s+/g, '-')}`)
      if (s.host) lines.push(`    HostName ${s.host}`)
      if (s.port) lines.push(`    Port ${s.port}`)
      if (s.username) lines.push(`    User ${s.username}`)
      if (s.compression) lines.push(`    Compression yes`)
      lines.push('')
    }
    return lines.join('\n')
  }

  private toMobaXterm(): string {
    const lines: string[] = ['[Bookmarks]']
    for (const s of sessionsRepo.list()) {
      // Format: SessionName=Protocol%Host%Port%Username%...
      // Protocol for SSH is typically #109#0, Telnet is #105#0, RDP is #112#0, etc.
      // We will just write #109#0 (SSH) for everything and specify port. MobaXterm relies mostly on the host/port/username fields correctly formatted.
      // Let's use basic placeholders for the rest of the % separated fields.
      const protocolCode = s.protocol === 'telnet' ? '#105#0' : s.protocol === 'rdp' ? '#112#0' : '#109#0'
      const host = s.host || ''
      const port = s.port || 22
      const user = s.username || ''
      const line = `${s.name}=${protocolCode}%${host}%${port}%${user}%%22%%-1%-1%%%22%%0%0%0%%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%0%15%236,236,236%0,0,0%180,180,192%0%-1%0%%xterm%-1%-1%_Std_Colors_0_%80%24%0%1%-1%<none>%%0#0#`
      lines.push(line)
    }
    return lines.join('\n')
  }

  private toTabby(): string {
    const profiles = sessionsRepo.list().map((s) => {
      const options: any = {}
      if (s.protocol === 'ssh') {
        options.host = s.host || ''
        options.port = s.port || 22
        if (s.username) options.user = s.username
      } else if (s.protocol === 'local') {
        if (s.startup_commands && s.startup_commands.length) {
          options.command = s.startup_commands[0]
        }
      } else if (s.protocol === 'serial' || s.protocol === 'telnet') {
        options.host = s.host || ''
        if (s.port) options.port = s.port
      }
      
      return {
        type: s.protocol,
        name: s.name,
        options
      }
    })
    
    return jsyaml.dump({ profiles })
  }
}

export const ImportExportService = new ImportExportServiceImpl()
