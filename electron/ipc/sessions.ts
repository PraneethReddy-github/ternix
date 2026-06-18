import { handle } from './util'
import { sessionsRepo, groupsRepo } from '../db/repo'
import type { Group, Session, SessionInput } from '@shared/index'

export function registerSessionHandlers(): void {
  // Groups
  handle<Group[]>('groups:list', () => groupsRepo.list())
  handle<Group>('groups:create', (data) => groupsRepo.create(data))
  handle<Group>('groups:update', (id: number, data) => groupsRepo.update(id, data))
  handle<void>('groups:delete', (id: number) => groupsRepo.delete(id))

  // Sessions
  handle<Session[]>('sessions:list', () => sessionsRepo.list())
  handle<Session | null>('sessions:get', (id: number) => sessionsRepo.get(id))
  handle<Session>('sessions:create', (data: SessionInput) => sessionsRepo.create(data))
  handle<Session>('sessions:update', (id: number, data: SessionInput) => sessionsRepo.update(id, data))
  handle<void>('sessions:delete', (id: number) => sessionsRepo.delete(id))
  handle<Session>('sessions:duplicate', (id: number) => sessionsRepo.duplicate(id))
  handle<void>('sessions:reorder', (updates) => sessionsRepo.reorder(updates))
}
