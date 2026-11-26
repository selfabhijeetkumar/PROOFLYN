/**
 * PROOFLYN — Honest Layered Extraction Engine
 * 1. MANUAL: Always available via API/UI.
 * 2. PDF_TEXT / CSV_PARSE: Deterministic library/template parsing with timeouts and try/catch.
 * 3. AI_VISION: Optional Gemini Vision for images ONLY if GEMINI_API_KEY is set; always NEEDS_REVIEW.
 * Never fabricates fields. Malformed files never crash the server.
 */

import {
  generateId,
  type Currency,
  type DocumentType,
  type ExtractedField,
  type ExtractionMethod,
  type QuantityUnit,
} from '@/core';
import { loadEnvFile } from '@/db/env';
import { logEvent } from '@/server/logger';

const EXTRACTION_VERSION = '1.0.0';
const DEFAULT_TIMEOUT_MS = 8000;

export interface ExtractionOutput {
  fields: ExtractedField[];
  method: ExtractionMethod;
  warning: string | null;
}

/**
 * Pure string decimal-to-minor-units converter (no floating-point multiplication).
 * Examples: "1,250.00" -> 125000, "1250" -> 125000, "99.5" -> 9950.
 */
export function parseDecimalToMinorUnits(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1];
  const frac = (match[2] || '').padEnd(2, '0').slice(0, 2);
  const combined = Number.parseInt(`${whole}${frac}`, 10);
  return Number.isSafeInteger(combined) ? combined : null;
}

function detectCurrency(raw: string): Currency | null {
  if (/\bINR\b|₹|Rs\.?/i.test(raw)) return 'INR';
  if (/\bUSD\b|\$/i.test(raw)) return 'USD';
  if (/\bEUR\b|€/i.test(raw)) return 'EUR';
  if (/\bGBP\b|£/i.test(raw)) return 'GBP';
  return null;
}

function detectUnit(raw: string): QuantityUnit | null {
  if (/\bUNITS?\b/i.test(raw)) return 'UNITS';
  if (/\bKGS?\b|\bKILOGRAMS?\b/i.test(raw)) return 'KG';
  if (/\bLITERS?\b|\bLITRES?\b|\bL\b/i.test(raw)) return 'LITERS';
  if (/\bMETERS?\b|\bMETRES?\b|\bM\b/i.test(raw)) return 'METERS';
  if (/\bPIECES?\b|\bPCS\b/i.test(raw)) return 'PIECES';
  return null;
}

