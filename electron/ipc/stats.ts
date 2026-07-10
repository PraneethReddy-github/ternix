import { handle } from './util'
import * as os from 'node:os'
import { readFileSync } from 'node:fs'
import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ConnectionManager } from '../services/ConnectionManager'
import { kelvinTenthsToCelsius, cpuDeltaPercent } from './statsCalc'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Non-blocking process helpers ───────────────────────────────────────────
// IMPORTANT: never use execSync here. This code runs on the Electron *main*
// process; a synchronous child-process call freezes the whole app (the window
// goes "Not Responding" on Windows when dragged) until the child returns.
// On Windows the local-stats commands spawn PowerShell/CIM, which can take
// hundreds of ms to seconds — so everything below is async + windowsHide.

/** Run a shell command (pipes/redirects allowed); returns stdout or '' on error. */
async function sh(cmd: string, timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 })
    return stdout.toString()
  } catch {
    return ''
  }
}

/** Run PowerShell with a script block, no shell-quoting headaches; '' on error. */
async function ps(script: string, timeoutMs: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }
    )
    return stdout.toString().trim()
  } catch {
    return ''
  }
}

/** ConvertTo-Json emits a bare object for a single item and an array for many. */
function psJsonArray(raw: string): any[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : [v]
  } catch {
    return []
  }
}

/**
 * Wrap an async producer with a short TTL cache so expensive Windows queries
 * (spawning PowerShell) don't run on every 3 s poll. Concurrent callers share a
 * single in-flight promise. On error we serve the last good value if we have one.
 */
function cached<T>(ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
  let at = 0
  let val: T | undefined
  let inflight: Promise<T> | null = null
  return () => {
    const now = Date.now()
    if (val !== undefined && now - at < ttlMs) return Promise.resolve(val)
    if (inflight) return inflight
    inflight = fn()
      .then((v) => {
        val = v
        at = Date.now()
        inflight = null
        return v
      })
      .catch((e) => {
        inflight = null
        if (val !== undefined) return val
        throw e
      })
    return inflight
  }
}

export interface StatsDisk { path: string; used: number; total: number; percent: number }
export interface StatsNet { iface: string; rxBytes: number; txBytes: number }
export interface StatsTemp { label: string; celsius: number }

export interface RemoteStats {
  cpu: number
  mem: { used: number; total: number; percent: number }
  swap: { used: number; total: number; percent: number }
  disk: StatsDisk[]
  net: StatsNet[]
  load: [number, number, number]
  uptimeSecs: number
  procs: number
  temps: StatsTemp[]
  topProcess?: { name: string; cpu: number; mem: number } | null
  source: 'local' | 'remote'
  hostname: string
}

// ── Local machine stats (Node.js) ─────────────────────────────────────────

let localLastCpu: { idle: number, total: number } | null = null

function cpuPercent(): Promise<number> {
  return new Promise((resolve) => {
    const current = os.cpus().map((c) => c.times)
    let idle = 0, total = 0
    for (const times of current) {
      idle += times.idle
      total += Object.values(times).reduce((a, b) => a + b, 0)
    }

    if (!localLastCpu) {
      localLastCpu = { idle, total }
      setTimeout(() => {
        const next = os.cpus().map((c) => c.times)
        let i2 = 0, t2 = 0
        for (const times of next) {
          i2 += times.idle
          t2 += Object.values(times).reduce((a, b) => a + b, 0)
        }
        localLastCpu = { idle: i2, total: t2 }
        const dt = t2 - total
        resolve(dt === 0 ? 0 : Math.round((1 - (i2 - idle) / dt) * 1000) / 10)
      }, 150)
      return
    }

    const dt = total - localLastCpu.total
    const di = idle - localLastCpu.idle
    localLastCpu = { idle, total }
    resolve(dt === 0 ? 0 : Math.round((1 - di / dt) * 1000) / 10)
  })
}

