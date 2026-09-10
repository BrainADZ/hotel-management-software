import { defineConfig, globalIgnores } from 'eslint/config';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextTs,
  globalIgnores(['**/.next/**', '**/dist/**', '**/node_modules/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
