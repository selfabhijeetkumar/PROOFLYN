/**
 * PROOFLYN — Evidence Graph Builder
 * Builds an explainable provenance graph of case evidence relationships.
 * Pure business logic — no I/O.
 */

import {
  type SourceDocument,
  type ExtractedField,
  type Discrepancy,
  type EvidenceGap,
  type EvidenceGraphData,
  type EvidenceGraphNode,
  type EvidenceGraphEdge,
  type GraphNodeType,
  type InvestigationCase,
} from './types';
import { generateId } from './crypto';

export interface GraphBuildInput {
  caseData: InvestigationCase;
  documents: SourceDocument[];
  fields: ExtractedField[];
  discrepancies: Discrepancy[];
  gaps: EvidenceGap[];
}

export function buildEvidenceGraph(input: GraphBuildInput): EvidenceGraphData {
  const { caseData, documents, fields, discrepancies, gaps } = input;
  const nodes: EvidenceGraphNode[] = [];
  const edges: EvidenceGraphEdge[] = [];

  nodes.push({
    id: caseData.id,
    type: 'CASE',
    label: `Case ${caseData.caseNumber}`,
    metadata: { title: caseData.title, status: caseData.status },
  });

  for (const doc of documents) {
    const nodeType: GraphNodeType =
      doc.documentType === 'INVOICE'
        ? 'INVOICE'
        : doc.documentType === 'PURCHASE_ORDER'
          ? 'PURCHASE_ORDER'
          : doc.documentType === 'DELIVERY_RECORD'
            ? 'DELIVERY_RECORD'
            : 'EVIDENCE_ITEM';

    nodes.push({
      id: doc.id,
      type: nodeType,
      label: `${doc.documentType}: ${doc.originalFilename}`,
      metadata: {
        sha256: doc.sha256,
        mimeType: doc.mimeType,
        uploadedAt: doc.uploadedAt,
      },
    });

    edges.push({
      id: generateId(),
      source: doc.id,
      target: caseData.id,
      type: 'BELONGS_TO',
      ruleId: null,
      label: 'belongs to',
    });
  }

  for (const field of fields) {
    if (field.presence !== 'PRESENT' || field.status === 'REJECTED') continue;

    const isVerified = field.status === 'VERIFIED' || field.status === 'CORRECTED';
    const nodeType: GraphNodeType = isVerified ? 'CONFIRMED_FIELD' : 'EXTRACTED_FIELD';

    nodes.push({
      id: field.id,
      type: nodeType,
      label: `${field.fieldName}: ${field.extractedValue || 'N/A'}`,
      metadata: {
        status: field.status,
        method: field.extractionMethod,
        numericValue: field.numericValue,
        currency: field.currency,
        unit: field.unit,
        sourcePageNumber: field.sourcePageNumber,
        sourceOffset: field.sourceOffset,
      },
    });

    edges.push({
      id: generateId(),
      source: field.id,
      target: field.documentId,
      type: 'EXTRACTED_FROM',
      ruleId: null,
      label: isVerified ? 'extracted & verified from' : 'extracted from',
    });
  }

  for (const disc of discrepancies) {
    nodes.push({
      id: disc.id,
      type: 'DISCREPANCY',
      label: `${disc.ruleId}: ${disc.discrepancyType}`,
      metadata: {
        description: disc.description,
        confidence: disc.confidence,
        varianceValue: disc.varianceValue,
        varianceCurrency: disc.varianceCurrency,
      },
    });

    for (const docId of disc.sourceDocumentIds) {
      edges.push({
        id: generateId(),
        source: disc.id,
        target: docId,
        type: 'DERIVED_FROM',
        ruleId: disc.ruleId,
        label: `derived from (${disc.ruleId})`,
      });
    }

    for (const fieldId of disc.sourceFieldIds) {
      edges.push({
        id: generateId(),
        source: disc.id,
        target: fieldId,
        type: 'REFERENCES',
        ruleId: disc.ruleId,
        label: `references (${disc.ruleId})`,
      });
    }

    // Connect conflicting field pairs when applicable
    if (disc.sourceFieldIds.length >= 2) {
      edges.push({
        id: generateId(),
        source: disc.sourceFieldIds[0],
        target: disc.sourceFieldIds[1],
        type: 'CONFLICTS_WITH',
        ruleId: disc.ruleId,
        label: `conflicts (${disc.ruleId})`,
      });
    }
  }

  for (const gap of gaps) {
    nodes.push({
      id: gap.id,
      type: 'EVIDENCE_GAP',
      label: `Gap: ${gap.whatIsMissing}`,
      metadata: {
        gapType: gap.gapType,
        ruleId: gap.ruleId,
        whyItMatters: gap.whyItMatters,
      },
    });

    edges.push({
      id: generateId(),
      source: gap.id,
      target: caseData.id,
      type: 'BELONGS_TO',
      ruleId: gap.ruleId || null,
      label: 'evidence gap in',
    });
  }

  return { nodes, edges };
}