async function localDisk(): Promise<StatsDisk[]> {
  try {
    if (process.platform === 'win32') {
      // Win32_LogicalDisk DriveType=3 → local fixed disks. Get-CimInstance replaces
      // the deprecated `wmic` (removed on newer Windows) and is faster.
      const raw = await ps(
        "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress",
        5000
      )
      return psJsonArray(raw).flatMap((d) => {
        const total = Number(d.Size), avail = Number(d.FreeSpace)
        if (!total) return []
        const used = total - avail
        return [{ path: d.DeviceID, used, total, percent: Math.round(used / total * 100) }]
      }).slice(0, 4)
    } else {
      const out = await sh('df -B1 --output=used,size,target 2>/dev/null || df -k', 3000)
      return out.split('\n').slice(1).filter(Boolean).flatMap((l) => {
        const p = l.trim().split(/\s+/)
        if (p.length < 3) return []
        const path = p[p.length - 1]
        if (['/sys', '/proc', '/dev', '/run', '/snap'].some((x) => path.startsWith(x))) return []
        const [used, total] = [Number(p[0]), Number(p[1])]
        if (!total) return []
        return [{ path, used, total, percent: Math.round(used / total * 100) }]
      }).slice(0, 4)
    }
  } catch {
    return []
  }
}

async function localNet(): Promise<StatsNet[]> {
  try {
    if (process.platform === 'linux') {
      // /proc/net/dev has cumulative rx/tx byte counters (instant file read, no subprocess).
      const raw = readFileSync('/proc/net/dev', 'utf8')
      return raw.split('\n').slice(2).flatMap((line) => {
        if (!line.includes(':')) return []
        const [ifacePart, data] = line.split(':', 2)
        const iface = ifacePart.trim()
        if (iface === 'lo') return []
        const vals = data.trim().split(/\s+/)
        if (vals.length < 9) return []
        return [{ iface, rxBytes: Number(vals[0]), txBytes: Number(vals[8]) }]
      }).slice(0, 4)
    } else if (process.platform === 'win32') {
      const raw = await ps(
        'Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress',
        4000
      )
      return psJsonArray(raw).map((x) => ({
        iface: x.Name,
        rxBytes: x.ReceivedBytes ?? 0,
        txBytes: x.SentBytes ?? 0
      })).slice(0, 4)
    } else if (process.platform === 'darwin') {
      const raw = await sh('netstat -ib', 3000)
      const seen = new Set<string>()
      return raw.split('\n').slice(1).flatMap((line) => {
        const p = line.trim().split(/\s+/)
        if (p.length < 10) return []
        const iface = p[0].replace(/\d+$/, '')
        if (iface === 'lo' || seen.has(iface)) return []
        seen.add(iface)
        return [{ iface, rxBytes: Number(p[6]) || 0, txBytes: Number(p[9]) || 0 }]
      }).slice(0, 4)
    }
  } catch { /* fall through */ }
  // Fallback: return interface names only (delta will be 0)
  return Object.keys(os.networkInterfaces())
    .filter((n) => n !== 'lo')
    .map((iface) => ({ iface, rxBytes: 0, txBytes: 0 }))
    .slice(0, 4)
}

function linuxTemps(): StatsTemp[] {
  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    return readdirSync('/sys/class/thermal')
      .filter((z: string) => z.startsWith('thermal_zone'))
      .flatMap((zone: string) => {
        try {
          const celsius = parseInt(readFileSync(`/sys/class/thermal/${zone}/temp`, 'utf8')) / 1000
          return [{ label: zone, celsius: Math.round(celsius * 10) / 10 }]
        } catch { return [] }
      }).slice(0, 4)
  } catch { return [] }
}

/**
 * Best-effort CPU temperature on Windows via the ACPI thermal zone (root/wmi). Many
 * desktops don't expose MSAcpi_ThermalZoneTemperature at all (and some need admin), so
 * this legitimately returns [] on those machines — Windows has no userland API for core
 * temps without a kernel driver. Cached because it spawns PowerShell and temperature
 * moves slowly.
 */
async function winTemps(): Promise<StatsTemp[]> {
  const raw = await ps(
    'Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | ' +
      'Select-Object InstanceName,CurrentTemperature | ConvertTo-Json -Compress',
    5000
  )
  return psJsonArray(raw).flatMap((z, i) => {
    const celsius = kelvinTenthsToCelsius(Number(z.CurrentTemperature))
    // Firmware that doesn't really implement the sensor tends to report 0 K or garbage.
    if (!(celsius > 0) || celsius > 150) return []
    const tail = typeof z.InstanceName === 'string' ? z.InstanceName.split('\\').pop() : ''
    return [{ label: tail || `Thermal zone ${i}`, celsius }]
  }).slice(0, 4)
}

