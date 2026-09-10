import { defineConfig } from 'tsup';
export default defineConfig({ noExternal: ['@hotel/shared'], removeNodeProtocol: false });
