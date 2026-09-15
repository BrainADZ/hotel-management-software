import { DomainError } from '@hotel/shared/domain';
import { ZodError } from 'zod';

export function apiJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function apiError(error: unknown): Response {
  if (error instanceof DomainError) {
    return apiJson(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      error.status,
    );
  }

  if (error instanceof ZodError) {
    return apiJson(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: error.issues[0]?.message ?? 'Invalid request.',
        },
      },
      400,
    );
  }

  /*
   * Keep the HTTP response generic for production security,
   * but log the real server-side failure so local/runtime debugging
   * shows the exact PostgreSQL/Drizzle/JavaScript error.
   */
  if (error instanceof Error) {
    console.error('Application context API failure', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    });
  } else {
    console.error('Application context API failure', {
      error,
    });
  }

  return apiJson(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The operation could not be completed.',
      },
    },
    500,
  );
}
