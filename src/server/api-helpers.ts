/**
 * PROOFLYN — REST API Response, Error Mapping, Same-Origin & Request Parsing Helpers
 */

import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { generateId } from '@/core';
import { McpGatewayError } from '@/mcp/gateway';
import { logEvent } from '@/server/logger';
import { ServiceError } from '@/server/services/investigation-service';

export function ok<T>(data: T, status = 200, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: true, data },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(extraHeaders ?? {}),
      },
    }
  );
}

export function fail(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // Non-browser clients / curl / Vitest
  const host = req.headers.get('host');
  if (!host) return;
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.host !== host) {
      throw new ServiceError('FORBIDDEN_ORIGIN', 'Cross-origin mutating requests are rejected.', 403);
    }
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    throw new ServiceError('FORBIDDEN_ORIGIN', 'Invalid Origin header.', 403);
  }
}

export async function parseJsonBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ServiceError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}

export function handleApiError(err: unknown, route: string): NextResponse {
  const requestId = generateId();

  if (err instanceof ServiceError) {
    logEvent('warn', 'api_service_error', {
      requestId,
      route,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
    });
    return fail(err.code, err.message, err.statusCode);
  }

  if (err instanceof McpGatewayError) {
    logEvent('error', 'api_mcp_error', {
      requestId,
      route,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
    });
    return fail(err.code, err.message, err.statusCode);
  }

  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    logEvent('warn', 'api_validation_error', { requestId, route, issues });
    return fail('VALIDATION_ERROR', 'Input validation failed.', 400, issues);
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  logEvent('error', 'api_unhandled_error', { requestId, route, message });
  return fail('INTERNAL_ERROR', 'An unexpected error occurred.', 500, { requestId });
}
