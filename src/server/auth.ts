/**
 * PROOFLYN — Authentication, Signed httpOnly Session Cookies, and RBAC helpers
 * Credentials and secrets are read from environment variables, never hardcoded.
 */

import crypto from 'node:crypto';
import type { UserRole } from '@/core';
import { loadEnvFile } from '@/db/env';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { ServiceError } from '@/server/services/investigation-service';

export const SESSION_COOKIE_NAME = 'prooflyn_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string;
  name: string;
  exp: number;
}

export interface AuthenticatedActor {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  name: string;
}

const globalForAuth = globalThis as unknown as {
  __prooflynEphemeralSecret?: string;
};

function getSessionSecret(): string {
  loadEnvFile();
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (!globalForAuth.__prooflynEphemeralSecret) {
    globalForAuth.__prooflynEphemeralSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalForAuth.__prooflynEphemeralSecret;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function signSessionToken(
  actor: AuthenticatedActor,
  ttlSeconds: number = SESSION_TTL_SECONDS
): string {
  const payload: SessionPayload = {
    userId: actor.id,
    email: actor.email,
    role: actor.role,
    organizationId: actor.organizationId,
    name: actor.name,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encodedPayload)
      .digest();
    const actualSig = base64UrlDecode(encodedSig);
    if (actualSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as SessionPayload;
    if (!payload.userId || !payload.organizationId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      out[key] = decodeURIComponent(val);
    }
  }
  return out;
}

export function getSessionActor(
  req: Request,
  repo: InvestigationRepository = new InvestigationRepository()
): AuthenticatedActor | null {
  const cookies = parseCookieHeader(req.headers.get('cookie'));
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = repo.getUserById(payload.userId);
  if (!user || user.organizationId !== payload.organizationId) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    name: user.name,
  };
}

export function requireAuth(
  req: Request,
  repo: InvestigationRepository = new InvestigationRepository()
): AuthenticatedActor {
  const actor = getSessionActor(req, repo);
  if (!actor) {
    throw new ServiceError('UNAUTHORIZED', 'Authentication required.', 401);
  }
  return actor;
}

export function buildSessionCookieHeader(token: string): string {
  const secureFlag = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secureFlag}`;
}

export function buildClearSessionCookieHeader(): string {
  const secureFlag = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`;
}
