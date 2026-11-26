/**
 * PROOFLYN — Unit Tests for Core Reconciliation, Gap, Blocker, Graph, Report & Crypto Engine
 */

import { describe, it, expect } from 'vitest';
import { reconcile } from '../reconciliation';
import { detectGaps } from '../evidence-gaps';
import { assessBlockers } from '../payment-blockers';
import { buildEvidenceGraph } from '../evidence-graph';
import { buildReport, generateReportHtml } from '../report-builder';
import {
  verifyEventChain,
  createEventHash,
  sha256,
  hashObject,
} from '../crypto';
import type {
  SourceDocument,
  ExtractedField,
  InvestigationCase,
  InvestigationEvent,
} from '../types';

function makeDoc(
  id: string,
  type: 'PURCHASE_ORDER' | 'INVOICE' | 'DELIVERY_RECORD',
  filename: string
): SourceDocument {
  return {
    id,
    caseId: 'case-1',
    documentType: type,
    originalFilename: filename,
    storagePath: `/uploads/${id}`,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    sha256: sha256(Buffer.from(id)),
    uploadedBy: 'user-1',
    uploadedAt: '2026-11-27T00:00:00Z',
  };
}

function makeField(
  id: string,
  documentId: string,
  fieldName: string,
  numericValue: number | null,
  opts: Partial<ExtractedField> = {}
): ExtractedField {
  return {
    id,
    documentId,
    caseId: 'case-1',
    fieldName,
    rawText: numericValue !== null ? String(numericValue) : null,
    extractedValue: numericValue !== null ? String(numericValue) : null,
    numericValue,
    currency: null,
    unit: null,
    presence: numericValue !== null ? 'PRESENT' : 'MISSING',
    sourcePageNumber: 1,
    sourceOffset: null,
    extractionMethod: 'PDF_TEXT',
    extractionVersion: '1.0.0',
    status: 'EXTRACTED',
    createdAt: '2026-11-27T00:00:00Z',
    updatedAt: '2026-11-27T00:00:00Z',
    ...opts,
  };
}

const INV1047_DOCS = [
  makeDoc('po-1', 'PURCHASE_ORDER', 'PO-2026-001.pdf'),
  makeDoc('inv-1', 'INVOICE', 'INV-1047.pdf'),
  makeDoc('del-1', 'DELIVERY_RECORD', 'GRN-2026-001.pdf'),
];

const INV1047_FIELDS: ExtractedField[] = [
  makeField('f-po-qty', 'po-1', 'quantity', 100, { currency: 'INR', unit: 'UNITS' }),
  makeField('f-po-price', 'po-1', 'unit_price', 125000, { currency: 'INR' }),
  makeField('f-po-total', 'po-1', 'total_amount', 12500000, { currency: 'INR' }),
  makeField('f-po-supplier', 'po-1', 'supplier_name', null, {
    extractedValue: 'TechCorp Solutions Pvt. Ltd.',
    presence: 'PRESENT',
  }),
  makeField('f-inv-qty', 'inv-1', 'quantity', 100, { currency: 'INR', unit: 'UNITS' }),
  makeField('f-inv-price', 'inv-1', 'unit_price', 125000, { currency: 'INR' }),
  makeField('f-inv-total', 'inv-1', 'total_amount', 12500000, { currency: 'INR' }),
  makeField('f-inv-num', 'inv-1', 'invoice_number', null, {
    extractedValue: 'INV-1047',
    presence: 'PRESENT',
  }),
  makeField('f-inv-supplier', 'inv-1', 'supplier_name', null, {
    extractedValue: 'TechCorp Solutions Pvt. Ltd.',
    presence: 'PRESENT',
  }),
  makeField('f-del-qty', 'del-1', 'quantity', 90, { unit: 'UNITS' }),
  makeField('f-del-date', 'del-1', 'delivery_date', null, {
    extractedValue: '2026-11-15',
    presence: 'PRESENT',
  }),
];

