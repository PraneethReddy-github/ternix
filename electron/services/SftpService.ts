import crypto from 'node:crypto'
import { createReadStream, createWriteStream, statSync, utimesSync } from 'node:fs'
import { basename, posix } from 'node:path'
import type { SFTPWrapper, Stats } from 'ssh2'
import type { SftpEntry, TransferProgress } from '@shared/index'
import { ConnectionManager } from './ConnectionManager'
import { settingsRepo } from '../db/repo'
import { Bus } from './bus'

function modeToPermissions(mode: number): string {
  const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  const o = (mode >> 6) & 7
  const g = (mode >> 3) & 7
  const w = mode & 7
  return types[o] + types[g] + types[w]
}

function entryType(mode: number): SftpEntry['type'] {
  const fmt = mode & 0o170000
  if (fmt === 0o040000) return 'directory'
  if (fmt === 0o120000) return 'symlink'
  if (fmt === 0o100000) return 'file'
  return 'other'
}

interface ActiveTransfer {
  paused: boolean
  cancelled: boolean
  pauseFn?: () => void
  resumeFn?: () => void
  destroyFn?: () => void
}

class SftpServiceImpl {
  private wrappers = new Map<string, SFTPWrapper>()
  private transfers = new Map<string, ActiveTransfer>()

