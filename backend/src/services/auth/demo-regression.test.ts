import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from '@/api/demo/route';

const adapter = vi.hoisted(() => ({ prepare: vi.fn(), batch: vi.fn() }));
vi.mock('@/demo/storage', () => ({ env: { DB: adapter } }));
let database: DatabaseSync;
function prepare(sql: string, params: SQLInputValue[] = []) {
  return {
    bind: (...values: SQLInputValue[]) => prepare(sql, values),
    first: async () => database.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: database.prepare(sql).all(...params), success: true }),
    run: async () => ({ results: [], success: true, meta: database.prepare(sql).run(...params) }),
  };
}
beforeAll(() => {
  database = new DatabaseSync(':memory:');
  adapter.prepare.mockImplementation(prepare);
  adapter.batch.mockImplementation(async (statements: ReturnType<typeof prepare>[]) => {
    database.exec('BEGIN');
    try { const results = await Promise.all(statements.map((statement) => statement.run())); database.exec('COMMIT'); return results; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  });
});
afterAll(() => database.close());
beforeEach(() => { vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('DEMO_ROLE_SWITCHER', 'true'); });
afterEach(() => vi.unstubAllEnvs());
it('still seeds and serves the existing Hotel demo through its actual API', async () => {
  const response = await GET(new Request('https://hotel.example/api/demo', { headers: { 'x-demo-role': 'MANAGER' } }));
  expect(response.status).toBe(200);
  const body = await response.json() as { actor: { role: string }; property: { name: string }; rooms: unknown[] };
  expect(body.actor.role).toBe('MANAGER');
  expect(body.property.name).toBe('Meridian Grand Hotel');
  expect(body.rooms).toHaveLength(24);
});
it('still serves the Travel demo role and respects disabled network simulation', async () => {
  const response = await GET(new Request('https://hotel.example/api/demo', { headers: { 'x-demo-role': 'TRAVEL_AGENT', 'x-business-unit': 'TRAVEL' } }));
  expect(response.status).toBe(200);
  const body = await response.json() as { actor: { role: string } };
  expect(body.actor.role).toBe('TRAVEL_AGENT');
  vi.stubEnv('DEMO_NETWORK_SIMULATOR', 'false');
  const blocked = await POST(new Request('https://hotel.example/api/demo', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-demo-role': 'OWNER' }, body: JSON.stringify({ action: 'SET_NETWORK', status: 'OFFLINE' }) }));
  expect(blocked.status).toBe(403);
});
