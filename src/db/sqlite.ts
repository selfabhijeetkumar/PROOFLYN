/**
 * PROOFLYN — SQLite driver wrapper over Node.js built-in node:sqlite (DatabaseSync)
 * Provides a clean synchronous API with plain object rows and nested transaction support.
 */

import { createRequire } from 'node:module';
import type { DatabaseSync as NodeDatabaseSync, SQLInputValue } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export interface PreparedStatement {
  run(...params: SQLInputValue[]): RunResult;
  get<T = Record<string, unknown>>(...params: SQLInputValue[]): T | undefined;
  all<T = Record<string, unknown>>(...params: SQLInputValue[]): T[];
}

export class SqliteDatabase {
  private readonly db: NodeDatabaseSync;
  private txDepth = 0;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
  }

  pragma(statement: string): void {
    this.db.exec(`PRAGMA ${statement};`);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): PreparedStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: SQLInputValue[]): RunResult => {
        return stmt.run(...params);
      },
      get: <T = Record<string, unknown>>(...params: SQLInputValue[]): T | undefined => {
        const row = stmt.get(...params) as Record<string, unknown> | undefined;
        return row ? ({ ...row } as T) : undefined;
      },
      all: <T = Record<string, unknown>>(...params: SQLInputValue[]): T[] => {
        const rows = stmt.all(...params) as Array<Record<string, unknown>>;
        return rows.map((row) => ({ ...row }) as T);
      },
    };
  }

  transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult {
    return (...args: TArgs): TResult => {
      const depth = this.txDepth;
      const savepoint = `sp_${depth}`;
      if (depth === 0) {
        this.db.exec('BEGIN IMMEDIATE;');
      } else {
        this.db.exec(`SAVEPOINT ${savepoint};`);
      }
      this.txDepth++;
      try {
        const result = fn(...args);
        if (depth === 0) {
          this.db.exec('COMMIT;');
        } else {
          this.db.exec(`RELEASE SAVEPOINT ${savepoint};`);
        }
        return result;
      } catch (err) {
        if (depth === 0) {
          this.db.exec('ROLLBACK;');
        } else {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
          this.db.exec(`RELEASE SAVEPOINT ${savepoint};`);
        }
        throw err;
      } finally {
        this.txDepth--;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}
