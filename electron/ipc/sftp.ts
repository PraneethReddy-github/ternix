import { handle } from './util'
import { homedir } from 'node:os'
import { readdirSync, mkdirSync, rmSync, renameSync, lstatSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import type { SftpEntry } from '@shared/index'
import { SftpService } from '../services/SftpService'
import { ConnectionManager } from '../services/ConnectionManager'

function localModePerms(mode: number): string {
  const t = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  return t[(mode >> 6) & 7] + t[(mode >> 3) & 7] + t[mode & 7]
}

function listLocal(dir: string): SftpEntry[] {
  // Resolve to absolute path — handles relative inputs and Windows drive roots
  const absDir = resolvePath(dir)
  let names: string[]
  try {
    names = readdirSync(absDir)
  } catch {
    return []
  }
  const out: SftpEntry[] = []
  for (const name of names) {
    const full = join(absDir, name)
    try {
      const st = lstatSync(full)
      out.push({
        name,
        path: full,
        type: st.isDirectory() ? 'directory' : st.isSymbolicLink() ? 'symlink' : st.isFile() ? 'file' : 'other',
        size: st.size,
        mode: st.mode,
        permissions: localModePerms(st.mode),
        modified: st.mtimeMs,
        owner: String(st.uid ?? ''),
        group: String(st.gid ?? '')
      })
    } catch {
      /* skip unreadable entries (Windows system files, junctions, etc.) */
    }
  }
  return out
}

export function registerSftpHandlers(): void {
  // Remote (SFTP)
  handle<void>('sftp:open', (tabId: string) => SftpService.open(tabId))
  handle<SftpEntry[]>('sftp:listDir', (tabId: string, p: string) => SftpService.listDir(tabId, p))
  handle<string>('sftp:realpath', (tabId: string, p: string) => SftpService.realpath(tabId, p))
  handle<string | null>('sftp:cwd', (tabId: string) => ConnectionManager.getCwd(tabId))
  handle<string>('sftp:download', (tabId: string, r: string, l: string) => SftpService.download(tabId, r, l))
  handle<string>('sftp:upload', (tabId: string, l: string, r: string) => SftpService.upload(tabId, l, r))
  handle<void>('sftp:mkdir', (tabId: string, p: string) => SftpService.mkdir(tabId, p))
  handle<void>('sftp:delete', (tabId: string, p: string, isDir: boolean) => SftpService.delete(tabId, p, isDir))
  handle<void>('sftp:rename', (tabId: string, o: string, n: string) => SftpService.rename(tabId, o, n))
  handle<void>('sftp:chmod', (tabId: string, p: string, mode: number) => SftpService.chmod(tabId, p, mode))
  handle<SftpEntry>('sftp:stat', (tabId: string, p: string) => SftpService.stat(tabId, p))
  handle<void>('sftp:pause', (id: string) => SftpService.pause(id))
  handle<void>('sftp:resume', (id: string) => SftpService.resume(id))
  handle<void>('sftp:cancel', (id: string) => SftpService.cancel(id))

  // Local filesystem (left pane)
  handle<SftpEntry[]>('localfs:listDir', (p: string) => listLocal(p || homedir()))
  handle<string>('localfs:home', () => homedir())
  handle<void>('localfs:mkdir', (p: string) => void mkdirSync(p, { recursive: true }))
  handle<void>('localfs:delete', (p: string, isDir: boolean) => rmSync(p, { recursive: isDir, force: true }))
  handle<void>('localfs:rename', (o: string, n: string) => renameSync(o, n))
}
