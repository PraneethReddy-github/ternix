import { createServer, type Server as HttpServer } from 'node:http'
import { connect as tcpConnect } from 'node:net'
import { randomBytes, createCipheriv } from 'node:crypto'
// @ts-ignore - Types are in shims.d.ts but some IDE configs may miss it
import GuacamoleLite from 'guacamole-lite'
import { settingsRepo } from '../db/repo'

const CIPHER = 'aes-256-cbc'
const DEFAULT_GUACD_HOST = '127.0.0.1'
const DEFAULT_GUACD_PORT = 4822

/** Settings sent to guacd for an RDP connection (Guacamole protocol parameter names). */
export interface RdpSettings {
  hostname: string
  port: number
  username?: string | null
  password?: string | null
  domain?: string | null
  width: number
  height: number
  security?: string
  ignoreCert?: boolean
}

class RdpGatewayServiceImpl {
  private http: HttpServer | null = null
  private guac: any = null
  private port = 0
  private key: Buffer = randomBytes(32) // per-process token key
  private starting: Promise<number> | null = null
  private builtFor = '' // guacd host:port the running gateway was built for

  private guacdHost(): string {
    return settingsRepo.get('rdp.guacdHost') || DEFAULT_GUACD_HOST
  }
  private guacdPort(): number {
    return Number(settingsRepo.get('rdp.guacdPort')) || DEFAULT_GUACD_PORT
  }

  /** Probe whether guacd is reachable, so the UI can fall back to a native client. */
  guacdStatus(): Promise<{ available: boolean; host: string; port: number }> {
    const host = this.guacdHost()
    const port = this.guacdPort()
    return new Promise((resolve) => {
      const sock = tcpConnect({ host, port })
      const done = (available: boolean) => {
        try { sock.destroy() } catch { /* ignore */ }
        resolve({ available, host, port })
      }
      sock.setTimeout(1500)
      sock.once('connect', () => done(true))
      sock.once('timeout', () => done(false))
      sock.once('error', () => done(false))
    })
  }

  private async ensureServer(): Promise<number> {
    const guacdKey = `${this.guacdHost()}:${this.guacdPort()}`
    // Rebuild if guacd target changed since the gateway was last started.
    if (this.port && this.builtFor !== guacdKey) this.shutdown()
    if (this.port) return this.port
    if (this.starting) return this.starting

    this.starting = new Promise<number>((resolve, reject) => {
      const http = createServer()
      http.on('error', reject)
      http.listen(0, '127.0.0.1', () => {
        const addr = http.address()
        this.port = typeof addr === 'object' && addr ? addr.port : 0
        this.http = http
        this.builtFor = guacdKey
        this.guac = new GuacamoleLite(
          {
            server: http,
            handleProtocols: (protocols: any) => 'guacamole'
          },
          { host: this.guacdHost(), port: this.guacdPort() },
          {
            crypt: { cypher: 'AES-256-CBC', key: this.key },
            // Keep long-lived RDP sessions alive (0 disables the inactivity reaper).
            maxInactivityTime: 0,
            log: { level: 'ERRORS' }
          }
        )
        resolve(this.port)
      })
    })
    return this.starting
  }

  /** Encrypt a connection token in the format guacamole-lite expects. */
  private encryptToken(value: unknown): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv(CIPHER, this.key, iv)
    let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'base64')
    encrypted += cipher.final('base64')
    const data = { iv: iv.toString('base64'), value: encrypted }
    return Buffer.from(JSON.stringify(data)).toString('base64')
  }

  /** Build the loopback gateway URL + encrypted token for an RDP session. */
  async open(s: RdpSettings): Promise<{ wsUrl: string; token: string }> {
    if (!s.hostname) throw new Error('RDP host is required')
    const port = await this.ensureServer()
    const settings: Record<string, unknown> = {
      hostname: s.hostname,
      port: String(s.port || 3389),
      security: s.security || 'any',
      'ignore-cert': s.ignoreCert !== false,
      'resize-method': 'display-update',
      width: s.width,
      height: s.height,
      dpi: 96
    }
    if (s.username) settings.username = s.username
    if (s.password) settings.password = s.password
    if (s.domain) settings.domain = s.domain

    const token = this.encryptToken({ connection: { type: 'rdp', settings } })
    return { wsUrl: `ws://127.0.0.1:${port}/`, token }
  }

  private shutdown(): void {
    try { this.guac?.close?.() } catch { /* ignore */ }
    try { this.http?.close() } catch { /* ignore */ }
    this.guac = null
    this.http = null
    this.port = 0
    this.starting = null
    this.builtFor = ''
  }

  closeAll(): void {
    this.shutdown()
  }
}

export const RdpGatewayService = new RdpGatewayServiceImpl()