const winTempsCached = cached(30_000, winTemps)

function localTemps(): Promise<StatsTemp[]> {
  if (process.platform === 'linux') return Promise.resolve(linuxTemps())
  if (process.platform === 'win32') return winTempsCached()
  return Promise.resolve([])
}

type ProcSample = { cpu: number; name: string; mem: number }
let localProcsState: { time: number; procs: Map<number, ProcSample> } | null = null

/** Snapshot every process's cumulative CPU seconds (+ name/mem), keyed by PID. */
async function winProcSnapshot(): Promise<Map<number, ProcSample> | null> {
  const raw = await ps('Get-Process | Select-Object Id,Name,CPU,WorkingSet | ConvertTo-Json -Compress', 3000)
  if (!raw) return null
  const map = new Map<number, ProcSample>()
  for (const p of psJsonArray(raw)) {
    if (p.CPU == null || p.Name === 'Idle') continue
    map.set(p.Id, { cpu: p.CPU, name: p.Name, mem: p.WorkingSet || 0 })
  }
  return map
}

async function localTopProcess(): Promise<{ name: string; cpu: number; mem: number } | null> {
  try {
    if (process.platform === 'win32') {
      // %CPU needs a delta of cumulative CPU seconds between two samples. On the very
      // first call there's no baseline, so take a quick second sample right away —
      // otherwise the top process shows nothing until the next poll (~15 s later),
      // while Linux/macOS get it instantly from `ps`.
      if (!localProcsState) {
        const first = await winProcSnapshot()
        if (!first) return null
        localProcsState = { time: Date.now(), procs: first }
        await sleep(300)
      }
      const current = await winProcSnapshot()
      if (!current) return null
      const now = Date.now()
      const dtSec = (now - localProcsState.time) / 1000
      let topProc: { name: string; cpu: number; mem: number } | null = null
      let maxPct = -1
      for (const [id, p] of current) {
        const old = localProcsState.procs.get(id)
        if (!old || p.cpu < old.cpu) continue
        const pct = cpuDeltaPercent(p.cpu - old.cpu, dtSec, os.cpus().length)
        if (pct > maxPct) {
          maxPct = pct
          topProc = { name: p.name, cpu: pct, mem: p.mem }
        }
      }
      localProcsState = { time: now, procs: current }
      return topProc
    } else if (process.platform === 'darwin') {
      const raw = (await sh('ps -rc -eo pcpu,pmem,comm | head -n 2 | tail -n 1', 3000)).trim()
      const m = raw.match(/^([\d.]+)\s+([\d.]+)\s+(.*)$/)
      return m ? { name: m[3].split(/\s+/)[0].split('/').pop() || '', cpu: Number(m[1]), mem: Number(m[2]) } : null
    } else {
      const raw = (await sh('ps -c -eo pcpu,pmem,comm --sort=-pcpu | head -n 2 | tail -n 1', 3000)).trim()
      const m = raw.match(/^([\d.]+)\s+([\d.]+)\s+(.*)$/)
      return m ? { name: m[3].split(/\s+/)[0].split('/').pop() || '', cpu: Number(m[1]), mem: Number(m[2]) } : null
    }
  } catch { return null }
}

// Disk usage and the top process change slowly and are the most expensive to
// query (each spawns PowerShell on Windows); cache them so the 3 s poll only
// refreshes them occasionally. Network counters must stay fresh every poll so
// the byte-rate delta in the status bar is correct.
const diskCached = cached(30_000, localDisk)
const topCached = cached(15_000, localTopProcess)

