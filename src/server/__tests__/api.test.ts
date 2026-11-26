import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/db/connection';
import { buildSyntheticPdfBuffer, hashPassword, seedDatabase } from '@/db/seed-data';
import { getMcpGateway } from '@/mcp/gateway';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { resetRateLimitsForTests } from '@/server/rate-limit';

import { POST as loginPost } from '@/app/api/v1/auth/login/route';
import { POST as logoutPost } from '@/app/api/v1/auth/logout/route';
import { GET as meGet } from '@/app/api/v1/auth/me/route';
import { GET as healthGet } from '@/app/api/v1/health/route';
import { GET as casesGet, POST as casesPost } from '@/app/api/v1/cases/route';
import { GET as caseDetailGet } from '@/app/api/v1/cases/[id]/route';
import { GET as docsGet, POST as docsPost } from '@/app/api/v1/cases/[id]/documents/route';
import { GET as docDownloadGet } from '@/app/api/v1/cases/[id]/documents/[docId]/download/route';
import { GET as fieldsGet, POST as fieldsPost } from '@/app/api/v1/cases/[id]/fields/route';
import { PATCH as verifyPatch } from '@/app/api/v1/cases/[id]/fields/[fieldId]/verify/route';
import { POST as reconcilePost } from '@/app/api/v1/cases/[id]/reconcile/route';
import { GET as discrepanciesGet } from '@/app/api/v1/cases/[id]/discrepancies/route';
import { GET as gapsGet } from '@/app/api/v1/cases/[id]/gaps/route';
import { GET as blockersGet } from '@/app/api/v1/cases/[id]/blockers/route';
import { PATCH as blockerPatch } from '@/app/api/v1/cases/[id]/blockers/[blockerId]/route';
import { GET as graphGet } from '@/app/api/v1/cases/[id]/graph/route';
import { GET as timelineGet } from '@/app/api/v1/cases/[id]/timeline/route';
import { GET as mcpCallsGet } from '@/app/api/v1/cases/[id]/mcp-calls/route';
import { GET as reportsGet, POST as reportsPost } from '@/app/api/v1/cases/[id]/reports/route';
import { GET as reportDownloadGet } from '@/app/api/v1/cases/[id]/reports/[reportId]/download/route';
import { GET as draftsGet, POST as draftsPost } from '@/app/api/v1/cases/[id]/follow-up-drafts/route';

function extractCookie(res: Response): string {
  const raw = res.headers.get('set-cookie');
  if (!raw) throw new Error('Expected Set-Cookie header');
  return raw.split(';')[0];
}

