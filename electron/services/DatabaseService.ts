import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { SCHEMA_SQL } from '../db/schema'
import { runMigrations } from '../db/migrations'

/**
 * Singleton wrapper around better-sqlite3. Owns the connection lifecycle, applies the
 * base schema + migrations, and exposes the raw handle for the data-access helpers.
 */
class DatabaseServiceImpl {
  private db: Database.Database | null = null

  init(customPath?: string): Database.Database {
    if (this.db) return this.db

    const dir = customPath ?? app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, 'ternix.db')

    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA_SQL)
    runMigrations(db)

    // Ensure the singleton vault_meta row exists.
    db.prepare(`INSERT OR IGNORE INTO vault_meta (id, using_keychain) VALUES (1, 1)`).run()

    this.db = db
    return db
  }

  get(): Database.Database {
    if (!this.db) throw new Error('DatabaseService not initialized')
    return this.db
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export const DatabaseService = new DatabaseServiceImpl()