async function getLocalStats(): Promise<RemoteStats> {
  // All child processes run concurrently and non-blockingly; the main process
  // stays responsive while they resolve.
  const [cpu, disk, net, topProcess, temps] = await Promise.all([
    cpuPercent(),
    diskCached(),
    localNet(),
    topCached(),
    localTemps()
  ])
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const loadAvg = os.loadavg() as [number, number, number]

  return {
    cpu,
    mem: { used: usedMem, total: totalMem, percent: Math.round(usedMem / totalMem * 1000) / 10 },
    swap: { used: 0, total: 0, percent: 0 },
    disk,
    net,
    load: [Math.round(loadAvg[0] * 100) / 100, Math.round(loadAvg[1] * 100) / 100, Math.round(loadAvg[2] * 100) / 100],
    uptimeSecs: os.uptime(),
    procs: 0,
    temps,
    topProcess,
    source: 'local',
    hostname: os.hostname()
  }
}

// ── Remote SSH stats ───────────────────────────────────────────────────────
// Sent as a heredoc so Python sees clean indented code (no shell escaping issues).
// Each function has its own try/except so one failure doesn't zero everything out.
// THE ROOT BUG IN THE PREVIOUS VERSION: mem() used v.split(':')[1] but v is
// already the value after the colon split — it has no colon. Fixed: val.split()[0].

const REMOTE_CMD = [
  "python3 <<'__PYEOF__'",
  'import json, os, time, glob, subprocess, sys',
  '',
  'def cpu_pct():',
  '    try:',
  '        def rd():',
  '            p = open("/proc/stat").readline().split()',
  '            v = list(map(int, p[1:]))',
  '            return v[3]+v[4], sum(v)',
  '        i2,t2 = rd()',
  '        tmp = f"/tmp/.tnx_cpu_{os.getuid()}"',
  '        try:',
  '            i1,t1 = map(int, open(tmp).read().split())',
  '        except:',
  '            time.sleep(0.2); i1,t1 = i2,t2; i2,t2 = rd()',
  '        open(tmp, "w").write(f"{i2} {t2}")',
  '        dt = t2-t1',
  '        return round(100.0*(1.0-(i2-i1)/dt),1) if dt > 0 else 0.0',
  '    except: return 0.0',
  '',
  'def mem_info():',
  '    try:',
  '        m = {}',
  '        for line in open("/proc/meminfo"):',
  '            if ":" not in line: continue',
  '            key, val = line.split(":", 1)',
  '            try: m[key.strip()] = int(val.split()[0])',
  '            except: pass',
  '        tot=m.get("MemTotal",0); av=m.get("MemAvailable",0)',
  '        st=m.get("SwapTotal",0); sf=m.get("SwapFree",0)',
  '        used=tot-av; su=st-sf',
  '        return {"total":tot*1024,"used":used*1024,"pct":round(100.0*used/tot,1) if tot else 0.0,',
  '                "stot":st*1024,"sused":su*1024,"spct":round(100.0*su/st,1) if st else 0.0}',
  '    except: return {"total":0,"used":0,"pct":0.0,"stot":0,"sused":0,"spct":0.0}',
  '',
  'def disk_info():',
  '    r=[]',
  '    try:',
  '        skip={"/sys","/proc","/dev","/run","/snap"}',
  '        raw=subprocess.check_output(["df","-B1","--output=used,size,target"],stderr=subprocess.DEVNULL).decode()',
  '        for line in raw.splitlines()[1:]:',
  '            p=line.split()',
  '            if len(p)!=3: continue',
  '            path=p[2]',
  '            if any(path.startswith(s) for s in skip): continue',
  '            u,s=int(p[0]),int(p[1])',
  '            if s==0: continue',
  '            r.append({"path":path,"used":u,"total":s,"pct":round(100.0*u/s,1)})',
  '    except: pass',
  '    return r[:4]',
  '',
  'def net_info():',
  '    r=[]',
  '    try:',
  '        for line in open("/proc/net/dev").readlines()[2:]:',
  '            if ":" not in line: continue',
  '            iface,data=line.split(":",1)',
  '            iface=iface.strip()',
  '            if iface=="lo": continue',
  '            v=data.split()',
  '            if len(v)>=9: r.append({"iface":iface,"rx":int(v[0]),"tx":int(v[8])})',
  '    except: pass',
  '    return r',
  '',
  'def load_avg():',
  '    try: return [round(float(x),2) for x in open("/proc/loadavg").read().split()[:3]]',
  '    except: return [0.0,0.0,0.0]',
  '',
  'def uptime_s():',
  '    try: return float(open("/proc/uptime").read().split()[0])',
  '    except: return 0.0',
  '',
  'def proc_count():',
  '    try: return len([x for x in os.listdir("/proc") if x.isdigit()])',
  '    except: return 0',
  '',
  'def temps():',
  '    r=[]',
  '    for f in glob.glob("/sys/class/thermal/thermal_zone*/temp"):',
  '        try:',
  '            c=round(int(open(f).read().strip())/1000.0,1)',
  '            r.append({"label":f.split("/")[-2],"c":c})',
  '        except: pass',
  '    return r[:4]',
  '',
  'def hostname():',
  '    try: return open("/etc/hostname").read().strip()',
  '    except:',
  '        try: import socket; return socket.gethostname()',
  '        except: return "unknown"',
  '',
  'def top_proc():',
  '    try:',
  '        raw = subprocess.check_output(["ps", "-c", "-eo", "pcpu,pmem,comm", "--sort=-pcpu"], stderr=subprocess.DEVNULL).decode().strip().split("\\n")',
  '        if len(raw) > 1:',
  '            p = raw[1].strip().split(None, 2)',
  '            if len(p) >= 3:',
  '                return {"name": p[2].split()[0].split("/")[-1], "cpu": float(p[0]), "mem": float(p[1])}',
  '    except: pass',
  '    return None',
  '',
  'm=mem_info()',
  'print(json.dumps({"cpu":cpu_pct(),"m":m,"disk":disk_info(),"net":net_info(),',
  '    "load":load_avg(),"up":uptime_s(),"procs":proc_count(),"temps":temps(),"host":hostname(),"top":top_proc()}))',
  'sys.stdout.flush()',
  "__PYEOF__",
].join('\n')

