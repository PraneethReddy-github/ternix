import { TerminalSquare, Server, Cable, RadioTower, Monitor, MonitorSmartphone } from 'lucide-react'
import type { Protocol } from '@shared/index'

const MAP: Record<Protocol, { icon: typeof Server; color: string }> = {
  ssh: { icon: Server, color: '#58a6ff' },
  telnet: { icon: RadioTower, color: '#d29922' },
  serial: { icon: Cable, color: '#bc8cff' },
  local: { icon: TerminalSquare, color: '#3fb950' },
  rdp: { icon: Monitor, color: '#f85149' },
  vnc: { icon: MonitorSmartphone, color: '#39c5cf' }
}

export function ProtocolIcon({ protocol, size = 14, className }: { protocol: Protocol; size?: number; className?: string }) {
  const { icon: Icon, color } = MAP[protocol] ?? MAP.local
  return <Icon size={size} className={className} style={{ color }} />
}

export function protocolColor(protocol: Protocol): string {
  return (MAP[protocol] ?? MAP.local).color
}
