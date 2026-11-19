import { DatabaseSync } from 'node:sqlite';
import type { SqlDb, SqlValue } from './sql';

export function openMemoryDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    async exec(sql: string) {
      db.exec(sql);
    },
    async run(sql: string, params: SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    async transaction<T>(fn: () => Promise<T>) {
      db.exec('BEGIN');
      try {
        const result = await fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
