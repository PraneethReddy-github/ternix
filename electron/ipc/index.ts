import type { BrowserWindow } from 'electron'
import { registerSessionHandlers } from './sessions'
import { registerTerminalHandlers } from './terminal'
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

export function registerAllIpc(getWindow: () => BrowserWindow | null): void {
  registerSessionHandlers()
  registerTerminalHandlers()
  registerSftpHandlers()
  registerStatsHandlers()
  registerKeyHandlers()
  registerSnippetHandlers()
  registerTunnelHandlers()
  registerSettingsHandlers()
  registerRecordingHandlers()
  registerLogHandlers()
  registerImportExportHandlers()
  registerSystemHandlers(getWindow)
}