describe('Core Reconciliation Engine', () => {
  describe('INV-1047 Golden Case', () => {
    it('detects 10-unit quantity discrepancy (R-QTY-01) and 12,500.00 INR variance', () => {
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: INV1047_FIELDS,
        actorId: 'user-1',
      });

      const qtyDisc = result.discrepancies.filter((d) => d.ruleId === 'R-QTY-01');
      expect(qtyDisc).toHaveLength(1);
      expect(qtyDisc[0].discrepancyType).toBe('QUANTITY_MISMATCH');
      expect(qtyDisc[0].expectedValue).toBe('90');
      expect(qtyDisc[0].actualValue).toBe('100');
      expect(qtyDisc[0].varianceValue).toBe(1250000);
      expect(qtyDisc[0].varianceCurrency).toBe('INR');
      expect(qtyDisc[0].confidence).toBe('SUPPORTED_UNVERIFIED');
    });

    it('upgrades finding confidence to VERIFIED once fields are human-verified', () => {
      const verifiedFields = INV1047_FIELDS.map((f) => ({ ...f, status: 'VERIFIED' as const }));
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: verifiedFields,
        actorId: 'user-1',
      });

      const qtyDisc = result.discrepancies.find((d) => d.ruleId === 'R-QTY-01');
      expect(qtyDisc?.confidence).toBe('VERIFIED');
    });

    it('PO qty and unit price match invoice — no R-QTY-02 or R-PRC-01', () => {
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: INV1047_FIELDS,
        actorId: 'user-1',
      });

      expect(result.discrepancies.filter((d) => d.ruleId === 'R-QTY-02')).toHaveLength(0);
      expect(result.discrepancies.filter((d) => d.ruleId === 'R-PRC-01')).toHaveLength(0);
    });

    it('detects partial delivery (R-DLV-02)', () => {
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: INV1047_FIELDS,
        actorId: 'user-1',
      });

      const partial = result.discrepancies.filter((d) => d.ruleId === 'R-DLV-02');
      expect(partial).toHaveLength(1);
      expect(partial[0].discrepancyType).toBe('PARTIAL_DELIVERY');
    });

    it('produces deterministic input snapshot hash and records rulesVersion', () => {
      const r1 = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: INV1047_FIELDS,
        actorId: 'user-1',
      });
      const r2 = reconcile({
        caseId: 'case-1',
        documents: [...INV1047_DOCS].reverse(),
        fields: [...INV1047_FIELDS].reverse(),
        actorId: 'user-1',
      });
      expect(r1.inputSnapshotHash).toBe(r2.inputSnapshotHash);
      expect(r1.rulesVersion).toBe('1.0.0');
    });
  });

  describe('PO vs Invoice & Price Rules (R-QTY-02, R-PRC-01)', () => {
    it('detects PO vs Invoice quantity conflict (R-QTY-02)', () => {
      const modified = INV1047_FIELDS.map((f) =>
        f.id === 'f-inv-qty' ? { ...f, numericValue: 110, extractedValue: '110' } : f
      );
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: modified,
        actorId: 'user-1',
      });
      expect(result.discrepancies.filter((d) => d.ruleId === 'R-QTY-02')).toHaveLength(1);
    });

    it('detects unit price mismatch when both sides have matching currency (R-PRC-01)', () => {
      const modified = INV1047_FIELDS.map((f) =>
        f.id === 'f-inv-price' ? { ...f, numericValue: 135000, extractedValue: '135000' } : f
      );
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: modified,
        actorId: 'user-1',
      });
      const prc = result.discrepancies.filter((d) => d.ruleId === 'R-PRC-01');
      expect(prc).toHaveLength(1);
      expect(prc[0].varianceValue).toBe(10000);
    });
  });

  describe('Currency and Unit Mismatch (R-CUR-01)', () => {
    it('blocks price comparison and emits R-CUR-01 on currency mismatch', () => {
      const modified = INV1047_FIELDS.map((f) =>
        f.documentId === 'inv-1' && f.currency ? { ...f, currency: 'USD' as const } : f
      );
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: modified,
        actorId: 'user-1',
      });
      expect(
        result.discrepancies.some(
          (d) => d.ruleId === 'R-CUR-01' && d.discrepancyType === 'CURRENCY_MISMATCH'
        )
      ).toBe(true);
      expect(result.discrepancies.filter((d) => d.ruleId === 'R-PRC-01')).toHaveLength(0);
    });

    it('blocks quantity comparison and emits R-CUR-01 on unit mismatch', () => {
      const modified = INV1047_FIELDS.map((f) =>
        f.id === 'f-del-qty' ? { ...f, unit: 'KG' as const } : f
      );
      const result = reconcile({
        caseId: 'case-1',
        documents: INV1047_DOCS,
        fields: modified,
        actorId: 'user-1',
      });
      expect(
        result.discrepancies.some(
          (d) => d.ruleId === 'R-CUR-01' && d.discrepancyType === 'UNIT_MISMATCH'
        )
      ).toBe(true);
      expect(result.discrepancies.filter((d) => d.ruleId === 'R-QTY-01')).toHaveLength(0);
    });
  });

  describe('Missing Delivery, Duplicates, Rejected, and Missing is NOT zero', () => {
    it('does NOT create R-QTY-01 when delivery record is missing', () => {
      const docs = INV1047_DOCS.filter((d) => d.documentType !== 'DELIVERY_RECORD');
      const fields = INV1047_FIELDS.filter((f) => f.documentId !== 'del-1');
      const result = reconcile({ caseId: 'case-1', documents: docs, fields, actorId: 'user-1' });
      expect(result.discrepancies.filter((d) => d.ruleId === 'R-QTY-01')).toHaveLength(0);
    });

    it('detects duplicate invoices (R-DUP-01) case-insensitively', () => {
      const docs = [
        makeDoc('inv-dup-1', 'INVOICE', 'INV-1047.pdf'),
        makeDoc('inv-dup-2', 'INVOICE', 'INV-1047-copy.pdf'),
      ];
      const fields = [
        makeField('f-dup1-num', 'inv-dup-1', 'invoice_number', null, {
          extractedValue: 'INV-1047',
          presence: 'PRESENT',
        }),
        makeField('f-dup1-sup', 'inv-dup-1', 'supplier_name', null, {
          extractedValue: 'TechCorp',
          presence: 'PRESENT',
        }),
        makeField('f-dup2-num', 'inv-dup-2', 'invoice_number', null, {
          extractedValue: 'inv-1047',
          presence: 'PRESENT',
        }),
        makeField('f-dup2-sup', 'inv-dup-2', 'supplier_name', null, {
          extractedValue: ' techcorp ',
          presence: 'PRESENT',
        }),
      ];

      const result = reconcile({ caseId: 'case-1', documents: docs, fields, actorId: 'user-1' });
      expect(result.discrepancies.filter((d) => d.ruleId === 'R-DUP-01')).toHaveLength(1);
    });

    it('refuses arithmetic on MISSING, INVALID, or REJECTED fields', () => {
      const docs = [
        makeDoc('inv-m', 'INVOICE', 'invoice.pdf'),
        makeDoc('del-m', 'DELIVERY_RECORD', 'delivery.pdf'),
      ];
      const fieldsMissing = [
        makeField('f1', 'inv-m', 'quantity', null, { presence: 'MISSING' }),
        makeField('f2', 'del-m', 'quantity', 90),
      ];
      const fieldsInvalid = [
        makeField('f1', 'inv-m', 'quantity', 100, { presence: 'INVALID' }),
        makeField('f2', 'del-m', 'quantity', 90),
      ];
      const fieldsRejected = [
        makeField('f1', 'inv-m', 'quantity', 100, { status: 'REJECTED' }),
        makeField('f2', 'del-m', 'quantity', 90),
      ];

      expect(
        reconcile({ caseId: 'case-1', documents: docs, fields: fieldsMissing, actorId: 'u' })
          .discrepancies
      ).toHaveLength(0);
      expect(
        reconcile({ caseId: 'case-1', documents: docs, fields: fieldsInvalid, actorId: 'u' })
          .discrepancies
      ).toHaveLength(0);
      expect(
        reconcile({ caseId: 'case-1', documents: docs, fields: fieldsRejected, actorId: 'u' })
          .discrepancies
      ).toHaveLength(0);
    });

    it('sums delivery quantities across multiple partial delivery records', () => {
      const docs = [
        makeDoc('po-p', 'PURCHASE_ORDER', 'po.pdf'),
        makeDoc('inv-p', 'INVOICE', 'invoice.pdf'),
        makeDoc('del-p1', 'DELIVERY_RECORD', 'delivery1.pdf'),
        makeDoc('del-p2', 'DELIVERY_RECORD', 'delivery2.pdf'),
        makeDoc('del-p3', 'DELIVERY_RECORD', 'delivery3.pdf'),
      ];
      const fields = [
        makeField('f-po-p-qty', 'po-p', 'quantity', 100),
        makeField('f-inv-p-qty', 'inv-p', 'quantity', 100),
        makeField('f-del-p1-qty', 'del-p1', 'quantity', 30),
        makeField('f-del-p2-qty', 'del-p2', 'quantity', 30),
        makeField('f-del-p3-qty', 'del-p3', 'quantity', 25),
      ];

      const result = reconcile({ caseId: 'case-1', documents: docs, fields, actorId: 'user-1' });
      const qtyDisc = result.discrepancies.filter((d) => d.ruleId === 'R-QTY-01');
      expect(qtyDisc).toHaveLength(1);
      expect(qtyDisc[0].expectedValue).toBe('85');
      expect(result.discrepancies.filter((d) => d.ruleId === 'R-DLV-02')).toHaveLength(1);
    });
  });
});

