import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals, ...nextTs,
  globalIgnores(['dist/**', '.next/**', 'node_modules/**', 'next-env.d.ts']),
  { rules: { 'no-restricted-imports': ['error', { patterns: [
    { group: ['@/db', '@/db/*', '@/services/*', '@/lib/server/*', '**/backend/**', 'drizzle-orm', 'drizzle-orm/*', 'postgres'],
      message: 'Frontend code must use the backend HTTP API.' },
  ] }] } },
]);
