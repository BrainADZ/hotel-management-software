import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let client: ReturnType<typeof postgres> | undefined;

export function getPostgresClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('PostgreSQL DATABASE_URL is not configured.');
  client ??= postgres(databaseUrl, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    prepare: false,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
  });
  return client;
}

export function getDb() {
  return drizzle(getPostgresClient(), { schema });
}