describe('Evidence Gap Detection & Confidence Ladder', () => {
  it('detects missing delivery record gap (R-DLV-01)', () => {
    const docs = INV1047_DOCS.filter((d) => d.documentType !== 'DELIVERY_RECORD');
    const fields = INV1047_FIELDS.filter((f) => f.documentId !== 'del-1');
    const result = detectGaps({
      caseId: 'case-1',
      documents: docs,
      fields,
      reconciliationRunId: null,
    });

    const dlvGap = result.gaps.filter((g) => g.ruleId === 'R-DLV-01');
    expect(dlvGap).toHaveLength(1);
    expect(dlvGap[0].whatIsMissing.toLowerCase()).toContain('delivery');
    expect(dlvGap[0].whyItMatters).toContain('NOT prove non-delivery');
    expect(result.confidenceAssessments[0].level).toBe('INSUFFICIENT');
  });

  it('bounds coverage verified <= total and achieves 14/14 when all INV-1047 slots verified', () => {
    const unverified = detectGaps({
      caseId: 'case-1',
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      reconciliationRunId: 'run-1',
    });
    expect(unverified.coverage.verified).toBe(3);
    expect(unverified.coverage.total).toBe(14);
    expect(unverified.confidenceAssessments[0].level).toBe('SUPPORTED_UNVERIFIED');

    const verified = detectGaps({
      caseId: 'case-1',
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS.map((f) => ({ ...f, status: 'VERIFIED' as const })),
      reconciliationRunId: 'run-1',
    });
    expect(verified.coverage.verified).toBe(14);
    expect(verified.coverage.total).toBe(14);
    expect(verified.confidenceAssessments[0].level).toBe('VERIFIED');
  });
});

