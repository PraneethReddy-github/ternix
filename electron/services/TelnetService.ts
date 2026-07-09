import net from 'node:net'
import type { Session } from '@shared/index'
import { ConnectionManager, type TerminalBackend } from './ConnectionManager'
import { sessionsRepo } from '../db/repo'

// Telnet command bytes (RFC 854) + a few options we negotiate.
const IAC = 255
const DONT = 254
const DO = 253
const WONT = 252
const WILL = 251
const SB = 250
const SE = 240
const OPT_ECHO = 1
const OPT_SUPPRESS_GA = 3
const OPT_TERMINAL_TYPE = 24
const OPT_NAWS = 31

/** Minimal but correct Telnet client with IAC option negotiation. */
class TelnetServiceImpl {
  async spawn(tabId: string, session: Session, cols: number, rows: number): Promise<TerminalBackend> {
    ConnectionManager.pushStatus(tabId, 'connecting', `Connecting to ${session.host}…`)
    const secrets = sessionsRepo.getSecrets(session.id)
    let sentUser = false
    let sentPass = false

    const socket = new net.Socket()
    let size = { cols, rows }

    const negotiate = (cmd: number, opt: number) => socket.write(Buffer.from([IAC, cmd, opt]))

    const sendNaws = () => {
      const b = Buffer.from([IAC, SB, OPT_NAWS, (size.cols >> 8) & 0xff, size.cols & 0xff, (size.rows >> 8) & 0xff, size.rows & 0xff, IAC, SE])
      socket.write(b)
    }

    const handleIac = (data: Buffer): Buffer => {
      const out: number[] = []
      let i = 0
      while (i < data.length) {
        if (data[i] === IAC) {
          const cmd = data[i + 1]
          const opt = data[i + 2]
          if (cmd === DO) {
            if (opt === OPT_TERMINAL_TYPE || opt === OPT_SUPPRESS_GA || opt === OPT_NAWS) {
              negotiate(WILL, opt)
              if (opt === OPT_NAWS) sendNaws()
            } else negotiate(WONT, opt)
            i += 3
          } else if (cmd === WILL) {
            negotiate(opt === OPT_ECHO || opt === OPT_SUPPRESS_GA ? DO : DONT, opt)
            i += 3
          } else if (cmd === DONT || cmd === WONT) {
            negotiate(cmd === DONT ? WONT : DONT, opt)
            i += 3
          } else if (cmd === SB) {
            // subnegotiation: terminal-type request → send "xterm-256color"
            const seIdx = data.indexOf(SE, i)
            if (data[i + 2] === OPT_TERMINAL_TYPE && data[i + 3] === 1) {
              const tt = Buffer.from('xterm-256color')
              socket.write(Buffer.concat([Buffer.from([IAC, SB, OPT_TERMINAL_TYPE, 0]), tt, Buffer.from([IAC, SE])]))
            }
            i = seIdx >= 0 ? seIdx + 1 : data.length
          } else {
            i += 2
          }
        } else {
          out.push(data[i])
          i++
        }
      }
      return Buffer.from(out)
    }

    socket.on('data', (data) => {
      const clean = handleIac(data)
      const text = clean.toString('binary')
      ConnectionManager.pushData(tabId, text)
      // Opportunistic auto-login on prompt detection.
      if (!sentUser && session.username && /login:|username:/i.test(text)) {
        socket.write(session.username + '\r\n')
        sentUser = true
      } else if (!sentPass && secrets.password && /password:/i.test(text)) {
        socket.write(secrets.password + '\r\n')
        sentPass = true
      }
    })
    socket.on('close', (hadError: boolean) =>
      ConnectionManager.pushExit(tabId, 0, hadError ? 'connection lost' : 'connection closed', !hadError)
    )
    socket.on('error', (err) => ConnectionManager.pushStatus(tabId, 'error', err.message))

    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.connect(session.port ?? 23, session.host ?? 'localhost', () => {
        socket.removeListener('error', reject)
        resolve()
      })
    })

    if (session.startup_commands?.length) {
      for (const cmd of session.startup_commands) socket.write(cmd + '\r\n')
    }

    sessionsRepo.markConnected(session.id)
    ConnectionManager.pushStatus(tabId, 'connected')

    return {
      protocol: 'telnet',
      write: (data) => socket.write(Buffer.from(data, 'binary')),
      resize: (c, r) => {
        size = { cols: c, rows: r }
        sendNaws()
      },
      kill: () => socket.destroy()
    }
  }
}

export const TelnetService = new TelnetServiceImpl()
