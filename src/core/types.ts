/**
 * PROOFLYN — Shared Types
 * All domain types used across core/, server/, mcp/ layers.
 * Money is integer minor units + ISO currency. Quantities are integers with a unit.
 * Missing is NEVER zero.
 */

export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';
export type QuantityUnit = 'UNITS' | 'KG' | 'LITERS' | 'METERS' | 'PIECES';

export type FieldPresence = 'PRESENT' | 'MISSING' | 'INVALID';

export type ExtractionStatus =
  | 'EXTRACTED'
  | 'NEEDS_REVIEW'
  | 'VERIFIED'
  | 'CORRECTED'
  | 'REJECTED';

export type ExtractionMethod = 'MANUAL' | 'PDF_TEXT' | 'AI_VISION' | 'CSV_PARSE';

export type CaseStatus =
  | 'CREATED'
  | 'DOCUMENTS_UPLOADED'
  | 'EXTRACTION_COMPLETE'
  | 'UNDER_REVIEW'
  | 'RECONCILED'
  | 'REPORT_GENERATED'
  | 'CLOSED';

export type DocumentType =
  | 'PURCHASE_ORDER'
  | 'INVOICE'
  | 'DELIVERY_RECORD'
  | 'SUPPORTING';

export type UserRole = 'INVESTIGATOR' | 'REVIEWER';

export type BlockerStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export type ConfidenceLevel =
  | 'VERIFIED'
  | 'SUPPORTED_UNVERIFIED'
  | 'CONFLICTED'
  | 'INSUFFICIENT';

export type DiscrepancyType =
  | 'QUANTITY_MISMATCH'
  | 'PRICE_MISMATCH'
  | 'DUPLICATE_INVOICE'
  | 'MISSING_DELIVERY'
  | 'PARTIAL_DELIVERY'
  | 'MISSING_FIELD'
  | 'CURRENCY_MISMATCH'
  | 'UNIT_MISMATCH';

export type EvidenceGapType =
  | 'MISSING_DOCUMENT'
  | 'MISSING_FIELD'
  | 'UNVERIFIED_FIELD'
  | 'CONFLICTING_VALUES';

export type EventType =
  | 'CASE_CREATED'
  | 'DOCUMENT_ADDED'
  | 'EXTRACTION_RUN'
  | 'HUMAN_CORRECTION'
  | 'FIELD_VERIFIED'
  | 'RECONCILIATION_RUN'
  | 'EVIDENCE_CHANGE'
  | 'FINDING_CREATED'
  | 'REVIEW_ACTION'
  | 'REPORT_GENERATED'
  | 'MCP_TOOL_CALL';

export type GraphNodeType =
  | 'CASE'
  | 'INVOICE'
  | 'PURCHASE_ORDER'
  | 'DELIVERY_RECORD'
  | 'EXTRACTED_FIELD'
  | 'CONFIRMED_FIELD'
  | 'DISCREPANCY'
  | 'EVIDENCE_ITEM'
  | 'FINDING'
  | 'EVIDENCE_GAP';

export type GraphEdgeType =
  | 'BELONGS_TO'
  | 'EXTRACTED_FROM'
  | 'VERIFIED_BY'
  | 'CONFLICTS_WITH'
  | 'SUPPORTS'
  | 'DERIVED_FROM'
  | 'REFERENCES';

export type RuleId =
  | 'R-QTY-01'
  | 'R-QTY-02'
  | 'R-PRC-01'
  | 'R-DUP-01'
  | 'R-DLV-01'
  | 'R-DLV-02'
  | 'R-DOC-01'
  | 'R-CUR-01'
  | 'R-VER-01';

export interface Money {
  amountMinor: number;
  currency: Currency;
}

