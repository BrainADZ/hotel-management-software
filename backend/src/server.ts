import { createApp } from './app';
const app = await createApp();
await app.listen({ port: Number(process.env.PORT ?? 4000), host: process.env.HOST ?? '127.0.0.1' });
console.log(`Backend listening on ${app.server.address() instanceof Object ? process.env.PORT ?? 4000 : 'configured address'}`);
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => { await app.close(); process.exit(0); });
}
