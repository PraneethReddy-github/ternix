// The shape of `window.ternix` exposed by the preload contextBridge.
// Imported by the renderer for full type-safety and by preload.ts to assert the contract.

import type {
  Group,
  Session,
  SessionInput,
  SshKey,
  KeyGenerateOptions,
  Snippet,
  Tunnel,
  ActiveTunnel,
  ConnectionLogEntry,
  Recording,
  SpawnOptions,
  SpawnResult,
  SftpEntry,
  TransferProgress,
  VaultStatus,
  HostKeyPrompt,
  HostKeyDecision,
  KeyboardInteractivePrompt,
  CredentialRequest,
  CredentialResponse,
  VncOpenResult,
  RdpOpenResult,
  GuacdStatus,
  ImportSource,
  ExportTarget,
  ImportResult,
  TerminalTheme
} from './index'

export interface TernixApi {
  groups: {
    list(): Promise<Group[]>
    create(data: Partial<Group> & { name: string }): Promise<Group>
    update(id: number, data: Partial<Group>): Promise<Group>
    delete(id: number): Promise<void>
  }
  sessions: {
    list(): Promise<Session[]>
    get(id: number): Promise<Session | null>
    create(data: SessionInput): Promise<Session>
    update(id: number, data: SessionInput): Promise<Session>
    delete(id: number): Promise<void>
    duplicate(id: number): Promise<Session>
    reorder(updates: { id: number; group_id: number | null; sort_order: number }[]): Promise<void>
  }
  terminal: {
    spawn(opts: SpawnOptions): Promise<SpawnResult>
    write(tabId: string, data: string): void
    resize(tabId: string, cols: number, rows: number): void
    kill(tabId: string): Promise<void>
    onData(tabId: string, cb: (data: string) => void): () => void
    onExit(tabId: string, cb: (info: { code: number; reason?: string; clean?: boolean }) => void): () => void
    onStatus(tabId: string, cb: (status: { state: string; message?: string }) => void): () => void
    onHostKeyPrompt(cb: (p: HostKeyPrompt) => void): () => void
    respondHostKey(tabId: string, decision: HostKeyDecision): void
    onKbInteractive(cb: (p: KeyboardInteractivePrompt) => void): () => void
    respondKbInteractive(tabId: string, responses: string[]): void
    onNeedsCredentials(cb: (req: CredentialRequest) => void): () => void
    respondCredentials(tabId: string, response: CredentialResponse): void
    latency(tabId: string): Promise<number | null>
  }
  remote: {
    openVnc(tabId: string, sessionId: number): Promise<VncOpenResult>
    openRdp(tabId: string, sessionId: number, width: number, height: number): Promise<RdpOpenResult>
    guacdStatus(): Promise<GuacdStatus>
    launchNative(sessionId: number): Promise<string>
    close(tabId: string): Promise<void>
  }
  sftp: {
    open(tabId: string): Promise<void>
    listDir(tabId: string, remotePath: string): Promise<SftpEntry[]>
    realpath(tabId: string, remotePath: string): Promise<string>
    cwd(tabId: string): Promise<string | null>
    download(tabId: string, remotePath: string, localPath: string): Promise<string>
    upload(tabId: string, localPath: string, remotePath: string): Promise<string>
    mkdir(tabId: string, remotePath: string): Promise<void>
    delete(tabId: string, remotePath: string, isDir: boolean): Promise<void>
    rename(tabId: string, oldPath: string, newPath: string): Promise<void>
    chmod(tabId: string, remotePath: string, mode: number): Promise<void>
    stat(tabId: string, remotePath: string): Promise<SftpEntry>
    pause(transferId: string): Promise<void>
    resume(transferId: string): Promise<void>
    cancel(transferId: string): Promise<void>
    onProgress(cb: (p: TransferProgress) => void): () => void
  }
  localfs: {
    listDir(localPath: string): Promise<SftpEntry[]>
    home(): Promise<string>
    mkdir(localPath: string): Promise<void>
    delete(localPath: string, isDir: boolean): Promise<void>
    rename(oldPath: string, newPath: string): Promise<void>
  }
  keys: {
    list(): Promise<SshKey[]>
    generate(opts: KeyGenerateOptions): Promise<SshKey>
    import(pem: string, name: string, passphrase?: string): Promise<SshKey>
    importFromDir(): Promise<SshKey[]>
    delete(id: number): Promise<void>
    getPublic(id: number): Promise<string>
    exportPrivate(id: number, masterPassword: string): Promise<string>
    deploy(keyId: number, sessionId: number): Promise<void>
  }
  snippets: {
    list(): Promise<Snippet[]>
    create(data: Partial<Snippet> & { name: string; command: string }): Promise<Snippet>
    update(id: number, data: Partial<Snippet>): Promise<Snippet>
    delete(id: number): Promise<void>
    import(json: string): Promise<number>
    export(): Promise<string>
  }
  tunnels: {
    listForSession(sessionId: number): Promise<Tunnel[]>
    create(data: Partial<Tunnel> & { session_id: number; tunnel_type: string; local_port: number }): Promise<Tunnel>
    update(id: number, data: Partial<Tunnel>): Promise<Tunnel>
    delete(id: number): Promise<void>
    start(tunnelId: number, tabId: string): Promise<ActiveTunnel>
    stop(tunnelId: number): Promise<void>
    listActive(): Promise<ActiveTunnel[]>
    onUpdate(cb: (tunnels: ActiveTunnel[]) => void): () => void
  }
  recordings: {
    list(): Promise<Recording[]>
    start(tabId: string, sessionId: number | null, sessionName: string): Promise<number>
    stop(tabId: string): Promise<void>
    read(id: number): Promise<string>
    delete(id: number): Promise<void>
    isRecording(tabId: string): Promise<boolean>
  }
  broadcast: {
    write(tabIds: string[], data: string): void
  }
  log: {
    list(sessionId?: number): Promise<ConnectionLogEntry[]>
    clear(): Promise<void>
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    getAll(): Promise<Record<string, string>>
  }
  vault: {
    status(): Promise<VaultStatus>
    setMasterPassword(oldPw: string | null, newPw: string): Promise<void>
    unlock(password: string): Promise<boolean>
    lock(): Promise<void>
    removeMasterPassword(currentPw: string): Promise<void>
    activity(): Promise<void>
    onLocked(cb: () => void): () => void
  }
  themes: {
    listCustom(): Promise<TerminalTheme[]>
    saveCustom(theme: TerminalTheme): Promise<void>
    deleteCustom(id: string): Promise<void>
  }
  importExport: {
    import(source: ImportSource, payload: string): Promise<ImportResult>
    commitImport(sessions: SessionInput[], located?: Record<string, string>): Promise<number>
    inspectKey(absPath: string): Promise<{ encrypted: boolean; fingerprint: string | null } | null>
    export(target: ExportTarget, includeKeys: boolean, masterPassword?: string): Promise<string>
  }
  system: {
    /** Absolute path of a dragged-in File, or '' if it isn't a real on-disk file. Synchronous. */
    getPathForFile(file: File): string
    listSerialPorts(): Promise<{ path: string; manufacturer?: string }[]>
    openPath(path: string): Promise<void>
    showItemInFolder(path: string): Promise<void>
    selectDirectory(): Promise<string | null>
    selectFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>
    readFile(path: string): Promise<string>
    saveFile(defaultName: string, content: string): Promise<string | null>
    readClipboard(): Promise<string>
    writeClipboard(text: string): Promise<void>
    writeClipboardHtml(html: string, text: string): Promise<void>
    platform(): Promise<NodeJS.Platform>
    version(): Promise<string>
  }
  window: {
    minimize(): void
    maximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    toggleFullscreen(): void
    onMaximizeChange(cb: (maximized: boolean) => void): () => void
  }
  updates: {
    check(): Promise<{ available: boolean; version?: string }>
    download(): Promise<void>
    install(): void
    onStatus(cb: (s: { event: string; info?: any }) => void): () => void
  }
  stats: {
    fetch(tabId: string | null): Promise<any>
  }
}

declare global {
  interface Window {
    ternix: TernixApi
  }
}
