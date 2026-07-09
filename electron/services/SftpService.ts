import crypto from 'node:crypto'
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs'
import { basename, join, posix } from 'node:path'
import type { SFTPWrapper, Stats } from 'ssh2'
import type { SftpEntry, TransferProgress } from '@shared/index'
import { ConnectionManager } from './ConnectionManager'
import { settingsRepo } from '../db/repo'
import { ownerFromLongname } from './sftpOwner'
import { summarize, TransferCancelledError } from './transferOutcome'
import { Bus } from './bus'

/**
 * Bytes per SFTP request. ssh2's SFTP streams issue exactly one READ (or WRITE) and wait
 * for the reply before issuing the next — there is no pipelining (see its own TODO above
 * WriteStream in lib/protocol/SFTP.js). So throughput is chunkSize/RTT, and the chunk size
 * is the entire story on a high-latency link. ssh2 defaults the read stream to 64 KiB and
 * clamps any request to OPENSSH_MAX_PKT_LEN - PKT_RW_OVERHEAD, so ask for exactly that.
 *
 * ponytail: still one request in flight. For fastGet-class throughput this needs a real
 * pipelined reader (N outstanding requests), which is the only way to beat RTT.
 */
const SFTP_CHUNK = 256 * 1024 - 2 * 1024 // 260096

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
        ...ownerFromLongname(item.longname, { owner: String(attrs.uid ?? ''), group: String(attrs.gid ?? '') })
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
    if (!isDir) {
      await new Promise<void>((resolve, reject) => sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve())))
      return
    }
    // rmdir only removes empty dirs — clear contents first (recursively).
    for (const e of await this.listDir(tabId, remotePath)) {
      await this.delete(tabId, e.path, e.type === 'directory')
    }
    await new Promise<void>((resolve, reject) => sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve())))
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
    const st = await this.stat(tabId, remotePath)
    if (st.type === 'directory') return this.downloadDir(tabId, remotePath, localPath)
    return this.downloadFile(tabId, remotePath, localPath)
  }

  // Enumerate the whole remote tree first, create every local dir (parents first),
  // then download every file through one queue — so acquire()/maxConcurrent packs
  // slots across the entire tree, not one folder at a time.
  // ponytail: whole tree is held in memory + one big Promise.all; a 100k-file tree
  // queues that many pending promises. Fine for real folders.
  private async downloadDir(tabId: string, remoteDir: string, localDir: string): Promise<string> {
    const dirs: string[] = []
    const files: Array<[string, string]> = [] // [remote, local]
    const walk = async (r: string, l: string): Promise<void> => {
      dirs.push(l)
      for (const e of await this.listDir(tabId, r)) {
        const dest = join(l, e.name)
        if (e.type === 'directory') await walk(e.path, dest)
        else files.push([e.path, dest])
      }
    }
    await walk(remoteDir, localDir)
    for (const d of dirs) mkdirSync(d, { recursive: true })
    // allSettled, not all: cancelling one file must leave the other files running and the
    // folder reported as finished-minus-that-file. Promise.all would reject on the first
    // cancellation and make the whole folder look like it failed.
    const outcome = summarize(await Promise.allSettled(files.map(([r, l]) => this.downloadFile(tabId, r, l))))
    if (outcome.failures.length) {
      throw new Error(`${outcome.failures.length} of ${files.length} file(s) failed: ${outcome.failures[0]}`)
    }
    return localDir
  }

  private async downloadFile(tabId: string, remotePath: string, localPath: string): Promise<string> {
    await this.acquire()
    try {
      const sftp = await this.wrapper(tabId)
      const st = await this.stat(tabId, remotePath)
      const read = sftp.createReadStream(remotePath, { highWaterMark: SFTP_CHUNK })
      const write = createWriteStream(localPath)
      // Cancelling leaves a truncated file that looks like a real one — drop it.
      const onCancel = () => { try { rmSync(localPath, { force: true }) } catch { /* best effort */ } }
      const result = await this.runTransfer('download', basename(remotePath), localPath, remotePath, st.size, read, write, onCancel)
      if (this.preserveTimestamps() && st.modified) {
        try { utimesSync(localPath, new Date(st.modified), new Date(st.modified)) } catch { /* best effort */ }
      }
      return result
    } finally {
      this.release()
    }
  }

  async upload(tabId: string, localPath: string, remotePath: string): Promise<string> {
    if (statSync(localPath).isDirectory()) return this.uploadDir(tabId, localPath, remotePath)
    return this.uploadFile(tabId, localPath, remotePath)
  }

  // Mirror of downloadDir: enumerate the whole local tree, mkdir every remote dir
  // (parents first), then upload every file through one maxConcurrent-gated queue.
  private async uploadDir(tabId: string, localDir: string, remoteDir: string): Promise<string> {
    const sftp = await this.wrapper(tabId)
    const dirs: string[] = [] // remote dir paths, parents first
    const files: Array<[string, string]> = [] // [local, remote]
    const walk = (l: string, r: string): void => {
      dirs.push(r)
      for (const name of readdirSync(l)) {
        const src = join(l, name)
        if (statSync(src).isDirectory()) walk(src, posix.join(r, name))
        else files.push([src, posix.join(r, name)])
      }
    }
    walk(localDir, remoteDir)
    for (const d of dirs) await new Promise<void>((res) => sftp.mkdir(d, () => res())) // ignore EEXIST — merge
    const outcome = summarize(await Promise.allSettled(files.map(([l, r]) => this.uploadFile(tabId, l, r))))
    if (outcome.failures.length) {
      throw new Error(`${outcome.failures.length} of ${files.length} file(s) failed: ${outcome.failures[0]}`)
    }
    return remoteDir
  }

  private async uploadFile(tabId: string, localPath: string, remotePath: string): Promise<string> {
    await this.acquire()
    try {
      const sftp = await this.wrapper(tabId)
      const st = statSync(localPath)
      // The chunk fs hands us becomes one WRITE request, so read in protocol-sized chunks.
      const read = createReadStream(localPath, { highWaterMark: SFTP_CHUNK })
      // Leave the write stream's highWaterMark at the default. Throughput is set by the
      // chunk size above (one chunk == one WRITE); a larger hwm only lets pipe buffer a
      // *second* chunk ahead, and pause/cancel then has to drain both before it bites.
      const write = sftp.createWriteStream(remotePath)
      const onCancel = () => sftp.unlink(remotePath, () => { /* best effort */ })
      const result = await this.runTransfer('upload', basename(localPath), localPath, remotePath, st.size, read, write, onCancel)
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
    write: NodeJS.WritableStream,
    onCancel?: () => void
  ): Promise<string> {
    const transferId = crypto.randomUUID()
    const state: ActiveTransfer = { paused: false, cancelled: false }
    state.pauseFn = () => {
      if (state.paused) return
      state.paused = true
      ;(read as any).pause?.()
      emit('paused')
    }
    state.resumeFn = () => {
      if (!state.paused) return
      state.paused = false
      ;(read as any).resume?.()
      emit('active')
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
      // ssh2's streams set emitClose:false and emit 'close' themselves once the remote
      // handle is shut (closeStream), so by the time we get here the destination handle
      // is closed and it is safe to delete the partial file.
      const settleCancelled = () => {
        onCancel?.()
        emit('cancelled')
        reject(new TransferCancelledError(filename))
      }
      const onDone = () => {
        if (!this.transfers.has(transferId)) return
        this.transfers.delete(transferId)
        if (state.cancelled) {
          settleCancelled()
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
        // A destroy() mid-flight can surface as a stream error; report the user's intent.
        if (state.cancelled) return settleCancelled()
        emit('error', err.message)
        reject(err)
      }
      read.on('error', onErr)
      write.on('error', onErr)
      read.pipe(write)
    })
  }
}

export const SftpService = new SftpServiceImpl()
