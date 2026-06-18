import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResult } from '@shared/index'
import type { TernixApi } from '@shared/ipc'

/** Invoke an IPC handler and unwrap the { ok, data } / { ok, error } envelope. */
async function invoke<T>(channel: string, ...args: any[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) throw new Error(res.error)
  return res.data
}

/** Subscribe to a main→renderer event channel, returning an unsubscribe fn. */
function subscribe(channel: string, cb: (...args: any[]) => void): () => void {
  const listener = (_e: unknown, ...args: any[]) => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: TernixApi = {
  groups: {
    list: () => invoke('groups:list'),
    create: (data) => invoke('groups:create', data),
    update: (id, data) => invoke('groups:update', id, data),
    delete: (id) => invoke('groups:delete', id)
  },
  sessions: {
    list: () => invoke('sessions:list'),
    get: (id) => invoke('sessions:get', id),
    create: (data) => invoke('sessions:create', data),
    update: (id, data) => invoke('sessions:update', id, data),
    delete: (id) => invoke('sessions:delete', id),
    duplicate: (id) => invoke('sessions:duplicate', id),
    reorder: (updates) => invoke('sessions:reorder', updates)
  },
  terminal: {
    spawn: (opts) => invoke('terminal:spawn', opts),
    write: (tabId, data) => ipcRenderer.send('terminal:write', tabId, data),
    resize: (tabId, cols, rows) => ipcRenderer.send('terminal:resize', tabId, cols, rows),
    kill: (tabId) => invoke('terminal:kill', tabId),
    onData: (tabId, cb) => subscribe(`terminal:data:${tabId}`, cb),
    onExit: (tabId, cb) => subscribe(`terminal:exit:${tabId}`, cb),
    onStatus: (tabId, cb) => subscribe(`terminal:status:${tabId}`, cb),
    onHostKeyPrompt: (cb) => subscribe('terminal:hostkey', cb),
    respondHostKey: (tabId, decision) => ipcRenderer.send('terminal:hostkey:respond', tabId, decision),
    onKbInteractive: (cb) => subscribe('terminal:kbi', cb),
    respondKbInteractive: (tabId, responses) => ipcRenderer.send('terminal:kbi:respond', tabId, responses),
    latency: (tabId) => invoke('terminal:latency', tabId)
  },
  sftp: {
    open: (tabId) => invoke('sftp:open', tabId),
    listDir: (tabId, p) => invoke('sftp:listDir', tabId, p),
    realpath: (tabId, p) => invoke('sftp:realpath', tabId, p),
    download: (tabId, r, l) => invoke('sftp:download', tabId, r, l),
    upload: (tabId, l, r) => invoke('sftp:upload', tabId, l, r),
    mkdir: (tabId, p) => invoke('sftp:mkdir', tabId, p),
    delete: (tabId, p, isDir) => invoke('sftp:delete', tabId, p, isDir),
    rename: (tabId, o, n) => invoke('sftp:rename', tabId, o, n),
    chmod: (tabId, p, mode) => invoke('sftp:chmod', tabId, p, mode),
    stat: (tabId, p) => invoke('sftp:stat', tabId, p),
    pause: (id) => invoke('sftp:pause', id),
    resume: (id) => invoke('sftp:resume', id),
    cancel: (id) => invoke('sftp:cancel', id),
    onProgress: (cb) => subscribe('sftp:progress', cb)
  },
  localfs: {
    listDir: (p) => invoke('localfs:listDir', p),
    home: () => invoke('localfs:home'),
    mkdir: (p) => invoke('localfs:mkdir', p),
    delete: (p, isDir) => invoke('localfs:delete', p, isDir),
    rename: (o, n) => invoke('localfs:rename', o, n)
  },
  keys: {
    list: () => invoke('keys:list'),
    generate: (opts) => invoke('keys:generate', opts),
    import: (pem, name, passphrase) => invoke('keys:import', pem, name, passphrase),
    importFromDir: () => invoke('keys:importFromDir'),
    delete: (id) => invoke('keys:delete', id),
    getPublic: (id) => invoke('keys:getPublic', id),
    exportPrivate: (id, mp) => invoke('keys:exportPrivate', id, mp),
    deploy: (keyId, sessionId) => invoke('keys:deploy', keyId, sessionId)
  },
  snippets: {
    list: () => invoke('snippets:list'),
    create: (data) => invoke('snippets:create', data),
    update: (id, data) => invoke('snippets:update', id, data),
    delete: (id) => invoke('snippets:delete', id),
    import: (json) => invoke('snippets:import', json),
    export: () => invoke('snippets:export')
  },
  tunnels: {
    listForSession: (sessionId) => invoke('tunnels:listForSession', sessionId),
    create: (data) => invoke('tunnels:create', data),
    update: (id, data) => invoke('tunnels:update', id, data),
    delete: (id) => invoke('tunnels:delete', id),
    start: (tunnelId, tabId) => invoke('tunnels:start', tunnelId, tabId),
    stop: (tunnelId) => invoke('tunnels:stop', tunnelId),
    listActive: () => invoke('tunnels:listActive'),
    onUpdate: (cb) => subscribe('tunnels:update', cb)
  },
  recordings: {
    list: () => invoke('recordings:list'),
    start: (tabId, sessionId, sessionName) => invoke('recordings:start', tabId, sessionId, sessionName),
    stop: (tabId) => invoke('recordings:stop', tabId),
    read: (id) => invoke('recordings:read', id),
    delete: (id) => invoke('recordings:delete', id),
    isRecording: (tabId) => invoke('recordings:isRecording', tabId)
  },
  broadcast: {
    write: (tabIds, data) => ipcRenderer.send('broadcast:write', tabIds, data)
  },
  log: {
    list: (sessionId) => invoke('log:list', sessionId),
    clear: () => invoke('log:clear')
  },
  settings: {
    get: (key) => invoke('settings:get', key),
    set: (key, value) => invoke('settings:set', key, value),
    getAll: () => invoke('settings:getAll')
  },
  vault: {
    status: () => invoke('vault:status'),
    setMasterPassword: (oldPw, newPw) => invoke('vault:setMasterPassword', oldPw, newPw),
    unlock: (password) => invoke('vault:unlock', password),
    lock: () => invoke('vault:lock'),
    removeMasterPassword: (currentPw) => invoke('vault:removeMasterPassword', currentPw),
    onLocked: (cb) => subscribe('vault:locked', cb)
  },
  themes: {
    listCustom: () => invoke('themes:listCustom'),
    saveCustom: (theme) => invoke('themes:saveCustom', theme),
    deleteCustom: (id) => invoke('themes:deleteCustom', id)
  },
  importExport: {
    import: (source, payload) => invoke('importExport:import', source, payload),
    commitImport: (sessions) => invoke('importExport:commitImport', sessions),
    export: (target, includeKeys, masterPassword) => invoke('importExport:export', target, includeKeys, masterPassword)
  },
  system: {
    listSerialPorts: () => invoke('system:listSerialPorts'),
    openPath: (path) => invoke('system:openPath', path),
    showItemInFolder: (path) => invoke('system:showItemInFolder', path),
    selectDirectory: () => invoke('system:selectDirectory'),
    selectFile: (filters) => invoke('system:selectFile', filters),
    readFile: (path) => invoke('system:readFile', path),
    saveFile: (defaultName, content) => invoke('system:saveFile', defaultName, content),
    readClipboard: () => invoke('system:readClipboard'),
    writeClipboard: (text) => invoke('system:writeClipboard', text),
    platform: () => invoke('system:platform'),
    version: () => invoke('system:version')
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => invoke('window:isMaximized'),
    toggleFullscreen: () => ipcRenderer.send('window:toggleFullscreen'),
    onMaximizeChange: (cb) => subscribe('window:maximize-change', cb)
  },
  updates: {
    check: () => invoke('updates:check'),
    onStatus: (cb) => subscribe('updates:status', cb)
  }
}

contextBridge.exposeInMainWorld('ternix', api)
