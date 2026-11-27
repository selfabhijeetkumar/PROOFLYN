'use client';

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new Error(`Request failed with HTTP ${res.status}`);
    }
    return undefined as T;
  }

  const json = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !json.success) {
    const msg = json.error?.message || `Request failed (${res.status})`;
    const code = json.error?.code ? `[${json.error.code}] ` : '';
    throw new Error(`${code}${msg}`);
  }
  return json.data as T;
}

export function formatMinorMoney(amountMinor: number | null | undefined, currency?: string | null): string {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, '0');
  const formattedMajor = major.toLocaleString('en-IN');
  return `${sign}${currency || 'INR'} ${formattedMajor}.${minor}`;
}
