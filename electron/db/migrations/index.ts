import type Database from 'better-sqlite3'

// Version-based migrations. `user_version` PRAGMA tracks the applied schema version.
// Each migration bumps the DB from version N-1 to N. Migration 0 is the base schema
// (applied by DatabaseService via SCHEMA_SQL), so migrations here start at 1.

export interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
}

export const migrations: Migration[] = [
  // Example forward-migration scaffold. Add new entries here as the schema evolves.
  // {
  //   version: 1,
  //   description: 'add color column to snippets',
  //   up: (db) => db.exec(`ALTER TABLE snippets ADD COLUMN color TEXT`)
  // }
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
