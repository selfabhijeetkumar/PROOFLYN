/**
 * PROOFLYN — Payment Blocker Intelligence
 * Pure business logic. Advisory only — never executes or rejects payments.
 * Each blocker explains WHY it matters and what resolution is needed.
 */

import {
  type Discrepancy,
  type EvidenceGap,
  type PaymentBlocker,
  type ExtractedField,
} from './types';
import { generateId } from './crypto';

export interface BlockerInput {
  caseId: string;
  discrepancies: Discrepancy[];
  gaps: EvidenceGap[];
  fields: ExtractedField[];
  reconciliationRunId: string | null;
}

export interface BlockerOutput {
  blockers: PaymentBlocker[];
  summary: string;
}

export function assessBlockers(input: BlockerInput): BlockerOutput {
  const { caseId, discrepancies, gaps, fields, reconciliationRunId } = input;
  const blockers: PaymentBlocker[] = [];
  const now = new Date().toISOString();

  // R-QTY-01: Invoice qty > delivered qty
  for (const d of discrepancies.filter((x) => x.ruleId === 'R-QTY-01')) {
    blockers.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      ruleId: 'R-QTY-01',
      title: 'Invoice Quantity Exceeds Delivered Quantity',
      reason: d.description,
      impact: `Risk of paying for undelivered goods.${d.varianceValue !== null && d.varianceCurrency ? ` Computed variance illustration: ${formatMoney(d.varianceValue, d.varianceCurrency)}.` : ''}`,
      resolutionRequired:
        'Verify delivery quantities with warehouse. Obtain delivery confirmation for outstanding units or request a credit note from supplier.',
      evidenceReferences: d.sourceDocumentIds,
      status: 'OPEN',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: now,
    });
  }

  // R-QTY-02: PO qty vs Invoice qty conflict
  for (const d of discrepancies.filter((x) => x.ruleId === 'R-QTY-02')) {
    blockers.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      ruleId: 'R-QTY-02',
      title: 'Purchase Order vs Invoice Quantity Conflict',
      reason: d.description,
      impact: 'Invoiced quantity does not match authorized purchase order quantity.',
      resolutionRequired:
        'Verify whether a PO amendment was approved or request a corrected invoice matching ordered quantity.',
      evidenceReferences: d.sourceDocumentIds,
      status: 'OPEN',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: now,
    });
  }

  // R-DUP-01: Duplicate invoice
  for (const d of discrepancies.filter((x) => x.ruleId === 'R-DUP-01')) {
    blockers.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      ruleId: 'R-DUP-01',
      title: 'Duplicate Invoice Detected',
      reason: d.description,
      impact: 'Risk of duplicate payment for the same transaction.',
      resolutionRequired:
        'Confirm whether the invoices are duplicates. Reject duplicate entry in AP ledger and document decision.',
      evidenceReferences: d.sourceDocumentIds,
      status: 'OPEN',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: now,
    });
  }

  // R-PRC-01: Price mismatch
  for (const d of discrepancies.filter((x) => x.ruleId === 'R-PRC-01')) {
    blockers.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      ruleId: 'R-PRC-01',
      title: 'Unit Price Mismatch Between PO and Invoice',
      reason: d.description,
      impact: 'Invoice unit pricing diverges from agreed PO pricing terms.',
      resolutionRequired:
        'Confirm agreed unit price with procurement. Obtain signed price amendment or supplier credit note.',
      evidenceReferences: d.sourceDocumentIds,
      status: 'OPEN',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: now,
    });
  }

  // R-CUR-01: Currency or unit mismatch
  for (const d of discrepancies.filter((x) => x.ruleId === 'R-CUR-01')) {
    blockers.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      ruleId: 'R-CUR-01',
      title:
        d.discrepancyType === 'UNIT_MISMATCH'
          ? 'Quantity Unit Mismatch Across Documents'
          : 'Currency Mismatch Across Documents',
      reason: d.description,
      impact: 'Automated arithmetic comparison cannot safely run across incompatible currencies or units.',
      resolutionRequired:
        'Verify document currency/unit metadata and correct any extraction errors or attach conversion/unit agreement.',
      evidenceReferences: d.sourceDocumentIds,
      status: 'OPEN',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: now,
    });
  }

  // R-DLV-01: Missing delivery record
  for (const gap of gaps.filter((g) => g.ruleId === 'R-DLV-01' && g.gapType === 'MISSING_DOCUMENT')) {
    blockers.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      ruleId: 'R-DLV-01',
      title: 'Missing Delivery Record',
      reason: gap.whyItMatters,
      impact:
        'Cannot confirm whether invoiced goods were actually delivered. Missing evidence does NOT prove non-delivery.',
      resolutionRequired:
        'Obtain delivery receipt, goods received note (GRN), or warehouse confirmation before recommending payment.',
      evidenceReferences: [],
      status: 'OPEN',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: now,
    });
  }

  // R-DOC-01: Missing core document or mandatory field
  const docGaps = gaps.filter((g) => g.ruleId === 'R-DOC-01');
  if (docGaps.length > 0) {
    blockers.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      ruleId: 'R-DOC-01',
      title: 'Incomplete Required Evidence',
      reason: `${docGaps.length} mandatory document or field gap(s): ${docGaps.map((g) => g.whatIsMissing).join('; ')}.`,
      impact: 'Investigation is missing baseline records required for full three-way matching.',
      resolutionRequired:
        'Upload missing supporting documents or supply/correct the missing mandatory fields.',
      evidenceReferences: [],
      status: 'OPEN',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: now,
    });
  }

  // R-VER-01: Material fields unverified
  const unverifiedGaps = gaps.filter((g) => g.ruleId === 'R-VER-01');
  if (unverifiedGaps.length > 0) {
    const materialUnverified = fields.filter(
      (f) =>
        ['quantity', 'unit_price', 'total_amount', 'invoice_number'].includes(f.fieldName) &&
        f.presence === 'PRESENT' &&
        f.status !== 'VERIFIED' &&
        f.status !== 'CORRECTED' &&
        f.status !== 'REJECTED'
    );
    if (materialUnverified.length > 0) {
      blockers.push({
        id: generateId(),
        caseId,
        reconciliationRunId,
        ruleId: 'R-VER-01',
        title: 'Material Fields Require Human Verification',
        reason: `${materialUnverified.length} material extracted field(s) have not been human-verified.`,
        impact:
          'Findings rely on unverified extracted values, which may contain document parsing errors.',
        resolutionRequired:
          'Complete human verification of all material fields (quantity, unit price, total amount, invoice number) before finalizing.',
        evidenceReferences: [...new Set(materialUnverified.map((f) => f.documentId))],
        status: 'OPEN',
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: now,
      });
    }
  }

  const openCount = blockers.filter((b) => b.status === 'OPEN').length;
  const summary =
    openCount === 0
      ? 'No payment blockers identified. All checks passed.'
      : `${openCount} advisory payment blocker(s) require human review before payment can be recommended.`;

  return { blockers, summary };
}

function formatMoney(minorUnits: number, currency: string): string {
  const major = minorUnits / 100;
  return `${currency} ${major.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
