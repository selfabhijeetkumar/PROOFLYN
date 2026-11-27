/**
 * PROOFLYN — Evidence Gap Detection & Confidence Ladder
 * Pure business logic. No I/O.
 * Missing evidence does not prove a claim false.
 * Every gap states: what is missing, why it matters, which conclusion it affects, what could resolve it.
 */

import {
  type SourceDocument,
  type ExtractedField,
  type EvidenceGap,
  type ConfidenceLevel,
  type ConfidenceAssessment,
} from './types';
import { generateId } from './crypto';

export interface GapDetectionInput {
  caseId: string;
  documents: SourceDocument[];
  fields: ExtractedField[];
  reconciliationRunId: string | null;
}

export interface GapDetectionOutput {
  gaps: EvidenceGap[];
  coverage: {
    verified: number;
    total: number;
    percentage: number;
    label: string;
  };
  confidenceAssessments: ConfidenceAssessment[];
}

const REQUIRED_DOC_TYPES = ['PURCHASE_ORDER', 'INVOICE', 'DELIVERY_RECORD'] as const;

const REQUIRED_FIELDS: Record<string, string[]> = {
  PURCHASE_ORDER: ['quantity', 'unit_price', 'total_amount', 'supplier_name'],
  INVOICE: ['quantity', 'unit_price', 'total_amount', 'invoice_number', 'supplier_name'],
  DELIVERY_RECORD: ['quantity', 'delivery_date'],
};

const MATERIAL_FIELD_NAMES = [
  'quantity',
  'unit_price',
  'total_amount',
  'invoice_number',
  'supplier_name',
  'delivery_date',
];

function isVerifiedStatus(status: string): boolean {
  return status === 'VERIFIED' || status === 'CORRECTED';
}

