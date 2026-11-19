import * as SQLite from 'expo-sqlite';
import type { SqlDb, SqlValue } from './sql';

export async function openExpoDatabase(): Promise<SqlDb> {
  const db = await SQLite.openDatabaseAsync('core-capture.db');
  await db.execAsync('PRAGMA foreign_keys = ON');
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, params as SQLite.SQLiteBindValue[]);
    },
    all: <T>(sql: string, params: SqlValue[] = []) =>
      db.getAllAsync<T>(sql, ...(params as SQLite.SQLiteBindValue[])),
    get: async <T>(sql: string, params: SqlValue[] = []) => {
      const row = await db.getFirstAsync<T>(sql, ...(params as SQLite.SQLiteBindValue[]));
      return row ?? undefined;
    },
    transaction: async (fn) => {
      let result!: Awaited<ReturnType<typeof fn>>;
      await db.withTransactionAsync(async () => {
        result = await fn();
      });
      return result;
    },
  };
}