describe('Payment Blockers, Graph, Report & Crypto', () => {
  const caseData: InvestigationCase = {
    id: 'case-1',
    caseNumber: 'INV-1047',
    title: 'Test Case',
    description: '',
    status: 'RECONCILED',
    organizationId: 'org-1',
    createdBy: 'user-1',
    createdAt: '2026-11-27T00:00:00Z',
    updatedAt: '2026-11-27T00:00:00Z',
  };

  it('creates explainable blockers for discrepancies and unverified fields', () => {
    const rec = reconcile({
      caseId: 'case-1',
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      actorId: 'user-1',
    });
    const gap = detectGaps({
      caseId: 'case-1',
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      reconciliationRunId: rec.runId,
    });
    const blockers = assessBlockers({
      caseId: 'case-1',
      discrepancies: rec.discrepancies,
      gaps: gap.gaps,
      fields: INV1047_FIELDS,
      reconciliationRunId: rec.runId,
    });

    expect(blockers.blockers.some((b) => b.ruleId === 'R-QTY-01')).toBe(true);
    expect(blockers.blockers.some((b) => b.ruleId === 'R-VER-01')).toBe(true);
  });

  it('builds graph and reproducible report snapshot + escaped HTML', () => {
    const rec = reconcile({
      caseId: 'case-1',
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      actorId: 'user-1',
    });
    const gap = detectGaps({
      caseId: 'case-1',
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      reconciliationRunId: rec.runId,
    });
    const blockers = assessBlockers({
      caseId: 'case-1',
      discrepancies: rec.discrepancies,
      gaps: gap.gaps,
      fields: INV1047_FIELDS,
      reconciliationRunId: rec.runId,
    });
    const graph = buildEvidenceGraph({
      caseData,
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      discrepancies: rec.discrepancies,
      gaps: gap.gaps,
    });
    expect(graph.nodes.some((n) => n.type === 'DISCREPANCY')).toBe(true);

    const r1 = buildReport({
      caseData,
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      discrepancies: rec.discrepancies,
      gaps: gap.gaps,
      blockers: blockers.blockers,
      confidenceAssessments: gap.confidenceAssessments,
      graph,
      events: [],
      reconciliationRunId: rec.runId,
      generatedBy: 'user-1',
      generatedAt: '2026-11-27T01:00:00Z',
    });
    const r2 = buildReport({
      caseData,
      documents: INV1047_DOCS,
      fields: INV1047_FIELDS,
      discrepancies: rec.discrepancies,
      gaps: gap.gaps,
      blockers: blockers.blockers,
      confidenceAssessments: gap.confidenceAssessments,
      graph,
      events: [],
      reconciliationRunId: rec.runId,
      generatedBy: 'user-1',
      generatedAt: '2026-11-27T02:00:00Z',
    });
    expect(r1.report.snapshotHash).toBe(r2.report.snapshotHash);

    const html = generateReportHtml(r1.content);
    expect(html).toContain('INV-1047');
    expect(html).toContain('R-QTY-01');
  });

  it('hashes nested objects canonically and verifies/detects tampering in event hash chain', () => {
    const h1 = hashObject({ a: 1, nested: { z: 2, a: 1 } });
    const h2 = hashObject({ nested: { a: 1, z: 2 }, a: 1 });
    expect(h1).toBe(h2);

    const hDiff = hashObject({ nested: { a: 1, z: 99 }, a: 1 });
    expect(h1).not.toBe(hDiff);

    const events: InvestigationEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const id = `event-${i}`;
      const prevHash = i === 0 ? null : events[i - 1].eventHash;
      const ts = `2026-11-27T00:0${i}:00Z`;
      const hash = createEventHash(id, 'TEST', 'case-1', ts, prevHash, 'user-1', `desc ${i}`, { i });
      events.push({
        id,
        caseId: 'case-1',
        eventType: 'CASE_CREATED',
        actorId: 'user-1',
        description: `desc ${i}`,
        metadata: { i },
        previousEventHash: prevHash,
        eventHash: hash,
        createdAt: ts,
      });
    }
    // Verify using exact eventType string passed into createEventHash
    const validEvents = events.map((e) => ({ ...e, eventType: 'TEST' }));
    expect(verifyEventChain(validEvents)).toEqual({ valid: true });

    const tamperedDesc = validEvents.map((e, idx) =>
      idx === 1 ? { ...e, description: 'tampered' } : e
    );
    const tamperedResult = verifyEventChain(tamperedDesc);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.brokenAt).toBe(1);
  });
});
