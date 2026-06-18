import { handle } from './util'
import type { Recording } from '@shared/index'
import { RecordingService } from '../services/RecordingService'
import { recordingsRepo } from '../db/repo'

export function registerRecordingHandlers(): void {
  handle<Recording[]>('recordings:list', () => recordingsRepo.list())
  handle<number>('recordings:start', (tabId: string, sessionId: number | null, sessionName: string) =>
    RecordingService.start(tabId, sessionId, sessionName)
  )
  handle<void>('recordings:stop', (tabId: string) => RecordingService.stop(tabId))
  handle<string>('recordings:read', (id: number) => RecordingService.read(id))
  handle<void>('recordings:delete', (id: number) => RecordingService.delete(id))
  handle<boolean>('recordings:isRecording', (tabId: string) => RecordingService.isRecording(tabId))
}
