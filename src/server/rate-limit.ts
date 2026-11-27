/**
 * PROOFLYN — In-memory sliding/fixed-window rate limiter
 * Protects login, document upload, and report generation endpoints.
 */

import { ServiceError } from '@/server/services/investigation-service';

interface RateBucket {
  count: number;
  resetAt: number;
}

const globalForLimiter = globalThis as unknown as {
  __prooflynRateBuckets?: Map<string, RateBucket>;
};

function getBuckets(): Map<string, RateBucket> {
  if (!globalForLimiter.__prooflynRateBuckets) {
    globalForLimiter.__prooflynRateBuckets = new Map<string, RateBucket>();
  }
  return globalForLimiter.__prooflynRateBuckets;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { remaining: number; resetAt: number } {
  if (process.env.DISABLE_RATE_LIMIT === '1') {
    return { remaining: maxRequests, resetAt: Date.now() + windowMs };
  }

  const buckets = getBuckets();
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const next: RateBucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { remaining: maxRequests - 1, resetAt: next.resetAt };
  }

  if (current.count >= maxRequests) {
    throw new ServiceError(
      'RATE_LIMITED',
      'Too many requests. Please wait before retrying.',
      429
    );
  }

  current.count += 1;
  return { remaining: maxRequests - current.count, resetAt: current.resetAt };
}

export function resetRateLimitsForTests(): void {
  getBuckets().clear();
}
