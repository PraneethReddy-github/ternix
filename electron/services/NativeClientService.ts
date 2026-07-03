import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { shell } from 'electron'
import type { Session } from '@shared/index'

interface Secrets {
  password: string | null
  vncPassword: string | null
}

/** Try each candidate command in turn; resolve with the first that actually starts. */
function trySpawn(candidates: { cmd: string; args: string[] }[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const attempt = (i: number) => {
      if (i >= candidates.length) {
        reject(new Error('No suitable native client found on this system'))
        return
      }
      const { cmd, args } = candidates[i]
      try {
        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
        let settled = false
        child.once('error', (err: NodeJS.ErrnoException) => {
          if (settled) return
          settled = true
          // Binary missing → try the next candidate; other errors bubble up.
          if (err.code === 'ENOENT') attempt(i + 1)
          else reject(err)
        })
        // If it didn't immediately error, assume it launched.
        setTimeout(() => {
          if (settled) return
          settled = true
          child.unref()
          resolve(cmd)
        }, 400)
      } catch {
        attempt(i + 1)
      }
    }
    attempt(0)
  })
}

/**
 * Launches the operating system's own RDP/VNC client for a session — the "native
 * fallback" used when the embedded (in-pane) viewer can't be used (e.g. guacd is
 * not running, or the user prefers a full native window).
 */
class NativeClientServiceImpl {
  async launch(session: Session, secrets: Secrets): Promise<string> {
    if (session.protocol === 'rdp') return this.launchRdp(session, secrets.password)
    if (session.protocol === 'vnc') return this.launchVnc(session, secrets.vncPassword)
    throw new Error(`No native client for protocol ${session.protocol}`)
  }

  private async launchRdp(session: Session, password: string | null): Promise<string> {
    const host = session.host || ''
    if (!host) throw new Error('RDP host is required')
    const port = session.port || 3389
    const user = session.username || ''
    const domain = session.rdp_domain || ''
    const width = session.rdp_width || 1920
    const height = session.rdp_height || 1080

    if (process.platform === 'win32') {
      // Pre-stash the credential so mstsc doesn't prompt.
      if (user && password) {
        await new Promise<void>((res) => {
          const targetUser = domain ? `${domain}\\${user}` : user
          const ck = spawn('cmdkey', [`/generic:TERMSRV/${host}`, `/user:${targetUser}`, `/pass:${password}`], { stdio: 'ignore' })
          ck.on('close', () => res())
          ck.on('error', () => res())
        })
      }
      // Resolve mstsc via PATH, then fall back to its known System32 location in case
      // PATH is unusual — so the launch is reliable regardless of environment.
      const mstscArgs = [`/v:${host}:${port}`, `/w:${width}`, `/h:${height}`]
      const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
      return trySpawn([
        { cmd: 'mstsc', args: mstscArgs },
        { cmd: join(sysRoot, 'System32', 'mstsc.exe'), args: mstscArgs }
      ])
    }

    if (process.platform === 'darwin') {
      // Microsoft Remote Desktop registers the rdp:// scheme; fall back to a .rdp file.
      const rdpFile = join(tmpdir(), `ternix-${Date.now()}.rdp`)
      const lines = [
        `full address:s:${host}:${port}`,
        `username:s:${domain ? domain + '\\' : ''}${user}`,
        `desktopwidth:i:${width}`,
        `desktopheight:i:${height}`
      ]
      writeFileSync(rdpFile, lines.join('\n'), 'utf8')
      return trySpawn([
        { cmd: 'open', args: ['-a', 'Microsoft Remote Desktop', rdpFile] },
        { cmd: 'open', args: [rdpFile] }
      ])
    }

    // Linux: FreeRDP. Password on the command line is visible to local `ps`, which
    // is an accepted trade-off for an explicit fallback launch.
    const args = [`/v:${host}:${port}`, `/w:${width}`, `/h:${height}`, '/cert:ignore', '+clipboard', '+dynamic-resolution']
    if (user) args.push(`/u:${user}`)
    if (domain) args.push(`/d:${domain}`)
    if (password) args.push(`/p:${password}`)
    return trySpawn([
      { cmd: 'xfreerdp', args },
      { cmd: 'xfreerdp3', args },
      { cmd: 'wlfreerdp', args }
    ])
  }

  private async launchVnc(session: Session, password: string | null): Promise<string> {
    const host = session.host || ''
    if (!host) throw new Error('VNC host is required')
    const port = session.port || 5900
    const hostPort = `${host}:${port}`

    if (process.platform === 'darwin') {
      // macOS Screen Sharing understands vnc:// and an embedded password.
      const url = password ? `vnc://:${encodeURIComponent(password)}@${hostPort}` : `vnc://${hostPort}`
      await shell.openExternal(url)
      return 'Screen Sharing'
    }

    if (process.platform === 'linux') {
      return trySpawn([
        { cmd: 'vncviewer', args: [hostPort] },
        { cmd: 'xtigervncviewer', args: [hostPort] },
        { cmd: 'remmina', args: ['-c', `vnc://${hostPort}`] }
      ])
    }

    // Windows: try a viewer on PATH, else hand the vnc:// URL to the shell.
    try {
      return await trySpawn([
        { cmd: 'vncviewer', args: [hostPort] },
        { cmd: 'tvnviewer', args: [hostPort] }
      ])
    } catch {
      await shell.openExternal(`vnc://${hostPort}`)
      return 'system handler'
    }
  }
}

export const NativeClientService = new NativeClientServiceImpl()
