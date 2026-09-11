import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle-postgres',
  schema: ['./src/db/schema.ts', './src/db/operational-schema.ts'],
  dialect: 'postgresql',
  dbCredentials: process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : undefined,
});
