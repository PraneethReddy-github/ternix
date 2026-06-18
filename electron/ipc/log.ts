import { handle } from './util'
import type { ConnectionLogEntry } from '@shared/index'
import { logRepo } from '../db/repo'

export function registerLogHandlers(): void {
  handle<ConnectionLogEntry[]>('log:list', (sessionId?: number) => logRepo.list(sessionId))
  handle<void>('log:clear', () => logRepo.clear())
}
