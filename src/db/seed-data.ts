/**
 * PROOFLYN — Deterministic Seed Data Builder
 * Shared by demo reset script and MCP smoke test.
 * Never hardcodes credentials — reads demo credentials from env (or explicit test params).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SqliteDatabase } from './sqlite';
import { InvestigationRepository } from '@/server/repositories/investigation-repo';
import { sha256, type ExtractionMethod } from '@/core';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * Generates a valid deterministic single-page PDF 1.4 buffer with readable ASCII text lines.
 * Parsed cleanly by pdf-parse without external binary tools.
 */
export function buildSyntheticPdfBuffer(lines: string[]): Buffer {
  const escapePdfText = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const textOps = [
    'BT',
    '/F1 11 Tf',
    '50 750 Td',
    '15 TL',
    ...lines.map((line, i) => `${i === 0 ? '' : 'T* '}(${escapePdfText(line)}) Tj`),
    'ET',
  ].join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(textOps, 'utf8')} >>\nstream\n${textOps}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export interface SeedOptions {
  investigatorEmail: string;
  investigatorPassword: string;
  reviewerEmail: string;
  reviewerPassword: string;
  uploadDir: string;
  includeExtraCases?: boolean;
}

export function seedDatabase(db: SqliteDatabase, opts: SeedOptions): {
  orgId: string;
  investigatorId: string;
  reviewerId: string;
  inv1047CaseId: string;
} {
  const repo = new InvestigationRepository(db);
  if (!fs.existsSync(opts.uploadDir)) {
    fs.mkdirSync(opts.uploadDir, { recursive: true });
  }

  const ts = '2026-11-27T00:00:00.000Z';
  const orgId = 'org-nexarc-demo';
  const investigatorId = 'user-investigator-1';
  const reviewerId = 'user-reviewer-1';

  repo.upsertOrganization({ id: orgId, name: 'NexArc Demo Procurement Ops', createdAt: ts });
  repo.upsertUser({
    id: investigatorId,
    email: opts.investigatorEmail,
    passwordHash: hashPassword(opts.investigatorPassword),
    role: 'INVESTIGATOR',
    organizationId: orgId,
    name: 'Asha Rao (Investigator)',
    createdAt: ts,
  });
  repo.upsertUser({
    id: reviewerId,
    email: opts.reviewerEmail,
    passwordHash: hashPassword(opts.reviewerPassword),
    role: 'REVIEWER',
    organizationId: orgId,
    name: 'Vikram Nair (Reviewer)',
    createdAt: ts,
  });

  const existingInv1047 = repo.getCaseByNumberForOrg('INV-1047', orgId);
  if (existingInv1047) {
    return { orgId, investigatorId, reviewerId, inv1047CaseId: existingInv1047.id };
  }

  const inv1047CaseId = 'case-inv-1047';
  repo.createCase({
    id: inv1047CaseId,
    caseNumber: 'INV-1047',
    title: 'SYNTHETIC: TechCorp Solutions Industrial Valves Q4 Dispute',
    description:
      'SYNTHETIC DEMO CASE: Purchase Order 100 units @ INR 1,250.00; Invoice INV-1047 bills 100 units; Goods Received Note GRN-2026-001 records 90 units delivered.',
    status: 'EXTRACTION_COMPLETE',
    organizationId: orgId,
    createdBy: investigatorId,
    createdAt: ts,
    updatedAt: ts,
  });

  repo.addParty({
    id: 'party-inv1047-buyer',
    caseId: inv1047CaseId,
    name: 'NexArc Manufacturing India Pvt. Ltd. (SYNTHETIC)',
    role: 'BUYER',
    identifier: 'BUYER-SYN-01',
  });
  repo.addParty({
    id: 'party-inv1047-supplier',
    caseId: inv1047CaseId,
    name: 'TechCorp Solutions Pvt. Ltd. (SYNTHETIC)',
    role: 'SUPPLIER',
    identifier: 'SUP-SYN-1047',
  });

  const writeSeedPdf = (
    docId: string,
    caseId: string,
    docType: 'PURCHASE_ORDER' | 'INVOICE' | 'DELIVERY_RECORD',
    filename: string,
    lines: string[]
  ) => {
    const buf = buildSyntheticPdfBuffer(lines);
    const storageName = `${docId}-${filename}`;
    const fullPath = path.join(opts.uploadDir, storageName);
    fs.writeFileSync(fullPath, buf);
    repo.addSourceDocument({
      id: docId,
      caseId,
      documentType: docType,
      originalFilename: filename,
      storagePath: storageName,
      mimeType: 'application/pdf',
      sizeBytes: buf.length,
      sha256: sha256(buf),
      uploadedBy: investigatorId,
      uploadedAt: ts,
    });
    repo.appendEvent(
      caseId,
      'DOCUMENT_ADDED',
      investigatorId,
      `Uploaded ${docType} (${filename}).`,
      { documentId: docId, sha256: sha256(buf) }
    );
  };

  repo.appendEvent(
    inv1047CaseId,
    'CASE_CREATED',
    investigatorId,
    'Created synthetic demonstration investigation INV-1047.',
    { caseNumber: 'INV-1047', synthetic: true }
  );

  writeSeedPdf('doc-inv1047-po', inv1047CaseId, 'PURCHASE_ORDER', 'PO-2026-001-SYNTHETIC.pdf', [
    'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
    'DOCUMENT TYPE: PURCHASE ORDER',
    'PO Number: PO-2026-001',
    'Supplier: TechCorp Solutions Pvt. Ltd.',
    'Quantity: 100 UNITS',
    'Unit Price: INR 1250.00',
    'Total Amount: INR 125000.00',
  ]);

  writeSeedPdf('doc-inv1047-inv', inv1047CaseId, 'INVOICE', 'INV-1047-SYNTHETIC.pdf', [
    'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
    'DOCUMENT TYPE: TAX INVOICE',
    'Invoice Number: INV-1047',
    'Supplier: TechCorp Solutions Pvt. Ltd.',
    'Quantity: 100 UNITS',
    'Unit Price: INR 1250.00',
    'Total Amount: INR 125000.00',
  ]);

  writeSeedPdf('doc-inv1047-grn', inv1047CaseId, 'DELIVERY_RECORD', 'GRN-2026-001-SYNTHETIC.pdf', [
    'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
    'DOCUMENT TYPE: DELIVERY RECORD (GRN)',
    'GRN Number: GRN-2026-001',
    'Delivery Date: 2026-11-15',
    'Quantity Delivered: 90 UNITS',
  ]);

  const addField = (
    id: string,
    documentId: string,
    caseId: string,
    fieldName: string,
    extractedValue: string,
    numericValue: number | null,
    currency: 'INR' | null,
    unit: 'UNITS' | null,
    method: ExtractionMethod = 'PDF_TEXT',
    offset = 'line:1'
  ) => {
    repo.addExtractedField({
      id,
      documentId,
      caseId,
      fieldName,
      rawText: extractedValue,
      extractedValue,
      numericValue,
      currency,
      unit,
      presence: 'PRESENT',
      sourcePageNumber: 1,
      sourceOffset: offset,
      extractionMethod: method,
      extractionVersion: '1.0.0',
      status: 'EXTRACTED',
      createdAt: ts,
      updatedAt: ts,
    });
  };

  // PO fields (100 units @ 1,250.00 INR = 125000 paise)
  addField('f-1047-po-num', 'doc-inv1047-po', inv1047CaseId, 'po_number', 'PO-2026-001', null, null, null, 'PDF_TEXT', 'line:3');
  addField('f-1047-po-sup', 'doc-inv1047-po', inv1047CaseId, 'supplier_name', 'TechCorp Solutions Pvt. Ltd.', null, null, null, 'PDF_TEXT', 'line:4');
  addField('f-1047-po-qty', 'doc-inv1047-po', inv1047CaseId, 'quantity', '100', 100, 'INR', 'UNITS', 'PDF_TEXT', 'line:5');
  addField('f-1047-po-prc', 'doc-inv1047-po', inv1047CaseId, 'unit_price', '125000', 125000, 'INR', null, 'PDF_TEXT', 'line:6');
  addField('f-1047-po-tot', 'doc-inv1047-po', inv1047CaseId, 'total_amount', '12500000', 12500000, 'INR', null, 'PDF_TEXT', 'line:7');

  // Invoice fields (100 units @ 1,250.00 INR)
  addField('f-1047-inv-num', 'doc-inv1047-inv', inv1047CaseId, 'invoice_number', 'INV-1047', null, null, null, 'PDF_TEXT', 'line:3');
  addField('f-1047-inv-sup', 'doc-inv1047-inv', inv1047CaseId, 'supplier_name', 'TechCorp Solutions Pvt. Ltd.', null, null, null, 'PDF_TEXT', 'line:4');
  addField('f-1047-inv-qty', 'doc-inv1047-inv', inv1047CaseId, 'quantity', '100', 100, 'INR', 'UNITS', 'PDF_TEXT', 'line:5');
  addField('f-1047-inv-prc', 'doc-inv1047-inv', inv1047CaseId, 'unit_price', '125000', 125000, 'INR', null, 'PDF_TEXT', 'line:6');
  addField('f-1047-inv-tot', 'doc-inv1047-inv', inv1047CaseId, 'total_amount', '12500000', 12500000, 'INR', null, 'PDF_TEXT', 'line:7');

  // Delivery fields (90 units)
  addField('f-1047-del-date', 'doc-inv1047-grn', inv1047CaseId, 'delivery_date', '2026-11-15', null, null, null, 'PDF_TEXT', 'line:4');
  addField('f-1047-del-qty', 'doc-inv1047-grn', inv1047CaseId, 'quantity', '90', 90, null, 'UNITS', 'PDF_TEXT', 'line:5');

  const docs = repo.listSourceDocuments(inv1047CaseId);
  const fields = repo.listExtractedFields(inv1047CaseId);
  for (const doc of docs) {
    repo.syncDomainRecordForDocument(doc, fields);
  }
  repo.appendEvent(
    inv1047CaseId,
    'EXTRACTION_RUN',
    investigatorId,
    'Extracted 12 deterministic fields across PO, Invoice, and Delivery Record.',
    { fieldCount: 12, method: 'PDF_TEXT' }
  );

  if (opts.includeExtraCases) {
    // Fixture case: Duplicate invoice
    const dupCaseId = 'case-inv-2001';
    repo.createCase({
      id: dupCaseId,
      caseNumber: 'INV-2001',
      title: 'SYNTHETIC: Duplicate Invoice Claim Fixture',
      description: 'SYNTHETIC DEMO CASE: Same supplier + invoice number submitted twice.',
      status: 'EXTRACTION_COMPLETE',
      organizationId: orgId,
      createdBy: investigatorId,
      createdAt: ts,
      updatedAt: ts,
    });
    repo.appendEvent(dupCaseId, 'CASE_CREATED', investigatorId, 'Created synthetic duplicate-invoice fixture INV-2001.', { synthetic: true });
    writeSeedPdf('doc-2001-inv1', dupCaseId, 'INVOICE', 'INV-2001-A-SYNTHETIC.pdf', [
      'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
      'Invoice Number: INV-2001',
      'Supplier: Apex Logistics Ltd.',
      'Quantity: 50 UNITS',
      'Unit Price: INR 500.00',
      'Total Amount: INR 25000.00',
    ]);
    writeSeedPdf('doc-2001-inv2', dupCaseId, 'INVOICE', 'INV-2001-B-SYNTHETIC.pdf', [
      'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
      'Invoice Number: INV-2001',
      'Supplier: Apex Logistics Ltd.',
      'Quantity: 50 UNITS',
      'Unit Price: INR 500.00',
      'Total Amount: INR 25000.00',
    ]);
    addField('f-2001-1-num', 'doc-2001-inv1', dupCaseId, 'invoice_number', 'INV-2001', null, null, null);
    addField('f-2001-1-sup', 'doc-2001-inv1', dupCaseId, 'supplier_name', 'Apex Logistics Ltd.', null, null, null);
    addField('f-2001-1-qty', 'doc-2001-inv1', dupCaseId, 'quantity', '50', 50, 'INR', 'UNITS');
    addField('f-2001-1-prc', 'doc-2001-inv1', dupCaseId, 'unit_price', '50000', 50000, 'INR', null);
    addField('f-2001-1-tot', 'doc-2001-inv1', dupCaseId, 'total_amount', '2500000', 2500000, 'INR', null);
    addField('f-2001-2-num', 'doc-2001-inv2', dupCaseId, 'invoice_number', 'INV-2001', null, null, null);
    addField('f-2001-2-sup', 'doc-2001-inv2', dupCaseId, 'supplier_name', 'Apex Logistics Ltd.', null, null, null);
    addField('f-2001-2-qty', 'doc-2001-inv2', dupCaseId, 'quantity', '50', 50, 'INR', 'UNITS');
    addField('f-2001-2-prc', 'doc-2001-inv2', dupCaseId, 'unit_price', '50000', 50000, 'INR', null);
    addField('f-2001-2-tot', 'doc-2001-inv2', dupCaseId, 'total_amount', '2500000', 2500000, 'INR', null);

    // Fixture case: Missing delivery record
    const missCaseId = 'case-inv-2002';
    repo.createCase({
      id: missCaseId,
      caseNumber: 'INV-2002',
      title: 'SYNTHETIC: Missing Delivery Record Fixture',
      description: 'SYNTHETIC DEMO CASE: PO and Invoice present without delivery record (evidence gap, not proof of non-delivery).',
      status: 'EXTRACTION_COMPLETE',
      organizationId: orgId,
      createdBy: investigatorId,
      createdAt: ts,
      updatedAt: ts,
    });
    repo.appendEvent(missCaseId, 'CASE_CREATED', investigatorId, 'Created synthetic missing-delivery fixture INV-2002.', { synthetic: true });
    writeSeedPdf('doc-2002-po', missCaseId, 'PURCHASE_ORDER', 'PO-2002-SYNTHETIC.pdf', [
      'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
      'PO Number: PO-2002',
      'Supplier: Meridian Components',
      'Quantity: 40 UNITS',
      'Unit Price: INR 800.00',
      'Total Amount: INR 32000.00',
    ]);
    writeSeedPdf('doc-2002-inv', missCaseId, 'INVOICE', 'INV-2002-SYNTHETIC.pdf', [
      'SYNTHETIC - FOR DEMONSTRATION PURPOSES ONLY',
      'Invoice Number: INV-2002',
      'Supplier: Meridian Components',
      'Quantity: 40 UNITS',
      'Unit Price: INR 800.00',
      'Total Amount: INR 32000.00',
    ]);
    addField('f-2002-po-sup', 'doc-2002-po', missCaseId, 'supplier_name', 'Meridian Components', null, null, null);
    addField('f-2002-po-qty', 'doc-2002-po', missCaseId, 'quantity', '40', 40, 'INR', 'UNITS');
    addField('f-2002-po-prc', 'doc-2002-po', missCaseId, 'unit_price', '80000', 80000, 'INR', null);
    addField('f-2002-po-tot', 'doc-2002-po', missCaseId, 'total_amount', '3200000', 3200000, 'INR', null);
    addField('f-2002-inv-num', 'doc-2002-inv', missCaseId, 'invoice_number', 'INV-2002', null, null, null);
    addField('f-2002-inv-sup', 'doc-2002-inv', missCaseId, 'supplier_name', 'Meridian Components', null, null, null);
    addField('f-2002-inv-qty', 'doc-2002-inv', missCaseId, 'quantity', '40', 40, 'INR', 'UNITS');
    addField('f-2002-inv-prc', 'doc-2002-inv', missCaseId, 'unit_price', '80000', 80000, 'INR', null);
    addField('f-2002-inv-tot', 'doc-2002-inv', missCaseId, 'total_amount', '3200000', 3200000, 'INR', null);
  }

  return { orgId, investigatorId, reviewerId, inv1047CaseId };
}
