/**
 * PROOFLYN — Structured JSON Logger with Secret Redaction
 * Writes exclusively to stderr so stdio MCP transport on stdout is never polluted.
 */

const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|cookie|api[-_]?key|session/i;

export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (/^Bearer\s+\S+/i.test(value)) {
      return 'Bearer [REDACTED]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '[REDACTED]' : redactValue(v);
    }
    return out;
  }
  return value;
}

export type LogLevel = 'info' | 'warn' | 'error';

export function logEvent(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown> = {}
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(redactValue(meta) as Record<string, unknown>),
  };
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}