export function detectGaps(input: GapDetectionInput): GapDetectionOutput {
  const { caseId, documents, fields, reconciliationRunId } = input;
  const gaps: EvidenceGap[] = [];
  const now = new Date().toISOString();

  const docTypes = new Set(documents.map((d) => d.documentType));

  // R-DLV-01: Missing delivery record is an evidence GAP, never proof of non-delivery
  if (!docTypes.has('DELIVERY_RECORD')) {
    gaps.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      gapType: 'MISSING_DOCUMENT',
      ruleId: 'R-DLV-01',
      description: 'No delivery record found for this case.',
      whatIsMissing: 'Delivery record(s) confirming goods receipt',
      whyItMatters:
        'Without delivery records, actual delivered quantities cannot be verified. This does NOT prove non-delivery.',
      affectedConclusions:
        'Quantity reconciliation between invoice and delivery cannot be performed. Payment blocker assessment is incomplete.',
      whatCouldResolve:
        'Upload delivery receipt, goods received note (GRN), or warehouse confirmation.',
      createdAt: now,
    });
  }

  if (!docTypes.has('PURCHASE_ORDER')) {
    gaps.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      gapType: 'MISSING_DOCUMENT',
      ruleId: 'R-DOC-01',
      description: 'No purchase order found for this case.',
      whatIsMissing: 'Purchase order establishing agreed terms',
      whyItMatters:
        'Without a PO, agreed quantities and prices cannot be compared against invoice claims.',
      affectedConclusions: 'PO-based reconciliation rules (R-QTY-02, R-PRC-01) cannot execute.',
      whatCouldResolve: 'Upload the original purchase order or procurement agreement.',
      createdAt: now,
    });
  }

  if (!docTypes.has('INVOICE')) {
    gaps.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      gapType: 'MISSING_DOCUMENT',
      ruleId: 'R-DOC-01',
      description: 'No invoice found for this case.',
      whatIsMissing: 'Invoice under investigation',
      whyItMatters: 'The investigation cannot proceed without the disputed invoice.',
      affectedConclusions: 'All invoice-based reconciliation is blocked.',
      whatCouldResolve: 'Upload the invoice document.',
      createdAt: now,
    });
  }

  // R-DOC-01: Check required fields per uploaded document
  for (const doc of documents) {
    const requiredFields = REQUIRED_FIELDS[doc.documentType];
    if (!requiredFields) continue;

    const docFields = fields.filter((f) => f.documentId === doc.id);

    for (const reqField of requiredFields) {
      const validField = docFields.find(
        (f) => f.fieldName === reqField && f.status !== 'REJECTED'
      );
      const anyField = validField ?? docFields.find((f) => f.fieldName === reqField);

      if (!anyField) {
        gaps.push({
          id: generateId(),
          caseId,
          reconciliationRunId,
          gapType: 'MISSING_FIELD',
          ruleId: 'R-DOC-01',
          description: `Required field "${reqField}" is missing from ${doc.documentType} (${doc.originalFilename}).`,
          whatIsMissing: `Field "${reqField}" in document ${doc.originalFilename}`,
          whyItMatters: `This field is required for complete reconciliation of ${doc.documentType} documents.`,
          affectedConclusions: `Reconciliation rules that use "${reqField}" will produce incomplete results.`,
          whatCouldResolve: `Manually enter the "${reqField}" value or re-extract the document.`,
          createdAt: now,
        });
      } else if (
        anyField.presence === 'MISSING' ||
        anyField.presence === 'INVALID' ||
        anyField.status === 'REJECTED'
      ) {
        const isInvalid = anyField.presence === 'INVALID';
        gaps.push({
          id: generateId(),
          caseId,
          reconciliationRunId,
          gapType: isInvalid ? 'CONFLICTING_VALUES' : 'MISSING_FIELD',
          ruleId: 'R-DOC-01',
          description: `Field "${reqField}" in ${doc.documentType} (${doc.originalFilename}) is ${anyField.status === 'REJECTED' ? 'rejected' : anyField.presence.toLowerCase()}.`,
          whatIsMissing: `Valid value for "${reqField}" in ${doc.originalFilename}`,
          whyItMatters: `A ${anyField.status === 'REJECTED' ? 'rejected' : anyField.presence.toLowerCase()} field cannot be used in reconciliation.`,
          affectedConclusions: `Any rule comparing "${reqField}" across documents will not operate on this value.`,
          whatCouldResolve: `Review and enter a valid "${reqField}" value manually.`,
          createdAt: now,
        });
      }
    }
  }

  // Detect conflicting values across same-type documents or currencies/units
  const currencies = new Set(
    fields.filter((f) => f.status !== 'REJECTED' && f.currency).map((f) => f.currency)
  );
  const units = new Set(
    fields.filter((f) => f.status !== 'REJECTED' && f.unit).map((f) => f.unit)
  );
  if (currencies.size > 1 || units.size > 1) {
    gaps.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      gapType: 'CONFLICTING_VALUES',
      ruleId: 'R-CUR-01',
      description: 'Conflicting currencies or quantity units detected across case documents.',
      whatIsMissing: 'Consistent currency/unit alignment or verified conversion basis',
      whyItMatters: 'Arithmetic across mismatched currencies or units is unsafe and disabled.',
      affectedConclusions: 'Cross-document price or quantity rules cannot run safely until resolved.',
      whatCouldResolve: 'Verify document currencies and units and correct extraction errors.',
      createdAt: now,
    });
  }

  // R-VER-01: Unverified material fields
  const materialFields = fields.filter(
    (f) =>
      MATERIAL_FIELD_NAMES.includes(f.fieldName) &&
      f.presence === 'PRESENT' &&
      f.status !== 'REJECTED'
  );
  const unverifiedMaterial = materialFields.filter((f) => !isVerifiedStatus(f.status));

  if (unverifiedMaterial.length > 0) {
    gaps.push({
      id: generateId(),
      caseId,
      reconciliationRunId,
      gapType: 'UNVERIFIED_FIELD',
      ruleId: 'R-VER-01',
      description: `${unverifiedMaterial.length} material field(s) remain unverified.`,
      whatIsMissing: 'Human verification of extracted values',
      whyItMatters:
        'Unverified fields lower confidence in reconciliation results. Findings based on unverified data are labeled as SUPPORTED_UNVERIFIED.',
      affectedConclusions: 'All findings referencing these fields have reduced confidence.',
      whatCouldResolve: `Review and verify the ${unverifiedMaterial.length} unverified field(s) in the extraction review screen.`,
      createdAt: now,
    });
  }

  // Evidence coverage: verified required slots / total required slots (bounded 0..100%)
  let totalSlots = 0;
  let verifiedSlots = 0;

  for (const docType of REQUIRED_DOC_TYPES) {
    const docsOfType = documents.filter((d) => d.documentType === docType);
    const reqFields = REQUIRED_FIELDS[docType] || [];
    // Document slot itself
    totalSlots += 1;
    if (docsOfType.length > 0) {
      verifiedSlots += 1;
      for (const doc of docsOfType) {
        const docFields = fields.filter((f) => f.documentId === doc.id);
        for (const reqField of reqFields) {
          totalSlots += 1;
          const verifiedMatch = docFields.find(
            (f) =>
              f.fieldName === reqField &&
              f.presence === 'PRESENT' &&
              isVerifiedStatus(f.status)
          );
          if (verifiedMatch) {
            verifiedSlots += 1;
          }
        }
      }
    } else {
      // Missing document contributes its required field slots to denominator
      totalSlots += reqFields.length;
    }
  }

  const percentage = totalSlots > 0 ? Math.round((verifiedSlots / totalSlots) * 100) : 0;

  // Case-level confidence assessment
  const presentFields = fields.filter(
    (f) => f.presence === 'PRESENT' && f.status !== 'REJECTED'
  );
  const verifiedFieldCount = presentFields.filter((f) => isVerifiedStatus(f.status)).length;
  const totalFieldCount = presentFields.length;

  let caseLevel: ConfidenceLevel;
  if (gaps.some((g) => g.gapType === 'CONFLICTING_VALUES')) {
    caseLevel = 'CONFLICTED';
  } else if (gaps.some((g) => g.gapType === 'MISSING_DOCUMENT' || g.gapType === 'MISSING_FIELD')) {
    caseLevel = 'INSUFFICIENT';
  } else if (gaps.length === 0 && totalFieldCount > 0 && verifiedFieldCount === totalFieldCount) {
    caseLevel = 'VERIFIED';
  } else if (totalFieldCount === 0) {
    caseLevel = 'INSUFFICIENT';
  } else {
    caseLevel = 'SUPPORTED_UNVERIFIED';
  }

  const confidenceAssessments: ConfidenceAssessment[] = [
    {
      id: generateId(),
      caseId,
      reconciliationRunId: reconciliationRunId || '',
      findingId: null,
      level: caseLevel,
      criteria: `Case-level confidence based on ${gaps.length} gap(s), ${verifiedFieldCount}/${totalFieldCount} verified fields, ${verifiedSlots}/${totalSlots} required slots.`,
      inputFieldsVerified: verifiedFieldCount,
      inputFieldsTotal: totalFieldCount,
      createdAt: now,
    },
  ];

  return {
    gaps,
    coverage: {
      verified: verifiedSlots,
      total: totalSlots,
      percentage,
      label: `${verifiedSlots} / ${totalSlots} required evidence slots verified`,
    },
    confidenceAssessments,
  };
}
