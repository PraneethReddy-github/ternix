import { createServer, type Server as HttpServer } from 'node:http'
import { connect as tcpConnect, isIP, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import type { Duplex } from 'node:stream'
import { WebSocketServer, createWebSocketStream, type WebSocket } from 'ws'
import type { HostKeyDecision } from '@shared/index'
import { Bus } from './bus'
import { knownHostsRepo } from '../db/repo'
import { fingerprintOf } from './SshService'
import { SEC_VENCRYPT, SEC_PLAIN, needsBridge, pickTlsSubtype, innerAuth } from './vencrypt'

/**
 * A tiny "websockify"-style bridge: noVNC in the renderer speaks the RFB protocol
 * over a WebSocket, but a real VNC server only speaks raw TCP. This service runs a
 * loopback-only WebSocket server that, for each authorized token, opens a TCP
 * socket to the target VNC host:port and pipes bytes in both directions.
 *
 * It also proxies the RFB handshake, because noVNC cannot do VeNCrypt's TLS subtypes —
 * TLS there is negotiated *inside* the RFB stream, which a browser has no way to enter.
 * When a server offers nothing else (wayvnc with certificates configured, TigerVNC with
 * X509* security types), the bridge does the TLS itself and hands noVNC the equivalent
 * plain handshake. See `handshake`.
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

/** Certificates the bridge pins itself, kept apart from SSH rows in the same table. */
const CERT_KEY_TYPE = 'vnc-tls-cert'

/**
 * Pull exactly `len` bytes off a paused stream — Node's own buffering does the work, this
 * only waits for enough of it to arrive.
 */
async function readExactly(s: Duplex, len: number): Promise<Buffer> {
  for (;;) {
    const chunk = s.read(len) as Buffer | null
    if (chunk) return chunk
    if (s.readableEnded || s.destroyed) throw new Error('Connection closed during the VNC handshake')
    // Racing 'close' matters: a pane torn down mid-handshake destroys the socket, which emits
    // 'close' and never 'readable', so waiting on 'readable' alone would hang forever.
    await Promise.race([once(s, 'readable'), once(s, 'close')])
  }
}

const u8 = (...v: number[]) => Buffer.from(v)
const u32 = (v: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(v)
  return b
}

class VncBridgeServiceImpl {
  private http: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private port = 0
  private starting: Promise<number> | null = null
  private targets = new Map<string, Target>() // token -> target
  private byTab = new Map<string, string>() // tabId -> token
  private pendingCert = new Map<string, (d: HostKeyDecision) => void>() // tabId -> modal answer

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
        // bridge() reports its own failures over the socket; nothing to do out here.
        this.bridge(ws, target).catch(() => {})
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
  private async bridge(ws: WebSocket, target: Target): Promise<void> {
    const client = createWebSocketStream(ws)
    const tcp = tcpConnect(target.port, target.host)
    target.ws = ws
    target.tcp = tcp

    // Teardown is driven by the close handlers below; these only stop a stray error from
    // reaching the process as an unhandled 'error' event.
    client.on('error', () => {})
    tcp.on('error', () => {})
    tcp.on('close', () => {
      try { ws.close() } catch { /* ignore */ }
    })
    ws.on('close', () => tcp.destroy())

    try {
      await once(tcp, 'connect')
      const server = await this.handshake(client, tcp, target)
      client.pipe(server)
      server.pipe(client)
    } catch (err: any) {
      // noVNC puts the close reason into the error it reports, so this is the one place a
      // VNC failure gets to explain itself in the pane. 123 bytes is the WebSocket limit.
      try { ws.close(4002, String(err?.message ?? 'VNC bridge failed').slice(0, 120)) } catch { /* ignore */ }
      tcp.destroy()
    }
  }

  /**
   * Proxy the RFB handshake, stepping in only when the server offers nothing noVNC can
   * negotiate by itself. Returns the stream the session should run over: the raw socket
   * when nothing had to be rewritten, or the TLS socket wrapped around it.
   */
  private async handshake(client: Duplex, tcp: Socket, target: Target): Promise<Duplex> {
    // ProtocolVersion, verbatim in both directions.
    client.write(await readExactly(tcp, 12))
    const clientVersion = await readExactly(client, 12)
    tcp.write(clientVersion)

    // RFB 3.3 has the server dictate one 32-bit security type and knows nothing of VeNCrypt,
    // so there is nothing to rewrite. An unparseable version lands here too, which is the
    // right default: get out of the way rather than guess.
    const text = clientVersion.toString('latin1')
    const major = parseInt(text.slice(4, 7), 10)
    const minor = parseInt(text.slice(8, 11), 10)
    if (!(major > 3 || (major === 3 && minor >= 7))) return tcp

    const count = (await readExactly(tcp, 1))[0]
    if (count === 0) {
      // Server is refusing outright; a reason string follows, which noVNC reads itself.
      client.write(u8(0))
      return tcp
    }
    const types = [...(await readExactly(tcp, count))]
    if (!needsBridge(types)) {
      client.write(Buffer.concat([u8(count), Buffer.from(types)]))
      return tcp
    }

    // Take VeNCrypt on noVNC's behalf and run it up to the point where the stream is plain
    // RFB again.
    tcp.write(u8(SEC_VENCRYPT))
    const version = await readExactly(tcp, 2)
    if (version[0] !== 0 || version[1] !== 2) {
      throw new Error(`Unsupported VeNCrypt version ${version[0]}.${version[1]}`)
    }
    tcp.write(u8(0, 2))
    if ((await readExactly(tcp, 1))[0] !== 0) throw new Error('VNC server rejected the VeNCrypt version')

    const subCount = (await readExactly(tcp, 1))[0]
    if (subCount === 0) throw new Error('VNC server offered no VeNCrypt subtypes')
    const raw = await readExactly(tcp, 4 * subCount)
    const subtypes = Array.from({ length: subCount }, (_, i) => raw.readUInt32BE(i * 4))

    const subtype = pickTlsSubtype(subtypes)
    if (subtype === null) {
      // Nothing X.509-shaped to take over for. Replay the real offer so noVNC handles Plain
      // natively, and names the subtypes properly in its own error for everything else.
      await this.offerSecurity(client, [SEC_VENCRYPT])
      tcp.write(u32(await this.offerVeNCrypt(client, subtypes)))
      return tcp
    }

    tcp.write(u32(subtype))
    // TLS subtypes get a go/no-go byte before the handshake starts.
    if ((await readExactly(tcp, 1))[0] === 0) throw new Error('VNC server refused to start TLS')
    const server = await this.startTls(tcp, target)

    // Whatever runs inside the tunnel is an ordinary RFB security type. Offer noVNC that and
    // it negotiates as though the TLS layer were never there.
    const inner = innerAuth(subtype)
    if (inner === SEC_PLAIN) {
      await this.offerSecurity(client, [SEC_VENCRYPT])
      await this.offerVeNCrypt(client, [SEC_PLAIN])
    } else {
      await this.offerSecurity(client, [inner])
    }
    return server
  }

  /** Advertise `types` to the client and consume its choice. */
  private async offerSecurity(client: Duplex, types: number[]): Promise<number> {
    client.write(Buffer.from([types.length, ...types]))
    const chosen = (await readExactly(client, 1))[0]
    if (!types.includes(chosen)) throw new Error(`Viewer chose security type ${chosen}, which was not offered`)
    return chosen
  }

  /** Server half of the VeNCrypt 0.2 dance toward the client; returns its chosen subtype. */
  private async offerVeNCrypt(client: Duplex, subtypes: number[]): Promise<number> {
    client.write(u8(0, 2)) // the version we speak
    await readExactly(client, 2) // the client's echo — noVNC only ever answers 0.2
    client.write(u8(0)) // version accepted
    const list = Buffer.alloc(1 + 4 * subtypes.length)
    list[0] = subtypes.length
    subtypes.forEach((s, i) => list.writeUInt32BE(s, 1 + i * 4))
    client.write(list)
    return (await readExactly(client, 4)).readUInt32BE(0)
  }

  /** TLS inside the RFB stream, with the certificate pinned the way SSH host keys are. */
  private async startTls(socket: Socket, target: Target): Promise<TLSSocket> {
    const tls = tlsConnect({
      socket,
      servername: isIP(target.host) ? undefined : target.host,
      // VNC certificates are self-signed far more often than not, so a valid CA chain is not
      // the decider here — trust-on-first-use below is. Never silent: an unpinned certificate
      // stops the connection and asks.
      rejectUnauthorized: false
    })
    await once(tls, 'secureConnect')

    const cert = tls.getPeerCertificate()
    if (!cert?.raw) throw new Error('VNC server presented no TLS certificate')
    if (!tls.authorized) await this.confirmCertificate(target, fingerprintOf(cert.raw), cert.raw)
    return tls
  }

  /** Trust-on-first-use for a self-signed certificate, via the host-key modal. */
  private async confirmCertificate(target: Target, fingerprint: string, raw: Buffer): Promise<void> {
    const row = knownHostsRepo.get(target.host, target.port)
    // known_hosts is keyed by host+port, so only a row of our own type counts as a match.
    // ponytail: pinning here would overwrite an SSH key pinned on the same host:port. Give
    // the table a protocol column if anyone ever runs both on one port.
    const known = row?.key_type === CERT_KEY_TYPE ? row : null
    if (known?.fingerprint === fingerprint) return

    const decision = await new Promise<HostKeyDecision>((resolve) => {
      this.pendingCert.set(target.tabId, resolve)
      Bus.emit('terminal:hostkey', {
        tabId: target.tabId,
        host: target.host,
        port: target.port,
        keyType: CERT_KEY_TYPE,
        fingerprint,
        changed: !!known,
        oldFingerprint: known?.fingerprint
      })
    })
    if (decision === 'reject') throw new Error('TLS certificate rejected')
    if (decision === 'always') {
      knownHostsRepo.upsert(target.host, target.port, CERT_KEY_TYPE, fingerprint, raw.toString('base64'))
    }
  }

  /** Renderer answered the certificate modal. False means the prompt was SSH's, not ours. */
  respondHostKey(tabId: string, decision: HostKeyDecision): boolean {
    const resolve = this.pendingCert.get(tabId)
    if (!resolve) return false
    this.pendingCert.delete(tabId)
    resolve(decision)
    return true
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
    // A pane closed mid-prompt has nobody left to answer the modal; refusing settles the
    // handshake instead of leaving it hanging on a promise forever.
    this.respondHostKey(tabId, 'reject')
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
