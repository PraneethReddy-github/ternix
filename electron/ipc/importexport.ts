import { handle } from './util'
import type { ImportResult, ImportSource, ExportTarget, SessionInput } from '@shared/index'
import { ImportExportService } from '../services/ImportExportService'
import { CryptoService } from '../services/CryptoService'

export function registerImportExportHandlers(): void {
  handle<ImportResult>('importExport:import', (source: ImportSource, payload: string) => ImportExportService.parse(source, payload))
  handle<number>('importExport:commitImport', (sessions: SessionInput[]) => ImportExportService.commit(sessions))
  handle<string>('importExport:export', (target: ExportTarget, includeKeys: boolean, masterPassword?: string) => {
    if (includeKeys && CryptoService.hasMasterPassword()) {
      if (!masterPassword || !CryptoService.unlock(masterPassword)) {
        throw new Error('Master password confirmation required to export private keys')
      }
    }
    return ImportExportService.export(target, includeKeys)
  })
}
