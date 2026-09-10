import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { assertDemoMode } from '@/services/app-mode';

export class DemoStatement {
  constructor(private db: DatabaseSync, private sql: string, private params: SQLInputValue[] = []) {}
  bind(...values: unknown[]) { return new DemoStatement(this.db, this.sql, values as SQLInputValue[]); }
  async first<T = Record<string, unknown>>() { return (this.db.prepare(this.sql).get(...this.params) ?? null) as T | null; }
  async all<T = Record<string, unknown>>() { return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true }; }
  execute() {
    const statement = this.db.prepare(this.sql);
    const results = statement.columns().length ? statement.all(...this.params) : [];
    const meta = statement.columns().length ? { changes: 0 } : statement.run(...this.params);
    return { results, success: true, meta: { changes: Number(meta.changes) } };
  }
  async run() { return this.execute(); }
}
export class DemoDatabase {
  constructor(private db: DatabaseSync) {}
  prepare(sql: string) { return new DemoStatement(this.db, sql); }
  async batch(statements: DemoStatement[]) {
    this.db.exec('BEGIN');
    try { const result = statements.map(statement => statement.execute()); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
let database: DemoDatabase | undefined;
const dataRoot = () => resolve(process.env.DEMO_DATA_DIR ?? './data');
export const env = {
  get DB() {
    assertDemoMode();
    if (!database) { mkdirSync(dataRoot(), { recursive: true }); database = new DemoDatabase(new DatabaseSync(resolve(dataRoot(), 'demo.sqlite'))); }
    return database;
  },
  FILES: {
    async put(key: string, bytes: Uint8Array, metadata: unknown) {
      assertDemoMode();
      const root = resolve(dataRoot(), 'files');
      const target = resolve(root, key);
      if (!target.startsWith(root + sep)) throw new Error('Invalid demo storage key.');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      writeFileSync(target + '.metadata.json', JSON.stringify(metadata));
    },
  },
};
