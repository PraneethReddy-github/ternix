import { createServer, type Server as HttpServer } from 'node:http'
import { connect as tcpConnect, type Socket } from 'node:net'
import { randomBytes } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'

/**
 * A tiny "websockify"-style bridge: noVNC in the renderer speaks the RFB protocol
 * over a WebSocket, but a real VNC server only speaks raw TCP. This service runs a
 * loopback-only WebSocket server that, for each authorized token, opens a TCP
 * socket to the target VNC host:port and pipes bytes in both directions.
 *
 * The whole thing is bound to 127.0.0.1 and gated by a random per-session token so
 * the renderer can't use it as an open TCP proxy to arbitrary hosts.
 */
interface Target {
  host: string
  port: number
  tabId: string
  ws?: WebSocket
  tcp?: Socket
}

class VncBridgeServiceImpl {
  private http: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private port = 0
  private starting: Promise<number> | null = null
  private targets = new Map<string, Target>() // token -> target
  private byTab = new Map<string, string>() // tabId -> token

  /** Lazily start the loopback WebSocket server; resolves with its port. */
  private async ensureServer(): Promise<number> {
    if (this.port) return this.port
    if (this.starting) return this.starting

    this.starting = new Promise<number>((resolve, reject) => {
      const http = createServer()
      const wss = new WebSocketServer({
        server: http,
        handleProtocols: (protocols) => {
          // Browser clients like noVNC require the server to echo back the requested subprotocol
          // (e.g., 'binary'). Otherwise, the browser strictly terminates the connection.
          if (protocols instanceof Set) return Array.from(protocols)[0] || false
          if (Array.isArray(protocols)) return protocols[0] || false
          return false
        }
      })

      wss.on('connection', (ws, req) => {
        const token = new URL(req.url ?? '', 'ws://127.0.0.1').searchParams.get('token') ?? ''
        const target = this.targets.get(token)
        if (!target) {
          ws.close(4001, 'unknown token')
          return
        }
        this.pipe(ws, target)
      })

      http.on('error', reject)
      // Port 0 → OS picks a free port; bind to loopback only.
      http.listen(0, '127.0.0.1', () => {
        const addr = http.address()
        this.http = http
        this.wss = wss
        this.port = typeof addr === 'object' && addr ? addr.port : 0
        resolve(this.port)
      })
    })
    return this.starting
  }

  /** Bridge a single WebSocket <-> a fresh TCP socket to the VNC server. */
  private pipe(ws: WebSocket, target: Target): void {
    const tcp = tcpConnect(target.port, target.host)
    target.ws = ws
    target.tcp = tcp
    ws.binaryType = 'nodebuffer'

    tcp.on('data', (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk)
    })
    ws.on('message', (data: Buffer) => {
      if (!tcp.destroyed) tcp.write(data)
    })

    const shutdown = () => {
      try { tcp.destroy() } catch { /* ignore */ }
      try { if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close() } catch { /* ignore */ }
    }
    tcp.on('error', shutdown)
    tcp.on('close', shutdown)
    ws.on('error', shutdown)
    ws.on('close', shutdown)
  }

  /**
   * Register a target and return the loopback WebSocket URL noVNC should connect to.
   * Re-opening for the same tab replaces the previous target.
   */
  async open(tabId: string, host: string, port: number): Promise<{ wsUrl: string }> {
    if (!host) throw new Error('VNC host is required')
    this.close(tabId)
    const p = await this.ensureServer()
    const token = randomBytes(18).toString('hex')
    this.targets.set(token, { host, port: port || 5900, tabId })
    this.byTab.set(tabId, token)
    return { wsUrl: `ws://127.0.0.1:${p}/?token=${token}` }
  }

  /** Tear down the bridge for a tab (idempotent). */
  close(tabId: string): void {
    const token = this.byTab.get(tabId)
    if (!token) return
    const target = this.targets.get(token)
    if (target) {
      try { target.tcp?.destroy() } catch { /* ignore */ }
      try { target.ws?.close() } catch { /* ignore */ }
    }
    this.targets.delete(token)
    this.byTab.delete(tabId)
  }

  closeAll(): void {
    for (const tabId of [...this.byTab.keys()]) this.close(tabId)
  }
}

export const VncBridgeService = new VncBridgeServiceImpl()