function execOnSsh(tabId: string, cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const backend = ConnectionManager.get(tabId)
    const client = backend?.getSshClient?.()
    if (!client) { reject(new Error('No SSH connection')); return }
    const timer = setTimeout(() => reject(new Error('Stats command timed out after 12s')), 12_000)
    client.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return }
      let out = ''
      let errOut = ''
      stream.on('data', (d: Buffer) => { out += d.toString() })
      stream.stderr?.on('data', (d: Buffer) => { errOut += d.toString() })
      stream.on('close', () => {
        clearTimeout(timer)
        const combined = out.trim()
        if (!combined && errOut) reject(new Error(`Remote error: ${errOut.slice(0, 200)}`))
        else resolve(combined)
      })
      stream.resume()
    })
  })
}

async function getRemoteStats(tabId: string): Promise<RemoteStats> {
  const raw = await execOnSsh(tabId, REMOTE_CMD)
  // Find the last line that looks like a JSON object (handles any banner/motd lines)
  const jsonLine = raw.split('\n').reverse().find((l) => l.trim().startsWith('{'))
  if (!jsonLine) throw new Error(`No JSON stats from server.\nOutput was: ${raw.slice(0, 300)}`)
  const d = JSON.parse(jsonLine)
  return {
    cpu: d.cpu ?? 0,
    mem: { used: d.m?.used ?? 0, total: d.m?.total ?? 0, percent: d.m?.pct ?? 0 },
    swap: { used: d.m?.sused ?? 0, total: d.m?.stot ?? 0, percent: d.m?.spct ?? 0 },
    disk: (d.disk ?? []).map((x: any) => ({ path: x.path, used: x.used, total: x.total, percent: x.pct })),
    net: (d.net ?? []).map((x: any) => ({ iface: x.iface, rxBytes: x.rx, txBytes: x.tx })),
    load: d.load ?? [0, 0, 0],
    uptimeSecs: d.up ?? 0,
    procs: d.procs ?? 0,
    temps: (d.temps ?? []).map((x: any) => ({ label: x.label, celsius: x.c })),
    topProcess: d.top ?? null,
    source: 'remote',
    hostname: d.host ?? ''
  }
}

// ── IPC registration ──────────────────────────────────────────────────────

export function registerStatsHandlers(): void {
  // tabId = null → local machine stats; tabId = paneId → remote SSH stats
  handle<RemoteStats>('stats:fetch', async (tabId: string | null) => {
    if (!tabId) return getLocalStats()
    return getRemoteStats(tabId)
  })
}
