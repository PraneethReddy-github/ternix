import type Database from 'better-sqlite3'

// Version-based migrations. `user_version` PRAGMA tracks the applied schema version.
// Each migration bumps the DB from version N-1 to N. Migration 0 is the base schema
// (applied by DatabaseService via SCHEMA_SQL), so migrations here start at 1.
//
// Migrations are forward-only: there is no `down`. An older build opening a newer
// database silently no-ops here (its `pending` list comes out empty) and then runs
// against a schema it was never written for. Reads survive that — they are `SELECT *`
// and ignore unknown columns — but writes name their columns explicitly.
//
// So, if you ever add a schema migration: make it ADDITIVE and give new columns a
// DEFAULT (or allow NULL). A `NOT NULL` column without a default, a renamed column, or
// a dropped table all break any previously-released build a user might downgrade to.
// Keep that rule and downgrades stay safe without any version guard.

export interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'repair snippets marked non-global but owned by no session',
    // The global checkbox used to persist is_global=0 without ever recording a session_id.
    // Such rows are visible from nowhere once scoping is enforced, so adopt them as global.
    up: (db) => db.exec(`UPDATE snippets SET is_global = 1 WHERE is_global = 0 AND session_id IS NULL`)
  }
]

export function runMigrations(db: Database.Database): void {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
  for (const m of pending) {
    const tx = db.transaction(() => {
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    })
    tx()
  }
}
