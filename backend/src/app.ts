import Fastify from 'fastify';
import cors from '@fastify/cors';
import { routes } from './api/routes';
import { appMode } from './services/app-mode';
import { apiError, apiJson } from './services/api-response';

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
export async function createApp() {
  const app = Fastify({ bodyLimit: 8 * 1024 * 1024 });
  const origins = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:3000').split(',').map(value => value.trim());
  for (const origin of origins) {
    if (new URL(origin).origin !== origin) throw new Error('FRONTEND_ORIGINS must contain exact HTTP origins.');
  }
  await app.register(cors, { origin: origins, credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-property-id', 'x-demo-role', 'x-business-unit', 'x-demo-provider', 'x-inbound-secret'],
  });
  app.addHook('onRequest', async (request, reply) => {
    if (request.headers.origin && !origins.includes(request.headers.origin)) {
      return reply.code(403).send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' } });
    }
  });
  // Preserve request bytes so existing validation and provider authentication see the original body.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  app.get('/api/runtime', async (_request, reply) => reply.header('Cache-Control', 'no-store').send({ mode: appMode(), showDemoCredentials: process.env.SHOW_DEMO_CREDENTIALS === 'true', googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI) }));
  for (const route of routes) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const handler = (route.handlers as Record<string, unknown>)[method] as Handler | undefined;
      if (!handler) continue;
      app.route({ method, url: route.path, handler: async (request, reply) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        const body = request.body as Buffer | undefined;
        const webRequest = new Request(new URL(request.url, 'http://backend.local'), {
          method: request.method, headers,
          ...(body?.length && !['GET', 'HEAD'].includes(request.method) ? { body: new Uint8Array(body) } : {}),
        });
        const response = await handler(webRequest, { params: Promise.resolve(request.params as { id: string }) });
        reply.code(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        return reply.send(Buffer.from(await response.arrayBuffer()));
      } });
    }
  }
  app.setErrorHandler(async (error, _request, reply) => {
    const response = error instanceof Error && 'statusCode' in error && Number(error.statusCode) < 500
      ? apiJson({ error: { code: 'INVALID_REQUEST', message: error.message } }, Number(error.statusCode)) : apiError(error);
    reply.code(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    return reply.send(Buffer.from(await response.arrayBuffer()));
  });
  return app;
}
