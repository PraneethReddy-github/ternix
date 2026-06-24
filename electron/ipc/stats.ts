import { handle } from './util'
import * as os from 'node:os'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { ConnectionManager } from '../services/ConnectionManager'

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

function cpuPercent(): Promise<number> {
  return new Promise((resolve) => {
    const start = os.cpus().map((c) => c.times)
    setTimeout(() => {
      const end = os.cpus().map((c) => c.times)
      let idle = 0, total = 0
      for (let i = 0; i < start.length; i++) {
        const ds = end[i].idle - start[i].idle
        const dt = Object.values(end[i]).reduce((a, b) => a + b, 0) -
                   Object.values(start[i]).reduce((a, b) => a + b, 0)
        idle += ds
        total += dt
      }
      resolve(total === 0 ? 0 : Math.round((1 - idle / total) * 1000) / 10)
    }, 150)
  })
}

function localDisk(): StatsDisk[] {
  try {
    if (process.platform === 'win32') {
      const out = execSync('wmic logicaldisk get size,freespace,caption', { timeout: 3000 }).toString()
      return out.split('\n').slice(1).filter(Boolean).flatMap((l) => {
        const p = l.trim().split(/\s+/)
        if (p.length < 3) return []
        const [caption, free, size] = p
        const total = Number(size), avail = Number(free)
        if (!total) return []
        const used = total - avail
        return [{ path: caption, used, total, percent: Math.round(used / total * 100) }]
      }).slice(0, 4)
    } else {
      const out = execSync('df -B1 --output=used,size,target 2>/dev/null || df -k', { timeout: 3000 }).toString()
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

function localNet(): StatsNet[] {
  try {
    if (process.platform === 'linux') {
      // /proc/net/dev has cumulative rx/tx byte counters
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
      // PowerShell: Get-NetAdapterStatistics
      const raw = execSync(
        'powershell -NoProfile -Command "Get-NetAdapterStatistics | Select-Object -Property Name,ReceivedBytes,SentBytes | ConvertTo-Json -Compress"',
        { timeout: 4000 }
      ).toString().trim()
      const arr = JSON.parse(raw.startsWith('[') ? raw : `[${raw}]`)
      return (arr as any[]).map((x: any) => ({
        iface: x.Name,
        rxBytes: x.ReceivedBytes ?? 0,
        txBytes: x.SentBytes ?? 0
      })).slice(0, 4)
    } else if (process.platform === 'darwin') {
      // macOS: netstat -ib
      const raw = execSync('netstat -ib', { timeout: 3000 }).toString()
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

function localTemps(): StatsTemp[] {
  if (process.platform !== 'linux') return []
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

function localTopProcess(): { name: string; cpu: number; mem: number } | null {
  try {
    if (process.platform === 'win32') {
      const raw = execSync(
        'powershell -NoProfile -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 1 Name, CPU, WorkingSet | ConvertTo-Json -Compress"',
        { timeout: 3000 }
      ).toString().trim()
      if (!raw) return null
      const p = JSON.parse(raw)
      return { name: p.Name, cpu: p.CPU || 0, mem: p.WorkingSet || 0 }
    } else if (process.platform === 'darwin') {
      const raw = execSync('ps -rc -eo pcpu,pmem,comm | head -n 2 | tail -n 1', { timeout: 3000 }).toString().trim()
      const m = raw.match(/^([\d.]+)\s+([\d.]+)\s+(.*)$/)
      return m ? { name: m[3].split(/\s+/)[0].split('/').pop() || '', cpu: Number(m[1]), mem: Number(m[2]) } : null
    } else {
      const raw = execSync('ps -c -eo pcpu,pmem,comm --sort=-pcpu | head -n 2 | tail -n 1', { timeout: 3000 }).toString().trim()
      const m = raw.match(/^([\d.]+)\s+([\d.]+)\s+(.*)$/)
      return m ? { name: m[3].split(/\s+/)[0].split('/').pop() || '', cpu: Number(m[1]), mem: Number(m[2]) } : null
    }
  } catch { return null }
}

async function getLocalStats(): Promise<RemoteStats> {
  const [cpu, disk] = await Promise.all([cpuPercent(), Promise.resolve(localDisk())])
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const loadAvg = os.loadavg() as [number, number, number]

  return {
    cpu,
    mem: { used: usedMem, total: totalMem, percent: Math.round(usedMem / totalMem * 1000) / 10 },
    swap: { used: 0, total: 0, percent: 0 },
    disk,
    net: localNet(),
    load: [Math.round(loadAvg[0] * 100) / 100, Math.round(loadAvg[1] * 100) / 100, Math.round(loadAvg[2] * 100) / 100],
    uptimeSecs: os.uptime(),
    procs: 0,
    temps: localTemps(),
    topProcess: localTopProcess(),
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
  '        i1,t1 = rd(); time.sleep(0.2); i2,t2 = rd(); dt = t2-t1',
  '        return round(100.0*(1.0-(i2-i1)/dt),1) if dt else 0.0',
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