function makeField(
  caseId: string,
  documentId: string,
  fieldName: string,
  rawText: string,
  extractedValue: string,
  numericValue: number | null,
  currency: Currency | null,
  unit: QuantityUnit | null,
  method: ExtractionMethod,
  lineNum: number,
  status: 'EXTRACTED' | 'NEEDS_REVIEW' = 'EXTRACTED'
): ExtractedField {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    documentId,
    caseId,
    fieldName,
    rawText,
    extractedValue,
    numericValue,
    currency,
    unit,
    presence: 'PRESENT',
    sourcePageNumber: 1,
    sourceOffset: `line:${lineNum}`,
    extractionMethod: method,
    extractionVersion: EXTRACTION_VERSION,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

export function extractFieldsFromText(
  text: string,
  caseId: string,
  documentId: string,
  documentType: DocumentType,
  method: ExtractionMethod
): ExtractedField[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const fields: ExtractedField[] = [];
  const seen = new Set<string>();

  const pushUnique = (field: ExtractedField) => {
    if (!seen.has(field.fieldName)) {
      seen.add(field.fieldName);
      fields.push(field);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // CSV "field,value" or "key: value"
    const kvMatch =
      /^(po[\s_-]*number|p\.o\.[\s_-]*number|purchase[\s_-]*order)\s*[:=,]\s*(.+)$/i.exec(line);
    if (kvMatch) {
      const val = kvMatch[2].trim();
      if (val) pushUnique(makeField(caseId, documentId, 'po_number', line, val, null, null, null, method, lineNum));
      continue;
    }

    const invMatch = /^(invoice[\s_-]*(?:number|no|#)|inv[\s_-]*#)\s*[:=,]\s*(.+)$/i.exec(line);
    if (invMatch) {
      const val = invMatch[2].trim();
      if (val) pushUnique(makeField(caseId, documentId, 'invoice_number', line, val, null, null, null, method, lineNum));
      continue;
    }

    const supMatch = /^(supplier(?:[\s_-]*name)?|vendor(?:[\s_-]*name)?)\s*[:=,]\s*(.+)$/i.exec(line);
    if (supMatch) {
      const val = supMatch[2].trim();
      if (val) pushUnique(makeField(caseId, documentId, 'supplier_name', line, val, null, null, null, method, lineNum));
      continue;
    }

    const dateMatch = /^(delivery[\s_-]*date|grn[\s_-]*date)\s*[:=,]\s*(.+)$/i.exec(line);
    if (dateMatch) {
      const val = dateMatch[2].trim();
      if (val) pushUnique(makeField(caseId, documentId, 'delivery_date', line, val, null, null, null, method, lineNum));
      continue;
    }

    const qtyMatch =
      /^(?:quantity[\s_-]*delivered|ordered[\s_-]*quantity|invoiced[\s_-]*quantity|quantity|qty)\s*[:=,]\s*(.+)$/i.exec(
        line
      );
    if (qtyMatch) {
      const rest = qtyMatch[1].trim();
      const numMatch = /(\d[\d,]*)/.exec(rest);
      const parsed = numMatch ? Number.parseInt(numMatch[1].replace(/,/g, ''), 10) : NaN;
      if (Number.isInteger(parsed) && parsed >= 0) {
        const unit = detectUnit(rest) ?? 'UNITS';
        pushUnique(
          makeField(caseId, documentId, 'quantity', line, String(parsed), parsed, null, unit, method, lineNum)
        );
      }
      continue;
    }

    const unitPriceMatch = /^(unit[\s_-]*price|rate)\s*[:=,]\s*(.+)$/i.exec(line);
    if (unitPriceMatch) {
      const rest = unitPriceMatch[2].trim();
      const numMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(rest);
      const minor = numMatch ? parseDecimalToMinorUnits(numMatch[1]) : null;
      if (minor !== null) {
        const currency = detectCurrency(rest) ?? 'INR';
        pushUnique(
          makeField(caseId, documentId, 'unit_price', line, String(minor), minor, currency, null, method, lineNum)
        );
      }
      continue;
    }

    const totalMatch = /^(total[\s_-]*amount|grand[\s_-]*total|total)\s*[:=,]\s*(.+)$/i.exec(line);
    if (totalMatch) {
      const rest = totalMatch[2].trim();
      const numMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(rest);
      const minor = numMatch ? parseDecimalToMinorUnits(numMatch[1]) : null;
      if (minor !== null) {
        const currency = detectCurrency(rest) ?? 'INR';
        pushUnique(
          makeField(caseId, documentId, 'total_amount', line, String(minor), minor, currency, null, method, lineNum)
        );
      }
    }
  }

  // Fallback header-row CSV parsing if key:value didn't yield fields
  if (fields.length === 0 && method === 'CSV_PARSE' && lines.length >= 2) {
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const values = lines[1].split(',').map((v) => v.trim());
    if (headers.length === values.length) {
      for (let idx = 0; idx < headers.length; idx++) {
        const h = headers[idx];
        const v = values[idx];
        if (!v) continue;
        if (['po_number', 'invoice_number', 'supplier_name', 'delivery_date'].includes(h)) {
          pushUnique(makeField(caseId, documentId, h, `${h}=${v}`, v, null, null, null, method, 2));
        } else if (h === 'quantity') {
          const parsed = Number.parseInt(v, 10);
          if (Number.isInteger(parsed) && parsed >= 0) {
            pushUnique(makeField(caseId, documentId, 'quantity', `${h}=${v}`, String(parsed), parsed, null, 'UNITS', method, 2));
          }
        } else if (h === 'unit_price' || h === 'total_amount') {
          const minor = parseDecimalToMinorUnits(v);
          if (minor !== null) {
            pushUnique(makeField(caseId, documentId, h, `${h}=${v}`, String(minor), minor, 'INR', null, method, 2));
          }
        }
      }
    }
  }

  // Keep documentType referenced for future template branching without unused parameter warning
  void documentType;
  return fields;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function extractWithOptionalGeminiVision(
  buffer: Buffer,
  extension: string,
  caseId: string,
  documentId: string,
  timeoutMs: number
): Promise<ExtractionOutput> {
  loadEnvFile();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      fields: [],
      method: 'AI_VISION',
      warning:
        'Image uploaded safely, but GEMINI_API_KEY is not configured. Enter fields manually or upload a text-based PDF/CSV.',
    };
  }

  const mimeType = extension === '.png' ? 'image/png' : 'image/jpeg';
  const prompt =
    'Extract only visible commercial document fields as JSON object with optional keys: ' +
    'po_number, invoice_number, supplier_name, delivery_date, quantity (integer string), unit_price (decimal string), total_amount (decimal string), currency (INR/USD/EUR/GBP), unit (UNITS/KG/LITERS/METERS/PIECES). ' +
    'Omit any field not clearly visible. Never guess.';

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await withTimeout(
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: buffer.toString('base64') } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }),
      timeoutMs,
      'Gemini vision extraction'
    );

    if (!response.ok) {
      return {
        fields: [],
        method: 'AI_VISION',
        warning: `Optional AI vision extraction returned HTTP ${response.status}; please enter fields manually.`,
      };
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawJson = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return {
        fields: [],
        method: 'AI_VISION',
        warning: 'Optional AI vision extraction returned no structured fields; please enter fields manually.',
      };
    }

    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const fields: ExtractedField[] = [];
    const currency = detectCurrency(String(parsed.currency ?? '')) ?? 'INR';
    const unit = detectUnit(String(parsed.unit ?? '')) ?? 'UNITS';

    for (const key of ['po_number', 'invoice_number', 'supplier_name', 'delivery_date']) {
      const val = parsed[key];
      if (typeof val === 'string' && val.trim()) {
        fields.push(
          makeField(caseId, documentId, key, val.trim(), val.trim(), null, null, null, 'AI_VISION', 1, 'NEEDS_REVIEW')
        );
      }
    }

    if (parsed.quantity !== undefined && parsed.quantity !== null) {
      const q = Number.parseInt(String(parsed.quantity), 10);
      if (Number.isInteger(q) && q >= 0) {
        fields.push(
          makeField(caseId, documentId, 'quantity', String(parsed.quantity), String(q), q, null, unit, 'AI_VISION', 1, 'NEEDS_REVIEW')
        );
      }
    }

    for (const key of ['unit_price', 'total_amount']) {
      if (parsed[key] !== undefined && parsed[key] !== null) {
        const minor = parseDecimalToMinorUnits(String(parsed[key]));
        if (minor !== null) {
          fields.push(
            makeField(caseId, documentId, key, String(parsed[key]), String(minor), minor, currency, null, 'AI_VISION', 1, 'NEEDS_REVIEW')
          );
        }
      }
    }

    return {
      fields,
      method: 'AI_VISION',
      warning:
        fields.length === 0
          ? 'Optional AI vision found no recognizable fields; please enter fields manually.'
          : 'AI-extracted fields require human verification (NEEDS_REVIEW).',
    };
  } catch (err) {
    logEvent('warn', 'ai_vision_extraction_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      fields: [],
      method: 'AI_VISION',
      warning: 'Optional AI vision extraction unavailable; please enter fields manually.',
    };
  }
}

