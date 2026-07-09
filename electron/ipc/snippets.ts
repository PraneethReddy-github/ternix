import { handle } from './util'
import type { Snippet } from '@shared/index'
import { snippetsRepo } from '../db/repo'

export function registerSnippetHandlers(): void {
  handle<Snippet[]>('snippets:list', () => snippetsRepo.list())
  handle<Snippet>('snippets:create', (data) => snippetsRepo.create(data))
  handle<Snippet>('snippets:update', (id: number, data) => snippetsRepo.update(id, data))
  handle<void>('snippets:delete', (id: number) => snippetsRepo.delete(id))

  handle<number>('snippets:import', (json: string) => {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) throw new Error('Expected a JSON array of snippets')
    let n = 0
    for (const s of arr) {
      if (!s?.name || !s?.command) continue
      snippetsRepo.create({
        name: s.name,
        command: s.command,
        description: s.description ?? null,
        tags: Array.isArray(s.tags) ? s.tags : [],
        // ponytail: session ids are meaningless across machines, so imports land global.
        // Thread a session mapping through here if scoped snippets ever need to survive export.
        is_global: true
      })
      n++
    }
    return n
  })

  handle<string>('snippets:export', () => JSON.stringify(snippetsRepo.list(), null, 2))
}
