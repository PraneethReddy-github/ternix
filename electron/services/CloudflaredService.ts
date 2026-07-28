import { createWriteStream } from 'node:fs'
import { access, chmod, mkdir, rename, rm, stat } from 'node:fs/promises'
import { accessSync, constants as fsConstants } from 'node:fs'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { app } from 'electron'
import type { CloudflaredStatus } from '@shared/index'
import { Bus } from './bus'

/**
 * Raw single-file builds Cloudflare publishes on every release. macOS is the odd one
 * out — it only ships a .tgz, so that platform takes an extra extract step.
 */
const ASSETS: Record<string, string> = {
  'win32-x64': 'cloudflared-windows-amd64.exe',
  'win32-arm64': 'cloudflared-windows-amd64.exe', // no native arm64 build; runs under emulation
  'win32-ia32': 'cloudflared-windows-386.exe',
  'linux-x64': 'cloudflared-linux-amd64',
  'linux-arm64': 'cloudflared-linux-arm64',
  'linux-arm': 'cloudflared-linux-arm',
  'linux-ia32': 'cloudflared-linux-386',
  'darwin-x64': 'cloudflared-darwin-amd64.tgz',
  'darwin-arm64': 'cloudflared-darwin-arm64.tgz'
}

const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download'

/**
 * Finds — and if need be installs — the `cloudflared` binary that publishes phone access
 * over HTTPS.
 *
 * Shipping a ~40 MB binary per platform inside the installer would quadruple the download
 * for the majority of users who never leave their LAN, and would still be wrong on any
 * architecture we didn't guess. Instead the binary is fetched once, on demand, into the
 * app's own data directory — so it survives updates, needs no admin rights, and never
 * depends on the user having run a package manager.
 */
class CloudflaredServiceImpl {
  private installing: Promise<string> | null = null
  private progress = 0

  /** Where a Ternix-managed copy lives. Outside asar, writable, survives app updates. */
  private managedPath(): string {
    const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    return join(app.getPath('userData'), 'bin', name)
  }

  /**
   * Locate an executable cloudflared. Prefers our managed copy, then PATH.
   *
   * Electron on Linux launched from a .desktop file inherits a minimal PATH that often
   * excludes /usr/local/bin, /snap/bin and ~/.local/bin — so a bare `spawn('cloudflared')`
   * fails even when the binary is installed. Probe those explicitly.
   */
  resolve(): string | null {
    const managed = this.managedPath()
    if (this.isExecutable(managed)) return managed

    const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    const sep = process.platform === 'win32' ? ';' : ':'
    const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
    const extra =
      process.platform === 'win32'
        ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'cloudflared')]
        : ['/usr/local/bin', '/usr/bin', '/bin', '/snap/bin', '/opt/homebrew/bin', join(home, '.local/bin'), join(home, 'bin')]

    for (const dir of (process.env.PATH ?? '').split(sep).concat(extra)) {
      if (!dir) continue
      const candidate = join(dir, exe)
      if (this.isExecutable(candidate)) return candidate
    }
    return null
  }

  private isExecutable(p: string): boolean {
    try {
      accessSync(p, process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK)
      return true
    } catch {
      return false
    }
  }

  status(): CloudflaredStatus {
    const path = this.resolve()
    return {
      installed: !!path,
      path,
      managed: path === this.managedPath(),
      supported: !!ASSETS[`${process.platform}-${process.arch}`],
      installing: !!this.installing,
      progress: this.progress
    }
  }

  private emit(): void {
    Bus.emit('mobile:cloudflared', this.status())
  }

  /** Resolve the binary, downloading it first if this machine doesn't have one. */
  async ensure(): Promise<string> {
    return this.resolve() ?? (await this.install())
  }

  /**
   * Download the platform's build into the app data dir. Concurrent callers share one
   * download; a partial file is written alongside and only renamed into place once the
   * binary has proven it can run.
   */
  install(): Promise<string> {
    if (this.installing) return this.installing
    this.installing = this.doInstall().finally(() => {
      this.installing = null
      this.progress = 0
      this.emit()
    })
    this.emit()
    return this.installing
  }

  private async doInstall(): Promise<string> {
    const key = `${process.platform}-${process.arch}`
    const asset = ASSETS[key]
    if (!asset) throw new Error(`Cloudflare does not publish a cloudflared build for ${key}`)

    const dest = this.managedPath()
    await mkdir(join(dest, '..'), { recursive: true })
    const tmp = `${dest}.download`
    await rm(tmp, { force: true })

    const res = await fetch(`${RELEASE_BASE}/${asset}`, { redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`)

    const total = Number(res.headers.get('content-length')) || 0
    let seen = 0
    this.progress = 0
    // Counting has to happen *inside* the pipeline: a bare 'data' listener would put the
    // stream in flowing mode before the file is piped, and the first chunks would be lost.
    const count = new Transform({
      transform: (chunk, _enc, cb) => {
        seen += chunk.length
        const pct = total ? Math.round((seen / total) * 100) : 0
        // Only republish on whole-percent moves — a 40 MB download is thousands of chunks.
        if (pct !== this.progress) {
          this.progress = pct
          this.emit()
        }
        cb(null, chunk)
      }
    })
    await pipeline(Readable.fromWeb(res.body as any), count, createWriteStream(tmp))

    if (asset.endsWith('.tgz')) await this.untar(tmp, dest)
    else await rename(tmp, dest)
    await rm(tmp, { force: true })

    if (process.platform !== 'win32') await chmod(dest, 0o755)

    // A truncated or HTML-error-page download passes every check above; running it is
    // the only proof we actually have cloudflared.
    try {
      await this.version(dest)
    } catch (err: any) {
      await rm(dest, { force: true })
      throw new Error(`Downloaded file is not a working cloudflared: ${err.message}`)
    }

    this.emit()
    return dest
  }

  /** macOS ships a tarball containing a single `cloudflared` binary. */
  private async untar(tgz: string, dest: string): Promise<void> {
    const dir = join(dest, '..')
    await new Promise<void>((resolve, reject) => {
      execFile('tar', ['-xzf', tgz, '-C', dir], (err) => (err ? reject(err) : resolve()))
    })
    const extracted = join(dir, 'cloudflared')
    await access(extracted)
    if (extracted !== dest) await rename(extracted, dest)
  }

  private version(binary: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      proc.stdout?.on('data', (d) => (out += d))
      proc.stderr?.on('data', (d) => (out += d))
      proc.on('error', reject)
      const timer = setTimeout(() => {
        try {
          proc.kill()
        } catch {
          /* ignore */
        }
        reject(new Error('timed out'))
      }, 15_000)
      proc.on('exit', (code, signal) => {
        clearTimeout(timer)
        if (code === 0 && /cloudflared/i.test(out)) resolve(out.trim())
        else reject(new Error(out.trim().slice(0, 200) || `exited ${code ?? `on signal ${signal}`}`))
      })
    })
  }

  /** Remove the managed copy — lets a user re-download a corrupt one. */
  async uninstall(): Promise<void> {
    await rm(this.managedPath(), { force: true })
    this.emit()
  }

  /** Bytes on disk for the managed copy, for the settings UI. 0 when not installed. */
  async managedSize(): Promise<number> {
    try {
      return (await stat(this.managedPath())).size
    } catch {
      return 0
    }
  }
}

export const CloudflaredService = new CloudflaredServiceImpl()