export async function extractDocumentFields(input: {
  caseId: string;
  documentId: string;
  documentType: DocumentType;
  extension: string;
  buffer: Buffer;
  timeoutMs?: number;
}): Promise<ExtractionOutput> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (input.extension === '.csv' || input.extension === '.txt') {
    const text = input.buffer.toString('utf8');
    const fields = extractFieldsFromText(
      text,
      input.caseId,
      input.documentId,
      input.documentType,
      'CSV_PARSE'
    );
    return {
      fields,
      method: 'CSV_PARSE',
      warning:
        fields.length === 0
          ? 'No structured fields matched deterministic text rules; please add fields manually.'
          : null,
    };
  }

  if (input.extension === '.pdf') {
    try {
      const pdfParseMod = await import('pdf-parse');
      const pdfParse = (pdfParseMod.default ?? pdfParseMod) as unknown as (
        buf: Buffer | Uint8Array
      ) => Promise<{ text: string }>;
      // Copy into an unpooled Uint8Array (byteOffset === 0) because pdf.js v1.10 reads .buffer directly
      const pdfBytes = new Uint8Array(input.buffer);
      const parsed = await withTimeout(pdfParse(pdfBytes as unknown as Buffer), timeoutMs, 'PDF text extraction');
      const fields = extractFieldsFromText(
        parsed.text || '',
        input.caseId,
        input.documentId,
        input.documentType,
        'PDF_TEXT'
      );
      return {
        fields,
        method: 'PDF_TEXT',
        warning:
          fields.length === 0
            ? 'PDF parsed with 0 structured fields (it may be scanned or non-standard); please enter fields manually.'
            : null,
      };
    } catch (err) {
      logEvent('warn', 'pdf_extraction_failed', {
        documentId: input.documentId,
        message: err instanceof Error ? err.message : String(err),
      });
      return {
        fields: [],
        method: 'PDF_TEXT',
        warning: 'Deterministic PDF text extraction could not read this PDF; file preserved and manual entry is available.',
      };
    }
  }

  if (input.extension === '.png' || input.extension === '.jpg' || input.extension === '.jpeg') {
    return extractWithOptionalGeminiVision(
      input.buffer,
      input.extension,
      input.caseId,
      input.documentId,
      timeoutMs
    );
  }

  return {
    fields: [],
    method: 'MANUAL',
    warning: 'Unsupported automatic extraction format; use manual entry.',
  };
}
