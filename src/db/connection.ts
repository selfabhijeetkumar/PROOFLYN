/**
 * PROOFLYN — Database connection singleton
 * Caches connection on globalThis to survive Next.js dev hot-reloads.
 */

import { SqliteDatabase } from './sqlite';
import { createDb, runMigrations } from './schema';

const globalForDb = globalThis as unknown as {
  __prooflynDb?: SqliteDatabase;
};

export function getDb(): SqliteDatabase {
  if (!globalForDb.__prooflynDb) {
    const db = createDb();
    runMigrations(db);
    globalForDb.__prooflynDb = db;
  }
  return globalForDb.__prooflynDb;
}

export function closeDb(): void {
  if (globalForDb.__prooflynDb) {
    globalForDb.__prooflynDb.close();
    globalForDb.__prooflynDb = undefined;
  }
}

export function createTestDb(): SqliteDatabase {
  const db = new SqliteDatabase(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
