import { app } from 'electron'
import { createWriteStream, mkdirSync, readFileSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { WriteStream } from 'node:fs'
import { ConnectionManager } from './ConnectionManager'
import { recordingsRepo, settingsRepo } from '../db/repo'

interface ActiveRec {
  recordingId: number
  stream: WriteStream
  startedAt: number
  path: string
}

/** Records terminal output to asciinema v2 (.cast) files via ConnectionManager's data funnel. */
class RecordingServiceImpl {
  private active = new Map<string, ActiveRec>()

  private dir(): string {
    const d = join(app.getPath('userData'), 'recordings')
    mkdirSync(d, { recursive: true })
    return d
  }

  start(tabId: string, sessionId: number | null, sessionName: string, cols = 80, rows = 24): number {
    if (this.active.has(tabId)) return this.active.get(tabId)!.recordingId
    const safeName = sessionName.replace(/[^a-z0-9_-]/gi, '_')
    const path = join(this.dir(), `${safeName}-${Date.now()}.cast`)
    const stream = createWriteStream(path, { flags: 'w' })

    const header = {
      version: 2,
      width: cols,
      height: rows,
      timestamp: Math.floor(Date.now() / 1000),
      env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
      title: sessionName
    }
    stream.write(JSON.stringify(header) + '\n')

    const recordingId = recordingsRepo.create(sessionId, sessionName, path)
    const startedAt = Date.now()
    this.active.set(tabId, { recordingId, stream, startedAt, path })

    ConnectionManager.attachRecorder(tabId, (data) => {
      const t = (Date.now() - startedAt) / 1000
      this.active.get(tabId)?.stream.write(JSON.stringify([t, 'o', data]) + '\n')
    })
    return recordingId
  }

  stop(tabId: string): void {
    const rec = this.active.get(tabId)
    if (!rec) return
    ConnectionManager.detachRecorder(tabId)
    rec.stream.end()
    recordingsRepo.finish(rec.recordingId, Date.now() - rec.startedAt)
    this.active.delete(tabId)
    this.enforceStorageCap()
  }

  isRecording(tabId: string): boolean {
    return this.active.has(tabId)
  }

  read(id: number): string {
    const rec = recordingsRepo.get(id)
    if (!rec?.cast_path || !existsSync(rec.cast_path)) throw new Error('Recording file not found')
    return readFileSync(rec.cast_path, 'utf8')
  }

  delete(id: number): void {
    const rec = recordingsRepo.get(id)
    if (rec?.cast_path && existsSync(rec.cast_path)) {
      try {
        unlinkSync(rec.cast_path)
      } catch {
        /* ignore */
      }
    }
    recordingsRepo.delete(id)
  }

  /** Prune oldest recordings when total size exceeds the configured cap (MB). */
  private enforceStorageCap(): void {
    const capMb = Number(settingsRepo.get('recording.maxStorageMb') ?? '0')
    if (!capMb) return
    const dir = this.dir()
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.cast'))
      .map((f) => ({ f, full: join(dir, f), ...statSync(join(dir, f)) }))
      .sort((a, b) => a.mtimeMs - b.mtimeMs)
    let total = files.reduce((s, x) => s + x.size, 0)
    const capBytes = capMb * 1024 * 1024
    for (const file of files) {
      if (total <= capBytes) break
      try {
        unlinkSync(file.full)
        total -= file.size
      } catch {
        /* ignore */
      }
    }
  }
}

export const RecordingService = new RecordingServiceImpl()
