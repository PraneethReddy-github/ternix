import { createRequire } from 'node:module'
import type { Session } from '@shared/index'
import { ConnectionManager, type TerminalBackend } from './ConnectionManager'
import { sessionsRepo } from '../db/repo'

const nodeRequire = createRequire(import.meta.url)
// serialport is native; load lazily so the app boots even where it failed to build.
function loadSerialPort(): any {
  return nodeRequire('serialport')
}

const PARITY_MAP: Record<string, string> = {
  none: 'none',
  even: 'even',
  odd: 'odd',
  mark: 'mark',
  space: 'space'
}

class SerialServiceImpl {
  async listPorts(): Promise<{ path: string; manufacturer?: string }[]> {
    try {
      const { SerialPort } = loadSerialPort()
      const ports = await SerialPort.list()
      return ports.map((p: any) => ({ path: p.path, manufacturer: p.manufacturer }))
    } catch {
      return []
    }
  }

  async spawn(tabId: string, session: Session): Promise<TerminalBackend> {
    const { SerialPort } = loadSerialPort()
    ConnectionManager.pushStatus(tabId, 'connecting', `Opening ${session.com_port}…`)

    const port = new SerialPort({
      path: session.com_port ?? '',
      baudRate: session.baud_rate || 9600,
      dataBits: session.data_bits || 8,
      stopBits: session.stop_bits || 1,
      parity: PARITY_MAP[session.parity] ?? 'none',
      rtscts: session.flow_control === 'rtscts',
      xon: session.flow_control === 'xon/xoff',
      xoff: session.flow_control === 'xon/xoff',
      autoOpen: false
    })

    port.on('data', (data: Buffer) => ConnectionManager.pushData(tabId, data.toString('binary')))
    port.on('close', () => ConnectionManager.pushExit(tabId, 0, 'port closed'))
    port.on('error', (err: Error) => ConnectionManager.pushStatus(tabId, 'error', err.message))

    await new Promise<void>((resolve, reject) => {
      port.open((err: Error | null) => (err ? reject(err) : resolve()))
    })

    sessionsRepo.markConnected(session.id)
    ConnectionManager.pushStatus(tabId, 'connected')

    return {
      protocol: 'serial',
      write: (data) => port.write(Buffer.from(data, 'binary')),
      resize: () => {
        /* serial has no window size */
      },
      kill: () => {
        try {
          port.close()
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export const SerialService = new SerialServiceImpl()
