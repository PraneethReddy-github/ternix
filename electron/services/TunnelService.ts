import net from 'node:net'
import type { Client } from 'ssh2'
import type { ActiveTunnel, Tunnel } from '@shared/index'
import { ConnectionManager } from './ConnectionManager'
import { tunnelsRepo } from '../db/repo'
import { Bus } from './bus'

interface RunningTunnel {
  tunnel: Tunnel
  tabId: string
  server?: net.Server
  status: 'active' | 'pending' | 'failed'
  bytes: number
  error?: string
  client: Client
  onTcpConnection?: (...args: any[]) => void
}

/** Manages SSH port-forwarding (local -L, remote -R, dynamic -D / SOCKS5). */
class TunnelServiceImpl {
  private running = new Map<number, RunningTunnel>()

  async start(tunnelId: number, tabId: string): Promise<ActiveTunnel> {
    const tunnel = tunnelsRepo.get(tunnelId)
    if (!tunnel) throw new Error('Tunnel not found')
    const client = ConnectionManager.get(tabId)?.getSshClient?.()
    if (!client) throw new Error('Tunnel requires an active SSH connection')
    const existing = this.running.get(tunnelId)
    if (existing && existing.status !== 'failed') return this.toActive(existing)
    if (existing) this.stop(tunnelId) // clear a failed entry (and its listeners) before retrying

    const rt: RunningTunnel = { tunnel, tabId, status: 'pending', bytes: 0, client }
    this.running.set(tunnelId, rt)

    try {
      if (tunnel.tunnel_type === 'local') await this.startLocal(rt)
      else if (tunnel.tunnel_type === 'dynamic') await this.startDynamic(rt)
      else await this.startRemote(rt)
      rt.status = 'active'
    } catch (err: any) {
      rt.status = 'failed'
      rt.error = err.message
    }
    this.broadcast()
    return this.toActive(rt)
  }

  stop(tunnelId: number): void {
    const rt = this.running.get(tunnelId)
    if (!rt) return
    try {
      rt.server?.close()
      if (rt.tunnel.tunnel_type === 'remote' && rt.tunnel.remote_host != null && rt.tunnel.remote_port != null) {
        rt.client.unforwardIn(rt.tunnel.remote_host, rt.tunnel.remote_port, () => {})
      }
      if (rt.onTcpConnection) rt.client.removeListener('tcp connection', rt.onTcpConnection)
    } catch {
      /* ignore */
    }
    this.running.delete(tunnelId)
    this.broadcast()
  }

  /** Stop every tunnel bound to a tab (called when its connection closes). */
  stopForTab(tabId: string): void {
    for (const [id, rt] of this.running) if (rt.tabId === tabId) this.stop(id)
  }

  listActive(): ActiveTunnel[] {
    return [...this.running.values()].map((rt) => this.toActive(rt))
  }

  // ---- forwarders ----

  private startLocal(rt: RunningTunnel): Promise<void> {
    const { tunnel, client } = rt
    return new Promise((resolve, reject) => {
      const server = net.createServer((sock) => {
        client.forwardOut(sock.remoteAddress || '127.0.0.1', sock.remotePort || 0, tunnel.remote_host || 'localhost', tunnel.remote_port || 0, (err, stream) => {
          if (err) {
            sock.destroy()
            return
          }
          this.meter(rt, sock, stream)
        })
      })
      server.on('error', reject)
      server.listen(tunnel.local_port, tunnel.local_host || '127.0.0.1', () => {
        rt.server = server
        resolve()
      })
    })
  }

  private startRemote(rt: RunningTunnel): Promise<void> {
    const { tunnel, client } = rt
    return new Promise((resolve, reject) => {
      client.forwardIn(tunnel.remote_host || '127.0.0.1', tunnel.remote_port || 0, (err) => (err ? reject(err) : resolve()))
      rt.onTcpConnection = (info: any, accept: any) => {
        if (info.destPort !== tunnel.remote_port) return
        const stream = accept()
        const local = net.connect(tunnel.local_port, tunnel.local_host || '127.0.0.1')
        this.meter(rt, local, stream)
      }
      client.on('tcp connection', rt.onTcpConnection)
    })
  }

  /** Minimal SOCKS5 (no-auth, CONNECT) server that tunnels through the SSH client. */
  private startDynamic(rt: RunningTunnel): Promise<void> {
    const { client } = rt
    return new Promise((resolve, reject) => {
      const server = net.createServer((sock) => {
        sock.once('data', (greeting) => {
          if (greeting[0] !== 0x05) return sock.destroy()
          sock.write(Buffer.from([0x05, 0x00])) // no auth
          sock.once('data', (req) => {
            if (req[0] !== 0x05 || req[1] !== 0x01) {
              sock.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
              return sock.destroy()
            }
            const atyp = req[3]
            let host = ''
            let offset = 4
            if (atyp === 0x01) {
              host = `${req[4]}.${req[5]}.${req[6]}.${req[7]}`
              offset = 8
            } else if (atyp === 0x03) {
              const len = req[4]
              host = req.subarray(5, 5 + len).toString()
              offset = 5 + len
            } else if (atyp === 0x04) {
              host = Array.from(req.subarray(4, 20)).map((b) => b.toString(16)).join(':')
              offset = 20
            }
            const port = req.readUInt16BE(offset)
            client.forwardOut(sock.remoteAddress || '127.0.0.1', sock.remotePort || 0, host, port, (err, stream) => {
              if (err) {
                sock.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
                return sock.destroy()
              }
              sock.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
              this.meter(rt, sock, stream)
            })
          })
        })
        sock.on('error', () => sock.destroy())
      })
      server.on('error', reject)
      server.listen(rt.tunnel.local_port, rt.tunnel.local_host || '127.0.0.1', () => {
        rt.server = server
        resolve()
      })
    })
  }

  private meter(rt: RunningTunnel, a: NodeJS.ReadWriteStream, b: NodeJS.ReadWriteStream): void {
    const count = (chunk: Buffer) => {
      rt.bytes += chunk.length
    }
    a.on('data', count)
    b.on('data', count)
    a.pipe(b as any)
    b.pipe(a as any)
    const cleanup = () => {
      (a as any).destroy?.()
      ;(b as any).destroy?.()
    }
    a.on('close', cleanup)
    b.on('close', cleanup)
    a.on('error', cleanup)
    b.on('error', cleanup)
  }

  private toActive(rt: RunningTunnel): ActiveTunnel {
    return { ...rt.tunnel, status: rt.status, bytesTransferred: rt.bytes, error: rt.error, tabId: rt.tabId }
  }

  private broadcast(): void {
    Bus.emit('tunnels:update', this.listActive())
  }
}

export const TunnelService = new TunnelServiceImpl()