describe('PROOFLYN M4 REST API, Upload Security, Extraction, Verification & MCP Flow', () => {
  let tempRoot: string;
  let dbPath: string;
  let uploadDir: string;
  let inv1047CaseId: string;
  let investigatorCookie: string;
  let reviewerCookie: string;
  let outsiderCookie: string;

  const invEmail = 'investigator@prooflyn.dev';
  const invPass = 'TestInvestigator!123';
  const revEmail = 'reviewer@prooflyn.dev';
  const revPass = 'TestReviewer!123';
  const outEmail = 'outsider@other-org.dev';
  const outPass = 'TestOutsider!123';

  beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prooflyn-api-test-'));
    dbPath = path.join(tempRoot, 'test.db');
    uploadDir = path.join(tempRoot, 'uploads');

    process.env.DATABASE_PATH = dbPath;
    process.env.UPLOAD_DIR = uploadDir;
    process.env.SESSION_SECRET = 'test-session-secret-32-chars-minimum!';
    delete process.env.GEMINI_API_KEY;

    closeDb();
    const db = getDb();
    const seeded = seedDatabase(db, {
      investigatorEmail: invEmail,
      investigatorPassword: invPass,
      reviewerEmail: revEmail,
      reviewerPassword: revPass,
      uploadDir,
      includeExtraCases: false,
    });
    inv1047CaseId = seeded.inv1047CaseId;

    // Add second organization & outsider user for tenant isolation checks
    const repo = new InvestigationRepository(db);
    repo.upsertOrganization({
      id: 'org-other',
      name: 'Other Org',
      createdAt: '2026-11-27T00:00:00.000Z',
    });
    repo.upsertUser({
      id: 'user-outsider-1',
      email: outEmail,
      passwordHash: hashPassword(outPass),
      role: 'REVIEWER',
      organizationId: 'org-other',
      name: 'External Reviewer',
      createdAt: '2026-11-27T00:00:00.000Z',
    });

    const login = async (email: string, password: string) => {
      const res = await loginPost(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
      );
      expect(res.status).toBe(200);
      return extractCookie(res);
    };

    investigatorCookie = await login(invEmail, invPass);
    reviewerCookie = await login(revEmail, revPass);
    outsiderCookie = await login(outEmail, outPass);
  });

  beforeEach(() => {
    resetRateLimitsForTests();
  });

  afterAll(async () => {
    await getMcpGateway().close();
    closeDb();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('checks health, authentication, invalid credentials, logout, and cross-origin rejection', async () => {
    const h = await healthGet();
    expect(h.status).toBe(200);

    const unauth = await casesGet(new Request('http://localhost/api/v1/cases'));
    expect(unauth.status).toBe(401);

    const badLogin = await loginPost(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, password: 'wrong-password' }),
      })
    );
    expect(badLogin.status).toBe(401);

    const meRes = await meGet(
      new Request('http://localhost/api/v1/auth/me', {
        headers: { cookie: investigatorCookie },
      })
    );
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.data.user.email).toBe(invEmail);
    expect(meJson.data.user.passwordHash).toBeUndefined();

    // Cross-origin mutating request must be blocked
    const csrfRes = await casesPost(
      new Request('http://localhost/api/v1/cases', {
        method: 'POST',
        headers: {
          cookie: investigatorCookie,
          host: 'localhost:3000',
          origin: 'https://evil.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caseNumber: 'INV-CSRF', title: 'Blocked' }),
      })
    );
    expect(csrfRes.status).toBe(403);

    const outRes = await logoutPost(
      new Request('http://localhost/api/v1/auth/logout', { method: 'POST' })
    );
    expect(outRes.status).toBe(200);
    expect(outRes.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('enforces organization scoping and validates case creation', async () => {
    const outsiderRes = await caseDetailGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}`, {
        headers: { cookie: outsiderCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect(outsiderRes.status).toBe(404);

    const dupRes = await casesPost(
      new Request('http://localhost/api/v1/cases', {
        method: 'POST',
        headers: { cookie: investigatorCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseNumber: 'INV-1047', title: 'Duplicate Number' }),
      })
    );
    expect(dupRes.status).toBe(409);

    const createRes = await casesPost(
      new Request('http://localhost/api/v1/cases', {
        method: 'POST',
        headers: { cookie: investigatorCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseNumber: 'INV-3001',
          title: 'SYNTHETIC: Custom Upload Case',
          description: 'Created in integration test',
          buyerName: 'Buyer Co',
          supplierName: 'Supplier Co',
        }),
      })
    );
    expect(createRes.status).toBe(201);
    const createdJson = await createRes.json();
    expect(createdJson.data.case.caseNumber).toBe('INV-3001');
  });

  it('rejects unsafe uploads (spoofed magic bytes, executables, traversal, oversized) and handles valid PDF/CSV/PNG uploads honestly', async () => {
    const createRes = await casesPost(
      new Request('http://localhost/api/v1/cases', {
        method: 'POST',
        headers: { cookie: investigatorCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseNumber: 'INV-3002', title: 'Upload & Extraction Case' }),
      })
    );
    const caseId = (await createRes.json()).data.case.id as string;

    const upload = async (filename: string, bytes: Buffer, contentType: string, docType = 'INVOICE') => {
      const fd = new FormData();
      fd.append('documentType', docType);
      fd.append('file', new File([new Uint8Array(bytes)], filename, { type: contentType }));
      return docsPost(
        new Request(`http://localhost/api/v1/cases/${caseId}/documents`, {
          method: 'POST',
          headers: { cookie: investigatorCookie },
          body: fd,
        }),
        { params: Promise.resolve({ id: caseId }) }
      );
    };

    // 1. Executable disguised as PDF
    const mzFakePdf = await upload('evil.pdf', Buffer.from('MZ\x90\x00fake-exe'), 'application/pdf');
    expect(mzFakePdf.status).toBe(400);

    // 2. Plain text disguised as PDF (magic bytes mismatch)
    const textFakePdf = await upload('fake.pdf', Buffer.from('not really a pdf'), 'application/pdf');
    expect(textFakePdf.status).toBe(400);

    // 3. Path traversal filename
    const travRes = await upload('../../secret.txt', Buffer.from('hello'), 'text/plain');
    expect(travRes.status).toBe(400);

    // 4. Unsupported extension
    const zipRes = await upload('archive.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'application/zip');
    expect(zipRes.status).toBe(400);

    // 5. Oversize (> 10 MB)
    const bigBuf = Buffer.alloc(10 * 1024 * 1024 + 5, 0x41);
    const bigRes = await upload('huge.txt', bigBuf, 'text/plain');
    expect(bigRes.status).toBe(413);

    // 6. Malformed PDF (starts with %PDF- but corrupted body) -> stored safely without crash
    const corruptPdfRes = await upload('corrupt.pdf', Buffer.from('%PDF-1.4\n%%corrupted-stream'), 'application/pdf', 'SUPPORTING');
    expect(corruptPdfRes.status).toBe(201);
    const corruptJson = await corruptPdfRes.json();
    expect(corruptJson.data.fields).toHaveLength(0);
    expect(corruptJson.data.warning).toBeTruthy();

    // 7. Valid synthetic PDF -> deterministic PDF_TEXT extraction + downloadable with SHA-256
    const pdfBuf = buildSyntheticPdfBuffer([
      'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
      'Invoice Number: INV-3002',
      'Supplier: Delta Hydraulics',
      'Quantity: 25 UNITS',
      'Unit Price: INR 400.00',
      'Total Amount: INR 10000.00',
    ]);
    const validPdfRes = await upload('inv-3002.pdf', pdfBuf, 'application/pdf', 'INVOICE');
    expect(validPdfRes.status).toBe(201);
    const validPdfJson = await validPdfRes.json();
    expect(validPdfJson.data.fields.length).toBeGreaterThanOrEqual(4);
    const uploadedDocId = validPdfJson.data.document.id as string;
    const uploadedSha = validPdfJson.data.document.sha256 as string;

    const dlRes = await docDownloadGet(
      new Request(`http://localhost/api/v1/cases/${caseId}/documents/${uploadedDocId}/download`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: caseId, docId: uploadedDocId }) }
    );
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('x-document-sha256')).toBe(uploadedSha);

    // 8. Valid CSV upload -> CSV_PARSE extraction
    const csvBuf = Buffer.from('PO Number: PO-3002\nSupplier: Delta Hydraulics\nQuantity: 25 UNITS\nUnit Price: INR 400.00\n');
    const csvRes = await upload('po-3002.csv', csvBuf, 'text/csv', 'PURCHASE_ORDER');
    expect(csvRes.status).toBe(201);
    expect((await csvRes.json()).data.fields.length).toBeGreaterThanOrEqual(3);

    // 9. PNG image without GEMINI_API_KEY -> stored, 0 fabricated fields, explicit warning
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const pngRes = await upload('scan.png', pngSig, 'image/png', 'DELIVERY_RECORD');
    expect(pngRes.status).toBe(201);
    const pngJson = await pngRes.json();
    expect(pngJson.data.fields).toHaveLength(0);
    expect(pngJson.data.warning).toContain('GEMINI_API_KEY');

    // 10. Manual field entry fallback on the scanned delivery record
    const manualRes = await fieldsPost(
      new Request(`http://localhost/api/v1/cases/${caseId}/fields`, {
        method: 'POST',
        headers: { cookie: investigatorCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: pngJson.data.document.id,
          fieldName: 'quantity',
          value: '20',
          unit: 'UNITS',
        }),
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    expect(manualRes.status).toBe(201);
    expect((await manualRes.json()).data.field.extractionMethod).toBe('MANUAL');

    const docsListRes = await docsGet(
      new Request(`http://localhost/api/v1/cases/${caseId}/documents`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: caseId }) }
    );
    expect((await docsListRes.json()).data.documents).toHaveLength(4);
  });

  it('executes full INV-1047 verification, MCP-backed reconcile/graph/report, RBAC blocker review, idempotency, and hash-chain audit', async () => {
    // 1. Verify and correct a field (preserves rawText, appends VerificationRecord)
    const fieldsBeforeRes = await fieldsGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/fields`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect(fieldsBeforeRes.status).toBe(200);
    const fieldsBefore = (await fieldsBeforeRes.json()).data.fields as Array<{ id: string; fieldName: string; documentId: string }>;
    const delQtyField = fieldsBefore.find((f) => f.documentId === 'doc-inv1047-grn' && f.fieldName === 'quantity')!;
    const invQtyField = fieldsBefore.find((f) => f.documentId === 'doc-inv1047-inv' && f.fieldName === 'quantity')!;

    const verifyRes = await verifyPatch(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/fields/${delQtyField.id}/verify`, {
        method: 'PATCH',
        headers: { cookie: investigatorCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VERIFY', reason: 'Confirmed against signed GRN-2026-001.' }),
      }),
      { params: Promise.resolve({ id: inv1047CaseId, fieldId: delQtyField.id }) }
    );
    expect(verifyRes.status).toBe(200);
    expect((await verifyRes.json()).data.field.status).toBe('VERIFIED');

    const verifyInvRes = await verifyPatch(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/fields/${invQtyField.id}/verify`, {
        method: 'PATCH',
        headers: { cookie: investigatorCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VERIFY', reason: 'Confirmed against INV-1047.' }),
      }),
      { params: Promise.resolve({ id: inv1047CaseId, fieldId: invQtyField.id }) }
    );
    expect(verifyInvRes.status).toBe(200);

    // 2. Reconcile via MCP Gateway
    const recRes1 = await reconcilePost(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/reconcile`, {
        method: 'POST',
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect(recRes1.status).toBe(200);
    const recJson1 = await recRes1.json();
    expect(recJson1.data.reconciliation.reusedExistingRun).toBe(false);
    expect(recJson1.data.reconciliation.discrepancies.some((d: { ruleId: string }) => d.ruleId === 'R-QTY-01')).toBe(true);

    // Idempotent second reconcile
    const recRes2 = await reconcilePost(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/reconcile`, {
        method: 'POST',
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect(recRes2.status).toBe(200);
    expect((await recRes2.json()).data.reconciliation.reusedExistingRun).toBe(true);

    // 3. Discrepancies, Gaps, Blockers + RBAC on blocker update
    const discRes = await discrepanciesGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/discrepancies`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect((await discRes.json()).data.discrepancies.length).toBeGreaterThanOrEqual(1);

    const gapsRes = await gapsGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/gaps`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect((await gapsRes.json()).data.coverage.total).toBe(14);

    const blockersRes = await blockersGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/blockers`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    const blockers = (await blockersRes.json()).data.blockers as Array<{ id: string }>;
    expect(blockers.length).toBeGreaterThanOrEqual(1);

    // Investigator forbidden from acknowledging payment blocker
    const forbiddenBlocker = await blockerPatch(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/blockers/${blockers[0].id}`, {
        method: 'PATCH',
        headers: { cookie: investigatorCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACKNOWLEDGED', note: 'Attempt by investigator' }),
      }),
      { params: Promise.resolve({ id: inv1047CaseId, blockerId: blockers[0].id }) }
    );
    expect(forbiddenBlocker.status).toBe(403);

    // Reviewer allowed
    const allowedBlocker = await blockerPatch(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/blockers/${blockers[0].id}`, {
        method: 'PATCH',
        headers: { cookie: reviewerCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACKNOWLEDGED', note: 'Holding payment pending credit note' }),
      }),
      { params: Promise.resolve({ id: inv1047CaseId, blockerId: blockers[0].id }) }
    );
    expect(allowedBlocker.status).toBe(200);
    expect((await allowedBlocker.json()).data.blocker.status).toBe('ACKNOWLEDGED');

    // 4. Evidence graph via MCP Gateway
    const graphRes = await graphGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/graph`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect(graphRes.status).toBe(200);
    expect((await graphRes.json()).data.graph.nodes.length).toBeGreaterThanOrEqual(16);

    // 5. Timeline hash-chain verification + MCP calls log
    const timelineRes = await timelineGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/timeline`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    const timelineJson = await timelineRes.json();
    expect(timelineJson.data.chainVerification.valid).toBe(true);

    const mcpCallsRes = await mcpCallsGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/mcp-calls`, {
        headers: { cookie: investigatorCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    const mcpCalls = (await mcpCallsRes.json()).data.calls as Array<{ toolName: string; status: string }>;
    expect(mcpCalls.length).toBeGreaterThanOrEqual(4);
    expect(mcpCalls.every((c) => c.status === 'SUCCESS')).toBe(true);

    // 6. Report generation (via MCP) + reproducible hash + JSON/HTML download + follow-up draft
    const reportRes = await reportsPost(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/reports`, {
        method: 'POST',
        headers: { cookie: reviewerCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeHtml: true }),
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect(reportRes.status).toBe(201);
    const reportJson = await reportRes.json();
    const reportId = reportJson.data.generated.reportId as string;

    const reportsListRes = await reportsGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/reports`, {
        headers: { cookie: reviewerCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect((await reportsListRes.json()).data.reports.length).toBeGreaterThanOrEqual(1);

    const jsonDl = await reportDownloadGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/reports/${reportId}/download?format=json`, {
        headers: { cookie: reviewerCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId, reportId }) }
    );
    expect(jsonDl.status).toBe(200);
    expect(jsonDl.headers.get('content-type')).toContain('application/json');

    const htmlDl = await reportDownloadGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/reports/${reportId}/download?format=html`, {
        headers: { cookie: reviewerCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId, reportId }) }
    );
    expect(htmlDl.status).toBe(200);
    const htmlBody = await htmlDl.text();
    expect(htmlBody).toContain('INV-1047');
    expect(htmlBody).toContain('R-QTY-01');

    const draftRes = await draftsPost(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/follow-up-drafts`, {
        method: 'POST',
        headers: { cookie: reviewerCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect(draftRes.status).toBe(201);

    const draftsListRes = await draftsGet(
      new Request(`http://localhost/api/v1/cases/${inv1047CaseId}/follow-up-drafts`, {
        headers: { cookie: reviewerCookie },
      }),
      { params: Promise.resolve({ id: inv1047CaseId }) }
    );
    expect((await draftsListRes.json()).data.drafts).toHaveLength(1);
  });
});
