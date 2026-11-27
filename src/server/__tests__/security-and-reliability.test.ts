import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildEvidenceGraph,
  buildReport,
  createEventHash,
  detectGaps,
  generateReportHtml,
  reconcile,
  sha256,
  verifyEventChain,
  type ExtractedField,
  type InvestigationCase,
  type InvestigationEvent,
  type SourceDocument,
} from '@/core';
import { closeDb, getDb } from '@/db/connection';
import { seedDatabase } from '@/db/seed-data';
import { getMcpGateway, McpGatewayError } from '@/mcp/gateway';
import { GET as caseDetailGet } from '@/app/api/v1/cases/[id]/route';
import { POST as loginPost } from '@/app/api/v1/auth/login/route';
import { extractFieldsFromText, parseDecimalToMinorUnits } from '@/server/extraction';
import { redactValue } from '@/server/logger';
import { checkRateLimit, resetRateLimitsForTests } from '@/server/rate-limit';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';

describe('PROOFLYN M7 Security, Extraction, Tamper Detection & MCP Reliability', () => {
  let tempRoot: string;
  let dbPath: string;
  let uploadDir: string;
  let investigatorCookie: string;

  const invEmail = 'sec-investigator@prooflyn.dev';
  const invPass = 'SecTestPass!2026';

  beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prooflyn-m7-test-'));
    dbPath = path.join(tempRoot, 'm7.db');
    uploadDir = path.join(tempRoot, 'uploads');

    process.env.DATABASE_PATH = dbPath;
    process.env.UPLOAD_DIR = uploadDir;
    process.env.SESSION_SECRET = 'm7-test-session-secret-32-chars-long!';

    closeDb();
    const db = getDb();
    seedDatabase(db, {
      investigatorEmail: invEmail,
      investigatorPassword: invPass,
      reviewerEmail: 'sec-reviewer@prooflyn.dev',
      reviewerPassword: 'SecReviewer!2026',
      uploadDir,
      includeExtraCases: false,
    });

    const loginRes = await loginPost(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, password: invPass }),
      })
    );
    expect(loginRes.status).toBe(200);
    investigatorCookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
  });

  beforeEach(() => {
    resetRateLimitsForTests();
  });

  afterAll(async () => {
    await getMcpGateway().close();
    closeDb();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('converts decimal currency strings to exact integer minor units without floats', () => {
    expect(parseDecimalToMinorUnits('1,250.00')).toBe(125000);
    expect(parseDecimalToMinorUnits('1250')).toBe(125000);
    expect(parseDecimalToMinorUnits('99.5')).toBe(9950);
    expect(parseDecimalToMinorUnits('0.01')).toBe(1);
    expect(parseDecimalToMinorUnits('invalid-money')).toBeNull();
    expect(parseDecimalToMinorUnits('-50.00')).toBeNull();
  });

  it('extracts structured fields deterministically from text without fabricating missing fields', () => {
    const fields = extractFieldsFromText(
      [
        'Invoice Number: INV-9001',
        'Supplier: Precision Valves Ltd',
        'Quantity: 45 KG',
        'Unit Price: INR 250.50',
      ].join('\n'),
      'case-text-1',
      'doc-text-1',
      'INVOICE',
      'CSV_PARSE'
    );

    const byName = new Map(fields.map((f) => [f.fieldName, f]));
    expect(byName.get('invoice_number')?.extractedValue).toBe('INV-9001');
    expect(byName.get('supplier_name')?.extractedValue).toBe('Precision Valves Ltd');
    expect(byName.get('quantity')?.numericValue).toBe(45);
    expect(byName.get('quantity')?.unit).toBe('KG');
    expect(byName.get('unit_price')?.numericValue).toBe(25050);
    expect(byName.get('unit_price')?.currency).toBe('INR');
    expect(byName.get('total_amount')).toBeUndefined();
  });

  it('redacts sensitive keys and Bearer tokens in structured log payloads', () => {
    const sanitized = redactValue({
      actorId: 'user-1',
      password: 'plain-password',
      apiKey: 'AIzaSecret',
      nested: {
        sessionSecret: 'super-secret',
        authorization: 'Bearer eyJhbGciOi',
        cookie: 'prooflyn_session=abc',
        safeNote: 'INV-1047',
      },
      headers: ['Bearer another-secret-token', 'application/json'],
    }) as Record<string, unknown>;

    expect(sanitized.actorId).toBe('user-1');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    const nested = sanitized.nested as Record<string, unknown>;
    expect(nested.sessionSecret).toBe('[REDACTED]');
    expect(nested.authorization).toBe('[REDACTED]');
    expect(nested.cookie).toBe('[REDACTED]');
    expect(nested.safeNote).toBe('INV-1047');
    expect((sanitized.headers as string[])[0]).toBe('Bearer [REDACTED]');
  });

  it('escapes HTML/XSS payloads in report HTML output and preserves deterministic snapshot hashes', () => {
    const xssTitle = '<script>alert("xss")</script> & "quote"';
    const caseData: InvestigationCase = {
      id: 'case-xss',
      caseNumber: 'INV-XSS',
      title: xssTitle,
      description: '<img src=x onerror=alert(1)>',
      status: 'CREATED',
      organizationId: 'org-1',
      createdBy: 'user-1',
      createdAt: '2026-11-27T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    };
    const doc: SourceDocument = {
      id: 'doc-xss-1',
      caseId: 'case-xss',
      documentType: 'INVOICE',
      originalFilename: '<svg onload=alert(1)>.pdf',
      storagePath: '/tmp/uuid.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128,
      sha256: sha256('doc-xss'),
      uploadedBy: 'user-1',
      uploadedAt: '2026-11-27T00:00:00.000Z',
    };
    const field: ExtractedField = {
      id: 'f-xss-1',
      documentId: doc.id,
      caseId: caseData.id,
      fieldName: 'supplier_name',
      rawText: '<b>Bad</b>',
      extractedValue: '<script>evil()</script>',
      numericValue: null,
      currency: null,
      unit: null,
      presence: 'PRESENT',
      sourcePageNumber: 1,
      sourceOffset: 'line:1',
      extractionMethod: 'MANUAL',
      extractionVersion: '1.0.0',
      status: 'EXTRACTED',
      createdAt: '2026-11-27T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    };

    const rec = reconcile({ caseId: caseData.id, documents: [doc], fields: [field], actorId: 'user-1' });
    const gapRes = detectGaps({
      caseId: caseData.id,
      documents: [doc],
      fields: [field],
      reconciliationRunId: rec.runId,
    });
    const graph = buildEvidenceGraph({
      caseData,
      documents: [doc],
      fields: [field],
      discrepancies: rec.discrepancies,
      gaps: gapRes.gaps,
    });

    const input = {
      caseData,
      documents: [doc],
      fields: [field],
      discrepancies: rec.discrepancies,
      gaps: gapRes.gaps,
      blockers: [],
      confidenceAssessments: gapRes.confidenceAssessments,
      graph,
      events: [],
      reconciliationRunId: rec.runId,
      generatedBy: 'user-1',
      generatedAt: '2026-11-27T00:00:00.000Z',
    };

    const first = buildReport(input);
    const second = buildReport(input);
    expect(first.report.snapshotHash).toBe(second.report.snapshotHash);

    const html = generateReportHtml(first.content);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;.pdf');
  });

  it('detects tampering in the investigation event hash chain', () => {
    const h1 = createEventHash('e1', 'CASE_CREATED', 'c1', '2026-11-27T00:00:00Z', null, 'u1', 'Created', {});
    const h2 = createEventHash('e2', 'DOCUMENT_ADDED', 'c1', '2026-11-27T00:01:00Z', h1, 'u1', 'Uploaded', {});

    const validEvents: InvestigationEvent[] = [
      {
        id: 'e1',
        caseId: 'c1',
        eventType: 'CASE_CREATED',
        actorId: 'u1',
        description: 'Created',
        metadata: {},
        previousEventHash: null,
        eventHash: h1,
        createdAt: '2026-11-27T00:00:00Z',
      },
      {
        id: 'e2',
        caseId: 'c1',
        eventType: 'DOCUMENT_ADDED',
        actorId: 'u1',
        description: 'Uploaded',
        metadata: {},
        previousEventHash: h1,
        eventHash: h2,
        createdAt: '2026-11-27T00:01:00Z',
      },
    ];

    expect(verifyEventChain(validEvents).valid).toBe(true);

    const tampered = [
      { ...validEvents[0], description: 'Tampered Description' },
      validEvents[1],
    ];
    const tamperedCheck = verifyEventChain(tampered);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.brokenAt).toBe(0);
  });

  it('enforces fixed-window rate limits with HTTP 429 RATE_LIMITED', () => {
    const prevDisable = process.env.DISABLE_RATE_LIMIT;
    delete process.env.DISABLE_RATE_LIMIT;
    try {
      expect(checkRateLimit('test:upload:user-1', 2, 60_000).remaining).toBe(1);
      expect(checkRateLimit('test:upload:user-1', 2, 60_000).remaining).toBe(0);
      expect(() => checkRateLimit('test:upload:user-1', 2, 60_000)).toThrowError(
        /Too many requests/
      );
    } finally {
      if (prevDisable !== undefined) {
        process.env.DISABLE_RATE_LIMIT = prevDisable;
      }
    }
  });

  it('returns 404 on invalid REST case ID and logs MCP error cleanly on unknown case', async () => {
    const missingRes = await caseDetailGet(
      new Request('http://localhost/api/v1/cases/non-existent-case-id', {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: 'non-existent-case-id' }) }
    );
    expect(missingRes.status).toBe(404);

    const db = getDb();
    const repo = new InvestigationRepository(db);
    await expect(
      getMcpGateway().callTool(
        'get_case_context',
        { caseId: 'non-existent-case-id', actorId: 'user-investigator-1' },
        repo,
        { databasePath: dbPath }
      )
    ).rejects.toBeInstanceOf(McpGatewayError);

    const calls = repo.listMcpToolCalls('non-existent-case-id');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1].status).toBe('ERROR');
  });
});