  // Concurrency gate honouring transfer.maxConcurrent.
  private active = 0
  private waiters: (() => void)[] = []
  private maxConcurrent(): number {
    return Math.max(1, Number(settingsRepo.get('transfer.maxConcurrent') ?? '3') || 3)
  }
  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent()) {
      this.active++
      return
    }
    await new Promise<void>((res) => this.waiters.push(res))
    this.active++
  }
  private release(): void {
    this.active--
    this.waiters.shift()?.()
  }
  private preserveTimestamps(): boolean {
    return settingsRepo.get('transfer.preserveTimestamps') !== 'false'
  }

  private async wrapper(tabId: string): Promise<SFTPWrapper> {
    const existing = this.wrappers.get(tabId)
    if (existing) return existing
    const backend = ConnectionManager.get(tabId)
    const client = backend?.getSshClient?.()
    if (!client) throw new Error('No SSH connection for this tab')
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, s) => (err ? reject(err) : resolve(s)))
    })
    this.wrappers.set(tabId, sftp)
    return sftp
  }

  async open(tabId: string): Promise<void> {
    await this.wrapper(tabId)
  }

  close(tabId: string): void {
    this.wrappers.delete(tabId)
  }

  async realpath(tabId: string, p: string): Promise<string> {
    const sftp = await this.wrapper(tabId)
    return new Promise((resolve, reject) => sftp.realpath(p || '.', (err, abs) => (err ? reject(err) : resolve(abs))))
  }

  async listDir(tabId: string, remotePath: string): Promise<SftpEntry[]> {
    const sftp = await this.wrapper(tabId)
    const dir = remotePath || '.'
    const list = await new Promise<any[]>((resolve, reject) => {
      sftp.readdir(dir, (err, l) => (err ? reject(err) : resolve(l)))
    })
    return list.map((item) => {
      const attrs: Stats = item.attrs
      return {
        name: item.filename,
        path: posix.join(dir, item.filename),
        type: entryType(attrs.mode),
        size: attrs.size ?? 0,
        mode: attrs.mode,
        permissions: modeToPermissions(attrs.mode),
        modified: (attrs.mtime ?? 0) * 1000,
        owner: String(attrs.uid ?? ''),
        group: String(attrs.gid ?? '')
      }
    })
  }

  async stat(tabId: string, remotePath: string): Promise<SftpEntry> {
    const sftp = await this.wrapper(tabId)
    const attrs = await new Promise<Stats>((resolve, reject) => sftp.stat(remotePath, (err, st) => (err ? reject(err) : resolve(st))))
    return {
      name: basename(remotePath),
      path: remotePath,
      type: entryType(attrs.mode),
      size: attrs.size ?? 0,
      mode: attrs.mode,
      permissions: modeToPermissions(attrs.mode),
      modified: (attrs.mtime ?? 0) * 1000,
      owner: String(attrs.uid ?? ''),
      group: String(attrs.gid ?? '')
    }
  }

  async mkdir(tabId: string, remotePath: string): Promise<void> {
    const sftp = await this.wrapper(tabId)
    await new Promise<void>((resolve, reject) => sftp.mkdir(remotePath, (err) => (err ? reject(err) : resolve())))
  }

  async delete(tabId: string, remotePath: string, isDir: boolean): Promise<void> {
    const sftp = await this.wrapper(tabId)
    if (isDir) await new Promise<void>((resolve, reject) => sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve())))
    else await new Promise<void>((resolve, reject) => sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve())))
  }

  async rename(tabId: string, oldPath: string, newPath: string): Promise<void> {
    const sftp = await this.wrapper(tabId)
    await new Promise<void>((resolve, reject) => sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve())))
  }

  async chmod(tabId: string, remotePath: string, mode: number): Promise<void> {
    const sftp = await this.wrapper(tabId)
    await new Promise<void>((resolve, reject) => sftp.chmod(remotePath, mode, (err) => (err ? reject(err) : resolve())))
  }

  // ---- transfers ----

  async download(tabId: string, remotePath: string, localPath: string): Promise<string> {
    await this.acquire()
    try {
      const sftp = await this.wrapper(tabId)
      const st = await this.stat(tabId, remotePath)
      const read = sftp.createReadStream(remotePath)
      const write = createWriteStream(localPath)
      const result = await this.runTransfer('download', basename(remotePath), localPath, remotePath, st.size, read, write)
      if (this.preserveTimestamps() && st.modified) {
        try { utimesSync(localPath, new Date(st.modified), new Date(st.modified)) } catch { /* best effort */ }
      }
      return result
    } finally {
      this.release()
    }
  }

  async upload(tabId: string, localPath: string, remotePath: string): Promise<string> {
    await this.acquire()
    try {
      const sftp = await this.wrapper(tabId)
      const st = statSync(localPath)
      const read = createReadStream(localPath)
      const write = sftp.createWriteStream(remotePath)
      const result = await this.runTransfer('upload', basename(localPath), localPath, remotePath, st.size, read, write)
      if (this.preserveTimestamps()) {
        const t = Math.floor(st.mtimeMs / 1000)
        try { await new Promise<void>((res) => sftp.utimes(remotePath, t, t, () => res())) } catch { /* best effort */ }
      }
      return result
    } finally {
      this.release()
    }
  }

  pause(transferId: string): void {
    this.transfers.get(transferId)?.pauseFn?.()
  }
  resume(transferId: string): void {
    this.transfers.get(transferId)?.resumeFn?.()
  }
  cancel(transferId: string): void {
    const t = this.transfers.get(transferId)
    if (t) {
      t.cancelled = true
      t.destroyFn?.()
    }
  }

  private runTransfer(
    direction: 'upload' | 'download',
    filename: string,
    localPath: string,
    remotePath: string,
    total: number,
    read: NodeJS.ReadableStream,
    write: NodeJS.WritableStream
  ): Promise<string> {
    const transferId = crypto.randomUUID()
    const state: ActiveTransfer = { paused: false, cancelled: false }
    state.pauseFn = () => {
      state.paused = true
      ;(read as any).pause?.()
    }
    state.resumeFn = () => {
      state.paused = false
      ;(read as any).resume?.()
    }
    state.destroyFn = () => {
      (read as any).destroy?.()
      ;(write as any).destroy?.()
    }
    this.transfers.set(transferId, state)

    let transferred = 0
    let lastEmit = Date.now()
    let lastBytes = 0

    const emit = (status: TransferProgress['status'], error?: string) => {
      const now = Date.now()
      const elapsed = (now - lastEmit) / 1000 || 1
      const bps = status === 'active' ? (transferred - lastBytes) / elapsed : 0
      const remaining = total - transferred
      const eta = bps > 0 ? remaining / bps : 0
      Bus.emit('sftp:progress', {
        transferId,
        direction,
        filename,
        localPath,
        remotePath,
        transferred,
        total,
        bytesPerSecond: Math.max(0, Math.round(bps)),
        etaSeconds: Math.round(eta),
        status,
        error
      } satisfies TransferProgress)
      if (status === 'active') {
        lastEmit = now
        lastBytes = transferred
      }
    }

    emit('pending')

    return new Promise<string>((resolve, reject) => {
      let firstChunk = true
      read.on('data', (chunk: Buffer) => {
        transferred += chunk.length
        if (firstChunk || Date.now() - lastEmit > 200) {
          firstChunk = false
          emit('active')
        }
      })
      const onDone = () => {
        if (!this.transfers.has(transferId)) return
        this.transfers.delete(transferId)
        if (state.cancelled) {
          emit('cancelled')
          reject(new Error('Transfer cancelled'))
        } else {
          transferred = total
          emit('done')
          resolve(direction === 'download' ? localPath : remotePath)
        }
      }
      write.on('finish', onDone)
      write.on('close', onDone)
      const onErr = (err: Error) => {
        if (!this.transfers.has(transferId)) return
        this.transfers.delete(transferId)
        emit(state.cancelled ? 'cancelled' : 'error', err.message)
        reject(err)
      }
      read.on('error', onErr)
      write.on('error', onErr)
      read.pipe(write)
    })
  }
}

export const SftpService = new SftpServiceImpl()
