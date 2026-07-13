import { registerSessionHandlers } from './sessions'
import { registerTerminalHandlers } from './terminal'
import { registerRemoteHandlers } from './remote'
import { registerSftpHandlers } from './sftp'
import { registerStatsHandlers } from './stats'
import { registerKeyHandlers } from './keys'
import { registerSnippetHandlers } from './snippets'
import { registerTunnelHandlers } from './tunnels'
import { registerSettingsHandlers } from './settings'
import { registerRecordingHandlers } from './recordings'
import { registerLogHandlers } from './log'
import { registerImportExportHandlers } from './importexport'
import { registerSystemHandlers } from './system'

export function registerAllIpc(): void {
  registerSessionHandlers()
  registerTerminalHandlers()
  registerRemoteHandlers()
  registerSftpHandlers()
  registerStatsHandlers()
  registerKeyHandlers()
  registerSnippetHandlers()
  registerTunnelHandlers()
  registerSettingsHandlers()
  registerRecordingHandlers()
  registerLogHandlers()
  registerImportExportHandlers()
  registerSystemHandlers()
}
