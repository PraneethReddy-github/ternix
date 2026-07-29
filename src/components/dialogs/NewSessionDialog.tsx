import { useEffect, useState } from 'react'
import type { Protocol, Session, SessionInput, SshKey, AuthType } from '@shared/index'
import { Modal, Field } from '@/components/ui/Modal'
import { Toggle as ToggleSwitch } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'
import { useSessionStore } from '@/store/useSessionStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUiStore } from '@/store/useUiStore'
import { cn } from '@/utils/cn'

const PROTOCOLS: { id: Protocol; label: string }[] = [
  { id: 'ssh', label: 'SSH' },
  { id: 'telnet', label: 'Telnet' },
  { id: 'serial', label: 'Serial' },
  { id: 'local', label: 'Local' },
  { id: 'rdp', label: 'RDP' },
  { id: 'vnc', label: 'VNC' }
]
const BAUD = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const TABS = ['Connection', 'Advanced', 'Startup', 'Notes'] as const
type TabKey = (typeof TABS)[number]

export function NewSessionDialog({ session, groupId, duplicate, onClose }: { session?: Session; groupId?: number | null; duplicate?: boolean; onClose: () => void }) {
  const groups = useSessionStore((s) => s.groups)
  const sessions = useSessionStore((s) => s.sessions)
  const createSession = useSessionStore((s) => s.createSession)
  const updateSession = useSessionStore((s) => s.updateSession)
  const notify = useUiStore((s) => s.notify)
  const [tab, setTab] = useState<TabKey>('Connection')
  const [keys, setKeys] = useState<SshKey[]>([])
  const [ports, setPorts] = useState<{ path: string }[]>([])
  const [password, setPassword] = useState('')
  const [passphrase, setPassphrase] = useState('')

  const isEditing = !!session && !duplicate

  const [form, setForm] = useState<SessionInput>(() =>
    session
      ? { ...(session as unknown as SessionInput) }
      : {
        name: '',
        protocol: 'ssh',
        host: '',
        port: 22,
        username: useSettingsStore.getState().get('ssh.defaultUsername'),
        auth_type: 'password',
        group_id: groupId ?? null,
        keepalive_interval: 30,
        baud_rate: 9600,
        data_bits: 8,
        stop_bits: 1,
        parity: 'none',
        flow_control: 'none',
        terminal_encoding: 'utf-8',
        env_vars: {},
        startup_commands: [],
        tags: []
      }
  )

  useEffect(() => {
    window.ternix.keys.list().then(setKeys)
    window.ternix.system.listSerialPorts().then(setPorts)
  }, [])

  const set = <K extends keyof SessionInput>(k: K, v: SessionInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const setProtocol = (p: Protocol) => {
    setForm((f) => ({ ...f, protocol: p, port: p === 'ssh' ? 22 : p === 'telnet' ? 23 : p === 'rdp' ? 3389 : p === 'vnc' ? 5900 : f.port, auth_type: p === 'ssh' ? 'password' : 'none' }))
  }

  const save = async () => {
    if (!form.name.trim()) return notify('Name is required', 'error')

    // Check for duplicates
    const isDuplicate = sessions.some(s =>
      (!isEditing || s.id !== session?.id) &&
      s.name.trim() === form.name.trim() &&
      s.protocol === form.protocol &&
      (s.host || '').trim() === (form.host || '').trim() &&
      (s.username || '').trim() === (form.username || '').trim()
    )
    if (isDuplicate) {
      return notify('A session with this name, protocol, host, and username already exists', 'error')
    }

    const payload: SessionInput = { ...form }
    if (password) {
      if (form.protocol === 'vnc') payload.vncPassword = password
      else payload.password = password
    }
    if (passphrase) payload.passphrase = passphrase
    try {
      if (isEditing) await updateSession(session!.id, payload)
      else await createSession(payload)
      notify(isEditing ? 'Session updated' : 'Session created', 'success')
      onClose()
    } catch (e: any) {
      notify(e.message, 'error')
    }
  }

  const p = form.protocol

  return (
    <Modal
      title={isEditing ? `Edit · ${session.name}` : duplicate ? `Duplicate · ${session!.name}` : 'New session'}
      width={620}
      onClose={onClose}
      footer={
        <>
          <button className="tx-btn-ghost border border-border" onClick={onClose}>Cancel</button>
          <button className="tx-btn-primary" onClick={save}>{isEditing ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <div className="flex gap-1 mb-3 border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-3 py-1.5 text-[12px] border-b-2 -mb-px', tab === t ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Connection' && (
        <div>
          <Field label="Protocol">
            <div className="flex flex-wrap gap-1">
              {PROTOCOLS.map((pr) => (
                <button key={pr.id} onClick={() => setProtocol(pr.id)} className={cn('px-3 py-1 rounded-input text-[12px] border', p === pr.id ? 'border-accent text-accent bg-accent/10' : 'border-border text-muted')}>
                  {pr.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Session name"><input className="tx-input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
          <Field label="Group">
            <Select
              value={form.group_id != null ? String(form.group_id) : ''}
              onChange={(v) => set('group_id', v ? Number(v) : null)}
              options={[{ value: '', label: 'Ungrouped' }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]}
            />
          </Field>

          {(p === 'ssh' || p === 'telnet' || p === 'rdp' || p === 'vnc') && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><Field label="Host"><input className="tx-input" value={form.host ?? ''} onChange={(e) => set('host', e.target.value)} /></Field></div>
              <Field label="Port"><input type="number" className="tx-input" value={form.port ?? ''} onChange={(e) => set('port', Number(e.target.value))} /></Field>
            </div>
          )}

          {(p === 'ssh' || p === 'rdp') && <Field label="Username"><input className="tx-input" value={form.username ?? ''} onChange={(e) => set('username', e.target.value)} /></Field>}
          {p === 'rdp' && <Field label="Domain"><input className="tx-input" value={form.rdp_domain ?? ''} onChange={(e) => set('rdp_domain', e.target.value)} /></Field>}

          {p === 'ssh' && (
            <>
              <Field label="Authentication">
                <Select
                  value={form.auth_type ?? 'password'}
                  onChange={(v) => set('auth_type', v as AuthType)}
                  options={[
                    { value: 'password', label: 'Password' },
                    { value: 'key', label: 'Private Key' },
                    { value: 'agent', label: 'SSH Agent' },
                    { value: 'keyboard-interactive', label: 'Keyboard Interactive' }
                  ]}
                />
              </Field>
              {form.auth_type === 'password' && (
                <Field label="Password" hint={session?.hasPassword ? 'Leave blank to keep current password' : undefined}>
                  <input type="password" className="tx-input" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              )}
              {form.auth_type === 'key' && (
                <>
                  <Field label="Private key">
                    <div className="flex gap-2">
                      <Select
                        className="flex-1"
                        value={form.ssh_key_id != null ? String(form.ssh_key_id) : ''}
                        onChange={(v) => set('ssh_key_id', v ? Number(v) : null)}
                        options={[{ value: '', label: 'Select a key…' }, ...keys.map((k) => ({ value: String(k.id), label: `${k.name} (${k.key_type})` }))]}
                      />
                      <button
                        type="button"
                        className="tx-btn-ghost border border-border text-[11px] whitespace-nowrap"
                        onClick={async () => {
                          const path = await window.ternix.system.selectFile()
                          if (!path) return
                          try {
                            const pem = await window.ternix.system.readFile(path)
                            useUiStore.getState().openDialog({
                              kind: 'prompt',
                              title: 'Import Private Key',
                              label: 'Enter a name for this key:',
                              defaultValue: path.split(/[/\\]/).pop() || 'key',
                              onSubmit: async (name) => {
                                if (!name) return
                                try {
                                  const key = await window.ternix.keys.import(pem, name)
                                  const latestKeys = await window.ternix.keys.list()
                                  setKeys(latestKeys)
                                  set('ssh_key_id', key.id)
                                  notify('Key imported and selected', 'success')
                                } catch (e: any) {
                                  notify(`Failed to import key: ${e.message}`, 'error')
                                }
                              }
                            })
                          } catch (e: any) {
                            notify(`Failed to read file: ${e.message}`, 'error')
                          }
                        }}
                      >
                        Import…
                      </button>
                    </div>
                  </Field>
                  <Field label="Key passphrase" hint={session?.hasPassphrase ? 'Leave blank to keep current' : 'Optional'}>
                    <input type="password" className="tx-input" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                  </Field>
                </>
              )}
              <Field label="Jump host (ProxyJump)">
                <Select
                  value={form.jump_host_id != null ? String(form.jump_host_id) : ''}
                  onChange={(v) => set('jump_host_id', v ? Number(v) : null)}
                  options={[
                    { value: '', label: 'None — direct connection' },
                    ...sessions.filter((s) => s.protocol === 'ssh' && s.id !== session?.id).map((s) => ({ value: String(s.id), label: s.name }))
                  ]}
                />
              </Field>
            </>
          )}

          {p === 'telnet' && (
            <Field label="Auto-login password" hint="Sent when a password prompt is detected (optional)">
              <input type="password" className="tx-input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}

          {p === 'serial' && (
            <>
              <Field label="COM port">
                <Select
                  value={form.com_port ?? ''}
                  onChange={(v) => set('com_port', v)}
                  options={[{ value: '', label: 'Select port…' }, ...ports.map((pt) => ({ value: pt.path, label: pt.path }))]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Baud rate">
                  <Select
                    value={String(form.baud_rate)}
                    onChange={(v) => set('baud_rate', Number(v))}
                    options={BAUD.map((b) => ({ value: String(b), label: String(b) }))}
                  />
                </Field>
                <Field label="Data bits">
                  <Select
                    value={String(form.data_bits)}
                    onChange={(v) => set('data_bits', Number(v))}
                    options={[{ value: '7', label: '7' }, { value: '8', label: '8' }]}
                  />
                </Field>
                <Field label="Stop bits">
                  <Select
                    value={String(form.stop_bits)}
                    onChange={(v) => set('stop_bits', Number(v))}
                    options={[{ value: '1', label: '1' }, { value: '1.5', label: '1.5' }, { value: '2', label: '2' }]}
                  />
                </Field>
                <Field label="Parity">
                  <Select
                    value={form.parity as string}
                    onChange={(v) => set('parity', v as any)}
                    options={['none', 'even', 'odd', 'mark', 'space'].map((x) => ({ value: x, label: x }))}
                  />
                </Field>
                <Field label="Flow control">
                  <Select
                    value={form.flow_control as string}
                    onChange={(v) => set('flow_control', v as any)}
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'rtscts', label: 'RTS/CTS' },
                      { value: 'xon/xoff', label: 'XON/XOFF' }
                    ]}
                  />
                </Field>
              </div>
            </>
          )}

          {p === 'vnc' && <Field label="VNC password"><input type="password" className="tx-input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
          {p === 'rdp' && (
            <>
              <Field label="Password"><input type="password" className="tx-input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Width"><input type="number" className="tx-input" value={form.rdp_width ?? 1920} onChange={(e) => set('rdp_width', Number(e.target.value))} /></Field>
                <Field label="Height"><input type="number" className="tx-input" value={form.rdp_height ?? 1080} onChange={(e) => set('rdp_height', Number(e.target.value))} /></Field>
              </div>
            </>
          )}
          {p === 'vnc' && <p className="text-[11px] text-muted">VNC opens in a Ternix pane using the built-in viewer — no extra software needed. Use “Open in native client” from the pane to launch your system VNC viewer instead.</p>}
          {p === 'rdp' && <p className="text-[11px] text-muted">RDP opens in a Ternix pane via a local <code>guacd</code> daemon (supports modern Windows / NLA). If guacd isn’t running, the pane offers “Open in native client” (xfreerdp / mstsc / Microsoft Remote Desktop). Configure guacd host/port in Settings → Advanced.</p>}
        </div>
      )}

      {tab === 'Advanced' && (
        <div>
          {p === 'ssh' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Keepalive interval (s)"><input type="number" className="tx-input" value={form.keepalive_interval} onChange={(e) => set('keepalive_interval', Number(e.target.value))} /></Field>
                <Field label="Keepalive max count"><input type="number" className="tx-input" value={form.keepalive_count_max ?? 3} onChange={(e) => set('keepalive_count_max', Number(e.target.value))} /></Field>
              </div>
              <div className="flex flex-col gap-2 my-2">
                <Toggle label="X11 forwarding" checked={!!form.x11_forwarding} onChange={(v) => set('x11_forwarding', v)} />
                <Toggle label="Agent forwarding" checked={!!form.agent_forwarding} onChange={(v) => set('agent_forwarding', v)} />
                <Toggle label="Compression" checked={!!form.compression} onChange={(v) => set('compression', v)} />
              </div>
            </>
          )}
          <Field label="Terminal encoding">
            <Select
              value={form.terminal_encoding as string}
              onChange={(v) => set('terminal_encoding', v)}
              options={['utf-8', 'iso-8859-1', 'windows-1252', 'gbk', 'shift_jis'].map((x) => ({ value: x, label: x }))}
            />
          </Field>
          <Field label="Environment variables" hint="One KEY=value per line">
            <textarea
              className="tx-input h-20 font-mono text-[12px]"
              value={Object.entries(form.env_vars ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
              onChange={(e) => {
                const env: Record<string, string> = {}
                for (const line of e.target.value.split('\n')) {
                  const i = line.indexOf('=')
                  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1)
                }
                set('env_vars', env)
              }}
            />
          </Field>
          <Field label="Tags" hint="Comma-separated">
            <input className="tx-input" value={(form.tags ?? []).join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} />
          </Field>
        </div>
      )}

      {tab === 'Startup' && (
        <Field label="Startup commands" hint="Run in order once the shell opens (one per line)">
          <textarea
            className="tx-input h-40 font-mono text-[12px]"
            value={(form.startup_commands ?? []).join('\n')}
            onChange={(e) => set('startup_commands', e.target.value.split('\n').filter((l) => l.length > 0))}
          />
        </Field>
      )}

      {tab === 'Notes' && (
        <Field label="Notes" hint="Free-text notes about this server">
          <textarea className="tx-input h-44" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      )}
    </Modal>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[13px] text-text">{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </label>
  )
}
