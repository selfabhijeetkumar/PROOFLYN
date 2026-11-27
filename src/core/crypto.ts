/**
 * PROOFLYN — Crypto/hash utilities
 * SHA-256 for documents, canonical object hashing, event hash chain.
 */

import crypto from 'node:crypto';

/** Compute SHA-256 hash of a Buffer or string */
export function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Recursively canonicalize a value with sorted object keys for deterministic JSON serialization */
export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return `{${entries.join(',')}}`;
}

/** Compute SHA-256 of any JSON-serializable value (deep key-order independent) */
export function hashObject(obj: unknown): string {
  return sha256(canonicalStringify(obj));
}

/** Create event hash for the append-only hash chain */
export function createEventHash(
  eventId: string,
  eventType: string,
  caseId: string,
  timestamp: string,
  previousHash: string | null,
  actorId = '',
  description = '',
  metadata: Record<string, unknown> = {}
): string {
  const payload = canonicalStringify({
    eventId,
    eventType,
    caseId,
    timestamp,
    previousHash: previousHash || 'GENESIS',
    actorId,
    description,
    metadata,
  });
  return sha256(payload);
}

/** Verify an event chain: each event's hash matches its computed value and links to the prior event */
export function verifyEventChain(
  events: Array<{
    id: string;
    eventType: string;
    caseId: string;
    createdAt: string;
    previousEventHash: string | null;
    eventHash: string;
    actorId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }>
): { valid: boolean; brokenAt?: number; reason?: string } {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const expectedHash = createEventHash(
      e.id,
      e.eventType,
      e.caseId,
      e.createdAt,
      e.previousEventHash,
      e.actorId ?? '',
      e.description ?? '',
      e.metadata ?? {}
    );
    if (expectedHash !== e.eventHash) {
      return {
        valid: false,
        brokenAt: i,
        reason: `Event ${e.id} hash mismatch: expected ${expectedHash}, got ${e.eventHash}`,
      };
    }
    if (i === 0 && e.previousEventHash !== null) {
      return {
        valid: false,
        brokenAt: 0,
        reason: `Genesis event ${e.id} must have null previousEventHash`,
      };
    }
    if (i > 0 && e.previousEventHash !== events[i - 1].eventHash) {
      return {
        valid: false,
        brokenAt: i,
        reason: `Event ${e.id} previous hash doesn't match prior event hash`,
      };
    }
  }
  return { valid: true };
}

/** Generate a UUID v4 */
export function generateId(): string {
  return crypto.randomUUID();
}
