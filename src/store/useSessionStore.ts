import { create } from 'zustand'
import type { Group, Session, SessionInput } from '@shared/index'

interface SessionState {
  sessions: Session[]
  groups: Group[]
  loading: boolean
  filter: string
  sortBy: 'name' | 'recent' | 'protocol'
  load: () => Promise<void>
  setFilter: (f: string) => void
  setSortBy: (s: 'name' | 'recent' | 'protocol') => void
  createSession: (data: SessionInput) => Promise<Session>
  updateSession: (id: number, data: SessionInput) => Promise<Session>
  deleteSession: (id: number) => Promise<void>
  duplicateSession: (id: number) => Promise<Session>
  createGroup: (name: string, parentId?: number | null) => Promise<Group>
  updateGroup: (id: number, data: Partial<Group>) => Promise<Group>
  deleteGroup: (id: number) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  groups: [],
  loading: false,
  filter: '',
  sortBy: 'name',

  load: async () => {
    set({ loading: true })
    try {
      const [sessions, groups] = await Promise.all([window.ternix.sessions.list(), window.ternix.groups.list()])
      set({ sessions, groups, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setFilter: (filter) => set({ filter }),
  setSortBy: (sortBy) => set({ sortBy }),

  createSession: async (data) => {
    const s = await window.ternix.sessions.create(data)
    await get().load()
    return s
  },
  updateSession: async (id, data) => {
    const s = await window.ternix.sessions.update(id, data)
    await get().load()
    return s
  },
  deleteSession: async (id) => {
    await window.ternix.sessions.delete(id)
    await get().load()
  },
  duplicateSession: async (id) => {
    const s = await window.ternix.sessions.duplicate(id)
    await get().load()
    return s
  },
  createGroup: async (name, parentId = null) => {
    const g = await window.ternix.groups.create({ name, parent_id: parentId })
    await get().load()
    return g
  },
  updateGroup: async (id, data) => {
    const g = await window.ternix.groups.update(id, data)
    await get().load()
    return g
  },
  deleteGroup: async (id) => {
    await window.ternix.groups.delete(id)
    await get().load()
  }
}))