export interface Quantity {
  value: number;
  unit: QuantityUnit;
  presence: FieldPresence;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface InvestigationCase {
  id: string;
  caseNumber: string;
  title: string;
  description: string;
  status: CaseStatus;
  organizationId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Party {
  id: string;
  caseId: string;
  name: string;
  role: 'BUYER' | 'SUPPLIER';
  identifier?: string;
}

export interface SourceDocument {
  id: string;
  caseId: string;
  documentType: DocumentType;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ExtractedField {
  id: string;
  documentId: string;
  caseId: string;
  fieldName: string;
  rawText: string | null;
  extractedValue: string | null;
  numericValue: number | null;
  currency: Currency | null;
  unit: QuantityUnit | null;
  presence: FieldPresence;
  sourcePageNumber: number | null;
  sourceOffset: string | null;
  extractionMethod: ExtractionMethod;
  extractionVersion: string;
  status: ExtractionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationRecord {
  id: string;
  extractedFieldId: string;
  verifiedBy: string;
  previousValue: string | null;
  newValue: string | null;
  previousStatus: ExtractionStatus;
  newStatus: ExtractionStatus;
  reason: string;
  createdAt: string;
}

export interface ReconciliationRun {
  id: string;
  caseId: string;
  inputSnapshotHash: string;
  rulesVersion: string;
  previousRunId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Discrepancy {
  id: string;
  reconciliationRunId: string;
  caseId: string;
  ruleId: RuleId;
  discrepancyType: DiscrepancyType;
  description: string;
  sourceDocumentIds: string[];
  sourceFieldIds: string[];
  expectedValue: string | null;
  actualValue: string | null;
  varianceValue: number | null;
  varianceCurrency: Currency | null;
  confidence: ConfidenceLevel;
  createdAt: string;
}

export interface EvidenceGap {
  id: string;
  caseId: string;
  reconciliationRunId: string | null;
  gapType: EvidenceGapType;
  ruleId: RuleId | null;
  description: string;
  whatIsMissing: string;
  whyItMatters: string;
  affectedConclusions: string;
  whatCouldResolve: string;
  createdAt: string;
}

export interface PaymentBlocker {
  id: string;
  caseId: string;
  reconciliationRunId: string | null;
  ruleId: RuleId;
  title: string;
  reason: string;
  impact: string;
  resolutionRequired: string;
  evidenceReferences: string[];
  status: BlockerStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface ConfidenceAssessment {
  id: string;
  caseId: string;
  reconciliationRunId: string;
  findingId: string | null;
  level: ConfidenceLevel;
  criteria: string;
  inputFieldsVerified: number;
  inputFieldsTotal: number;
  createdAt: string;
}

export interface EvidenceRelationship {
  id: string;
  caseId: string;
  sourceNodeId: string;
  sourceNodeType: GraphNodeType;
  targetNodeId: string;
  targetNodeType: GraphNodeType;
  edgeType: GraphEdgeType;
  ruleId: RuleId | null;
  sourceReference: string | null;
  derivationRule: string | null;
  createdAt: string;
}

export interface InvestigationEvent {
  id: string;
  caseId: string;
  eventType: EventType;
  actorId: string;
  description: string;
  metadata: Record<string, unknown>;
  previousEventHash: string | null;
  eventHash: string;
  createdAt: string;
}

export interface McpToolCall {
  id: string;
  caseId: string;
  toolName: string;
  actorId: string;
  inputHash: string;
  status: 'SUCCESS' | 'ERROR' | 'TIMEOUT';
  durationMs: number;
  outputHash: string | null;
  error: string | null;
  createdAt: string;
}

export interface Report {
  id: string;
  caseId: string;
  reconciliationRunId: string;
  snapshotHash: string;
  contentJson: string;
  contentHtml: string | null;
  generatedBy: string;
  createdAt: string;
}

export interface FollowUpDraft {
  id: string;
  caseId: string;
  reportId: string;
  questions: string[];
  createdBy: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReconciliationResult {
  runId: string;
  caseId: string;
  discrepancies: Discrepancy[];
  evidenceGaps: EvidenceGap[];
  paymentBlockers: PaymentBlocker[];
  confidenceAssessments: ConfidenceAssessment[];
  evidenceGraph: EvidenceGraphData;
  rulesVersion: string;
  inputSnapshotHash: string;
  createdAt: string;
}

export interface EvidenceGraphData {
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
}

export interface EvidenceGraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  metadata: Record<string, unknown>;
}

export interface EvidenceGraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  ruleId: RuleId | null;
  label: string;
}

export interface McpCaseContext {
  caseId: string;
  caseNumber: string;
  title: string;
  status: CaseStatus;
  parties: Party[];
  documents: SourceDocument[];
  verifiedRecords: ExtractedField[];
  unverifiedRecords: ExtractedField[];
  existingFindings: Discrepancy[];
  evidenceGaps: EvidenceGap[];
  paymentBlockers: PaymentBlocker[];
  evidenceReferences: string[];
}

export interface McpReconcileResult {
  runId: string;
  reusedExistingRun: boolean;
  discrepancies: Discrepancy[];
  warnings: string[];
  sourceReferences: string[];
  inputSnapshotHash: string;
  rulesVersion: string;
}

export interface McpGapResult {
  gaps: EvidenceGap[];
  coverage: {
    verified: number;
    total: number;
    percentage: number;
    label: string;
  };
  confidenceLadder: ConfidenceAssessment[];
}

export interface McpBlockerResult {
  blockers: PaymentBlocker[];
  summary: string;
}

export interface McpGraphResult {
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
}

export interface McpReportResult {
  reportId: string;
  snapshotHash: string;
  status: 'GENERATED' | 'ERROR';
  findings: Discrepancy[];
  sourceReferences: string[];
  limitations: string[];
}

export const RULES_VERSION = '1.0.0';
