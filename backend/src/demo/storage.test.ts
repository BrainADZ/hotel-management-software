import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { DemoDatabase } from './storage';
it('preserves SQLite query results and atomic demo batches', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const db = new DemoDatabase(sqlite);
  try {
    await db.prepare('CREATE TABLE items (id TEXT PRIMARY KEY)').run();
    await db.batch([db.prepare('INSERT INTO items VALUES (?)').bind('a')]);
    expect(await db.prepare('SELECT * FROM items').first()).toEqual({ id: 'a' });
    expect((await db.batch([db.prepare('SELECT * FROM items')]))[0].results).toEqual([{ id: 'a' }]);
    await expect(db.batch([db.prepare('INSERT INTO items VALUES (?)').bind('b'), db.prepare('INSERT INTO items VALUES (?)').bind('a')])).rejects.toThrow();
    expect((await db.prepare('SELECT * FROM items').all()).results).toHaveLength(1);
  } finally { sqlite.close(); }
});
