/**
 * PROOFLYN — Investigation Repository (SQLite via node:sqlite)
 * All DB reads/writes are org/case scoped and transactional where needed.
 */

import type { SqliteDatabase } from '@/db/sqlite';
import { getDb } from '@/db/connection';
import {
  createEventHash,
  generateId,
  type Organization,
  type User,
  type InvestigationCase,
  type Party,
  type SourceDocument,
  type ExtractedField,
  type VerificationRecord,
  type ReconciliationRun,
  type Discrepancy,
  type EvidenceGap,
  type PaymentBlocker,
  type ConfidenceAssessment,
  type EvidenceGraphData,
  type EvidenceRelationship,
  type InvestigationEvent,
  type McpToolCall,
  type Report,
  type FollowUpDraft,
  type CaseStatus,
  type BlockerStatus,
  type EventType,
  type ExtractionStatus,
  type FieldPresence,
  type Currency,
  type QuantityUnit,
  type DocumentType,
  type ExtractionMethod,
  type RuleId,
  type DiscrepancyType,
  type EvidenceGapType,
  type ConfidenceLevel,
  type GraphNodeType,
  type GraphEdgeType,
  type UserRole,
} from '@/core';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  organization_id: string;
  name: string;
  created_at: string;
}

interface CaseRow {
  id: string;
  case_number: string;
  title: string;
  description: string;
  status: CaseStatus;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PartyRow {
  id: string;
  case_id: string;
  name: string;
  role: 'BUYER' | 'SUPPLIER';
  identifier: string | null;
}

interface DocRow {
  id: string;
  case_id: string;
  document_type: DocumentType;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface FieldRow {
  id: string;
  document_id: string;
  case_id: string;
  field_name: string;
  raw_text: string | null;
  extracted_value: string | null;
  numeric_value: number | null;
  currency: Currency | null;
  unit: QuantityUnit | null;
  presence: FieldPresence;
  source_page_number: number | null;
  source_offset: string | null;
  extraction_method: ExtractionMethod;
  extraction_version: string;
  status: ExtractionStatus;
  created_at: string;
  updated_at: string;
}

interface VerificationRow {
  id: string;
  extracted_field_id: string;
  verified_by: string;
  previous_value: string | null;
  new_value: string | null;
  previous_status: ExtractionStatus;
  new_status: ExtractionStatus;
  reason: string;
  created_at: string;
}

interface RunRow {
  id: string;
  case_id: string;
  input_snapshot_hash: string;
  rules_version: string;
  previous_run_id: string | null;
  created_by: string;
  created_at: string;
}

interface DiscrepancyRow {
  id: string;
  reconciliation_run_id: string;
  case_id: string;
  rule_id: RuleId;
  discrepancy_type: DiscrepancyType;
  description: string;
  source_document_ids: string;
  source_field_ids: string;
  expected_value: string | null;
  actual_value: string | null;
  variance_value: number | null;
  variance_currency: Currency | null;
  confidence: ConfidenceLevel;
  created_at: string;
}

interface GapRow {
  id: string;
  case_id: string;
  reconciliation_run_id: string | null;
  gap_type: EvidenceGapType;
  rule_id: RuleId | null;
  description: string;
  what_is_missing: string;
  why_it_matters: string;
  affected_conclusions: string;
  what_could_resolve: string;
  created_at: string;
}

interface BlockerRow {
  id: string;
  case_id: string;
  reconciliation_run_id: string | null;
  rule_id: RuleId;
  title: string;
  reason: string;
  impact: string;
  resolution_required: string;
  evidence_references: string;
  status: BlockerStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

interface ConfidenceRow {
  id: string;
  case_id: string;
  reconciliation_run_id: string;
  finding_id: string | null;
  level: ConfidenceLevel;
  criteria: string;
  input_fields_verified: number;
  input_fields_total: number;
  created_at: string;
}

interface RelationshipRow {
  id: string;
  case_id: string;
  source_node_id: string;
  source_node_type: GraphNodeType;
  target_node_id: string;
  target_node_type: GraphNodeType;
  edge_type: GraphEdgeType;
  rule_id: RuleId | null;
  source_reference: string | null;
  derivation_rule: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  case_id: string;
  event_type: EventType;
  actor_id: string;
  description: string;
  metadata: string;
  previous_event_hash: string | null;
  event_hash: string;
  created_at: string;
}

interface McpCallRow {
  id: string;
  case_id: string;
  tool_name: string;
  actor_id: string;
  input_hash: string;
  status: 'SUCCESS' | 'ERROR' | 'TIMEOUT';
  duration_ms: number;
  output_hash: string | null;
  error: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  case_id: string;
  reconciliation_run_id: string;
  snapshot_hash: string;
  content_json: string;
  content_html: string | null;
  generated_by: string;
  created_at: string;
}

interface FollowUpRow {
  id: string;
  case_id: string;
  report_id: string;
  questions: string;
  created_by: string;
  created_at: string;
}

export class InvestigationRepository {
  constructor(private readonly db: SqliteDatabase = getDb()) {}

  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // === Organizations & Users ===

  upsertOrganization(org: Organization): void {
    this.db
      .prepare(
        `INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name`
      )
      .run(org.id, org.name, org.createdAt);
  }

  upsertUser(user: User): void {
    this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, role, organization_id, name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           password_hash = excluded.password_hash,
           role = excluded.role,
           organization_id = excluded.organization_id,
           name = excluded.name`
      )
      .run(
        user.id,
        user.email.toLowerCase(),
        user.passwordHash,
        user.role,
        user.organizationId,
        user.name,
        user.createdAt
      );
  }

  getUserById(userId: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get<UserRow>(userId);
    return row ? mapUser(row) : null;
  }

  getUserByEmail(email: string): User | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
      .get<UserRow>(email.trim());
    return row ? mapUser(row) : null;
  }

  // === Cases & Parties ===

  createCase(c: InvestigationCase): void {
    this.db
      .prepare(
        `INSERT INTO investigation_cases
         (id, case_number, title, description, status, organization_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        c.id,
        c.caseNumber,
        c.title,
        c.description,
        c.status,
        c.organizationId,
        c.createdBy,
        c.createdAt,
        c.updatedAt
      );
  }

  listCasesByOrg(organizationId: string): InvestigationCase[] {
    return this.db
      .prepare(
        'SELECT * FROM investigation_cases WHERE organization_id = ? ORDER BY updated_at DESC, created_at DESC'
      )
      .all<CaseRow>(organizationId)
      .map(mapCase);
  }

  getCaseByIdForOrg(caseId: string, organizationId: string): InvestigationCase | null {
    const row = this.db
      .prepare('SELECT * FROM investigation_cases WHERE id = ? AND organization_id = ?')
      .get<CaseRow>(caseId, organizationId);
    return row ? mapCase(row) : null;
  }

  getCaseByNumberForOrg(caseNumber: string, organizationId: string): InvestigationCase | null {
    const row = this.db
      .prepare('SELECT * FROM investigation_cases WHERE case_number = ? AND organization_id = ?')
      .get<CaseRow>(caseNumber, organizationId);
    return row ? mapCase(row) : null;
  }

  updateCaseStatus(caseId: string, status: CaseStatus): void {
    this.db
      .prepare('UPDATE investigation_cases SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), caseId);
  }

  addParty(party: Party): void {
    this.db
      .prepare(
        `INSERT INTO parties (id, case_id, name, role, identifier)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, identifier = excluded.identifier`
      )
      .run(party.id, party.caseId, party.name, party.role, party.identifier ?? null);
  }

  listParties(caseId: string): Party[] {
    return this.db
      .prepare('SELECT * FROM parties WHERE case_id = ? ORDER BY role, name')
      .all<PartyRow>(caseId)
      .map((r) => ({
        id: r.id,
        caseId: r.case_id,
        name: r.name,
        role: r.role,
        identifier: r.identifier ?? undefined,
      }));
  }

  // === Source Documents & Domain Records ===

  addSourceDocument(doc: SourceDocument): void {
    this.db
      .prepare(
        `INSERT INTO source_documents
         (id, case_id, document_type, original_filename, storage_path, mime_type, size_bytes, sha256, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        doc.id,
        doc.caseId,
        doc.documentType,
        doc.originalFilename,
        doc.storagePath,
        doc.mimeType,
        doc.sizeBytes,
        doc.sha256,
        doc.uploadedBy,
        doc.uploadedAt
      );
  }

  listSourceDocuments(caseId: string): SourceDocument[] {
    return this.db
      .prepare('SELECT * FROM source_documents WHERE case_id = ? ORDER BY uploaded_at ASC')
      .all<DocRow>(caseId)
      .map(mapDoc);
  }

  getSourceDocument(caseId: string, docId: string): SourceDocument | null {
    const row = this.db
      .prepare('SELECT * FROM source_documents WHERE id = ? AND case_id = ?')
      .get<DocRow>(docId, caseId);
    return row ? mapDoc(row) : null;
  }

  syncDomainRecordForDocument(doc: SourceDocument, fields: ExtractedField[]): void {
    const now = new Date().toISOString();
    const getVal = (name: string) =>
      fields.find((f) => f.documentId === doc.id && f.fieldName === name && f.status !== 'REJECTED');
    const qty = getVal('quantity');
    const price = getVal('unit_price');
    const total = getVal('total_amount');
    const supplier = getVal('supplier_name');
    const invNum = getVal('invoice_number');
    const poNum = getVal('po_number');
    const delDate = getVal('delivery_date');

    if (doc.documentType === 'PURCHASE_ORDER') {
      this.db
        .prepare(
          `INSERT INTO purchase_orders (id, case_id, source_document_id, po_number, supplier_name, ordered_quantity, unit, unit_price_minor, total_amount_minor, currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             po_number = excluded.po_number,
             supplier_name = excluded.supplier_name,
             ordered_quantity = excluded.ordered_quantity,
             unit = excluded.unit,
             unit_price_minor = excluded.unit_price_minor,
             total_amount_minor = excluded.total_amount_minor,
             currency = excluded.currency,
             updated_at = excluded.updated_at`
        )
        .run(
          `po_${doc.id}`,
          doc.caseId,
          doc.id,
          poNum?.extractedValue ?? null,
          supplier?.extractedValue ?? null,
          qty?.numericValue ?? null,
          qty?.unit ?? null,
          price?.numericValue ?? null,
          total?.numericValue ?? null,
          price?.currency ?? total?.currency ?? null,
          doc.uploadedAt,
          now
        );
    } else if (doc.documentType === 'INVOICE') {
      this.db
        .prepare(
          `INSERT INTO invoices (id, case_id, source_document_id, invoice_number, supplier_name, invoiced_quantity, unit, unit_price_minor, total_amount_minor, currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             invoice_number = excluded.invoice_number,
             supplier_name = excluded.supplier_name,
             invoiced_quantity = excluded.invoiced_quantity,
             unit = excluded.unit,
             unit_price_minor = excluded.unit_price_minor,
             total_amount_minor = excluded.total_amount_minor,
             currency = excluded.currency,
             updated_at = excluded.updated_at`
        )
        .run(
          `inv_${doc.id}`,
          doc.caseId,
          doc.id,
          invNum?.extractedValue ?? null,
          supplier?.extractedValue ?? null,
          qty?.numericValue ?? null,
          qty?.unit ?? null,
          price?.numericValue ?? null,
          total?.numericValue ?? null,
          price?.currency ?? total?.currency ?? null,
          doc.uploadedAt,
          now
        );
    } else if (doc.documentType === 'DELIVERY_RECORD') {
      this.db
        .prepare(
          `INSERT INTO delivery_records (id, case_id, source_document_id, delivery_reference, delivery_date, delivered_quantity, unit, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             delivery_date = excluded.delivery_date,
             delivered_quantity = excluded.delivered_quantity,
             unit = excluded.unit,
             updated_at = excluded.updated_at`
        )
        .run(
          `del_${doc.id}`,
          doc.caseId,
          doc.id,
          doc.originalFilename,
          delDate?.extractedValue ?? null,
          qty?.numericValue ?? null,
          qty?.unit ?? null,
          doc.uploadedAt,
          now
        );
    }

    for (const f of fields.filter((ff) => ff.documentId === doc.id)) {
      this.db
        .prepare(
          `INSERT INTO evidence_items (id, case_id, source_document_id, extracted_field_id, item_type, label, summary, verification_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             summary = excluded.summary,
             verification_status = excluded.verification_status`
        )
        .run(
          `ev_${f.id}`,
          doc.caseId,
          doc.id,
          f.id,
          doc.documentType,
          f.fieldName,
          `${f.fieldName}=${f.extractedValue ?? f.presence}`,
          f.status,
          f.createdAt
        );
    }
  }

  // === Extracted Fields & Human Verification ===

  addExtractedField(field: ExtractedField): void {
    this.db
      .prepare(
        `INSERT INTO extracted_fields
         (id, document_id, case_id, field_name, raw_text, extracted_value, numeric_value, currency, unit, presence, source_page_number, source_offset, extraction_method, extraction_version, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        field.id,
        field.documentId,
        field.caseId,
        field.fieldName,
        field.rawText,
        field.extractedValue,
        field.numericValue,
        field.currency,
        field.unit,
        field.presence,
        field.sourcePageNumber,
        field.sourceOffset,
        field.extractionMethod,
        field.extractionVersion,
        field.status,
        field.createdAt,
        field.updatedAt
      );
  }

  listExtractedFields(caseId: string): ExtractedField[] {
    return this.db
      .prepare('SELECT * FROM extracted_fields WHERE case_id = ? ORDER BY created_at ASC, field_name ASC')
      .all<FieldRow>(caseId)
      .map(mapField);
  }

  getExtractedField(caseId: string, fieldId: string): ExtractedField | null {
    const row = this.db
      .prepare('SELECT * FROM extracted_fields WHERE id = ? AND case_id = ?')
      .get<FieldRow>(fieldId, caseId);
    return row ? mapField(row) : null;
  }

  applyFieldVerification(
    fieldId: string,
    updates: {
      extractedValue: string | null;
      numericValue: number | null;
      presence: FieldPresence;
      currency: Currency | null;
      unit: QuantityUnit | null;
      status: ExtractionStatus;
    },
    verificationRecord: VerificationRecord
  ): void {
    this.db.transaction(() => {
      // Never overwrite raw_text so original extraction stays preserved
      this.db
        .prepare(
          `UPDATE extracted_fields
           SET extracted_value = ?, numeric_value = ?, presence = ?, currency = ?, unit = ?, status = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          updates.extractedValue,
          updates.numericValue,
          updates.presence,
          updates.currency,
          updates.unit,
          updates.status,
          verificationRecord.createdAt,
          fieldId
        );

      this.db
        .prepare(
          `INSERT INTO verification_records
           (id, extracted_field_id, verified_by, previous_value, new_value, previous_status, new_status, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          verificationRecord.id,
          verificationRecord.extractedFieldId,
          verificationRecord.verifiedBy,
          verificationRecord.previousValue,
          verificationRecord.newValue,
          verificationRecord.previousStatus,
          verificationRecord.newStatus,
          verificationRecord.reason,
          verificationRecord.createdAt
        );

      this.db
        .prepare('UPDATE evidence_items SET verification_status = ? WHERE extracted_field_id = ?')
        .run(updates.status, fieldId);
    })();
  }

  listVerificationRecords(caseId: string): VerificationRecord[] {
    return this.db
      .prepare(
        `SELECT vr.* FROM verification_records vr
         INNER JOIN extracted_fields ef ON ef.id = vr.extracted_field_id
         WHERE ef.case_id = ?
         ORDER BY vr.created_at ASC`
      )
      .all<VerificationRow>(caseId)
      .map((r) => ({
        id: r.id,
        extractedFieldId: r.extracted_field_id,
        verifiedBy: r.verified_by,
        previousValue: r.previous_value,
        newValue: r.new_value,
        previousStatus: r.previous_status,
        newStatus: r.new_status,
        reason: r.reason,
        createdAt: r.created_at,
      }));
  }

  // === Reconciliation Runs, Discrepancies, Gaps, Blockers, Confidence ===

  findReconciliationRunBySnapshot(
    caseId: string,
    inputSnapshotHash: string,
    rulesVersion: string
  ): ReconciliationRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM reconciliation_runs
         WHERE case_id = ? AND input_snapshot_hash = ? AND rules_version = ?`
      )
      .get<RunRow>(caseId, inputSnapshotHash, rulesVersion);
    return row ? mapRun(row) : null;
  }

  getLatestReconciliationRun(caseId: string): ReconciliationRun | null {
    const row = this.db
      .prepare(
        'SELECT * FROM reconciliation_runs WHERE case_id = ? ORDER BY rowid DESC LIMIT 1'
      )
      .get<RunRow>(caseId);
    return row ? mapRun(row) : null;
  }

  saveReconciliationRun(run: ReconciliationRun, discrepancies: Discrepancy[]): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO reconciliation_runs
           (id, case_id, input_snapshot_hash, rules_version, previous_run_id, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          run.id,
          run.caseId,
          run.inputSnapshotHash,
          run.rulesVersion,
          run.previousRunId,
          run.createdBy,
          run.createdAt
        );

      const insertDisc = this.db.prepare(
        `INSERT INTO discrepancies
         (id, reconciliation_run_id, case_id, rule_id, discrepancy_type, description, source_document_ids, source_field_ids, expected_value, actual_value, variance_value, variance_currency, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const d of discrepancies) {
        insertDisc.run(
          d.id,
          run.id,
          d.caseId,
          d.ruleId,
          d.discrepancyType,
          d.description,
          JSON.stringify(d.sourceDocumentIds),
          JSON.stringify(d.sourceFieldIds),
          d.expectedValue,
          d.actualValue,
          d.varianceValue,
          d.varianceCurrency,
          d.confidence,
          d.createdAt
        );
      }
    })();
  }

  listDiscrepancies(caseId: string, runId?: string): Discrepancy[] {
    const rows = runId
      ? this.db
          .prepare('SELECT * FROM discrepancies WHERE case_id = ? AND reconciliation_run_id = ? ORDER BY created_at ASC')
          .all<DiscrepancyRow>(caseId, runId)
      : this.db
          .prepare(
            `SELECT * FROM discrepancies WHERE case_id = ?
             AND reconciliation_run_id = (
               SELECT id FROM reconciliation_runs WHERE case_id = ? ORDER BY rowid DESC LIMIT 1
             )
             ORDER BY created_at ASC`
          )
          .all<DiscrepancyRow>(caseId, caseId);

    return rows.map((r) => ({
      id: r.id,
      reconciliationRunId: r.reconciliation_run_id,
      caseId: r.case_id,
      ruleId: r.rule_id,
      discrepancyType: r.discrepancy_type,
      description: r.description,
      sourceDocumentIds: JSON.parse(r.source_document_ids) as string[],
      sourceFieldIds: JSON.parse(r.source_field_ids) as string[],
      expectedValue: r.expected_value,
      actualValue: r.actual_value,
      varianceValue: r.variance_value,
      varianceCurrency: r.variance_currency,
      confidence: r.confidence,
      createdAt: r.created_at,
    }));
  }

  replaceGapsAndConfidence(
    caseId: string,
    runId: string | null,
    gaps: EvidenceGap[],
    assessments: ConfidenceAssessment[]
  ): void {
    this.db.transaction(() => {
      if (runId) {
        this.db
          .prepare('DELETE FROM evidence_gaps WHERE case_id = ? AND (reconciliation_run_id = ? OR reconciliation_run_id IS NULL)')
          .run(caseId, runId);
        this.db
          .prepare('DELETE FROM confidence_assessments WHERE case_id = ? AND reconciliation_run_id = ?')
          .run(caseId, runId);
      } else {
        this.db
          .prepare('DELETE FROM evidence_gaps WHERE case_id = ? AND reconciliation_run_id IS NULL')
          .run(caseId);
      }

      const insertGap = this.db.prepare(
        `INSERT INTO evidence_gaps
         (id, case_id, reconciliation_run_id, gap_type, rule_id, description, what_is_missing, why_it_matters, affected_conclusions, what_could_resolve, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const g of gaps) {
        insertGap.run(
          g.id,
          g.caseId,
          runId,
          g.gapType,
          g.ruleId,
          g.description,
          g.whatIsMissing,
          g.whyItMatters,
          g.affectedConclusions,
          g.whatCouldResolve,
          g.createdAt
        );
      }

      if (runId) {
        const insertConf = this.db.prepare(
          `INSERT INTO confidence_assessments
           (id, case_id, reconciliation_run_id, finding_id, level, criteria, input_fields_verified, input_fields_total, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const a of assessments) {
          insertConf.run(
            a.id,
            a.caseId,
            runId,
            a.findingId,
            a.level,
            a.criteria,
            a.inputFieldsVerified,
            a.inputFieldsTotal,
            a.createdAt
          );
        }
      }
    })();
  }

  listEvidenceGaps(caseId: string, runId?: string): EvidenceGap[] {
    const rows = runId
      ? this.db
          .prepare('SELECT * FROM evidence_gaps WHERE case_id = ? AND reconciliation_run_id = ? ORDER BY created_at ASC')
          .all<GapRow>(caseId, runId)
      : this.db
          .prepare(
            `SELECT * FROM evidence_gaps WHERE case_id = ?
             AND (
               reconciliation_run_id = (SELECT id FROM reconciliation_runs WHERE case_id = ? ORDER BY rowid DESC LIMIT 1)
               OR (reconciliation_run_id IS NULL AND NOT EXISTS (SELECT 1 FROM reconciliation_runs WHERE case_id = ?))
             )
             ORDER BY created_at ASC`
          )
          .all<GapRow>(caseId, caseId, caseId);

    return rows.map((r) => ({
      id: r.id,
      caseId: r.case_id,
      reconciliationRunId: r.reconciliation_run_id,
      gapType: r.gap_type,
      ruleId: r.rule_id,
      description: r.description,
      whatIsMissing: r.what_is_missing,
      whyItMatters: r.why_it_matters,
      affectedConclusions: r.affected_conclusions,
      whatCouldResolve: r.what_could_resolve,
      createdAt: r.created_at,
    }));
  }

  listConfidenceAssessments(caseId: string, runId?: string): ConfidenceAssessment[] {
    const rows = runId
      ? this.db
          .prepare('SELECT * FROM confidence_assessments WHERE case_id = ? AND reconciliation_run_id = ?')
          .all<ConfidenceRow>(caseId, runId)
      : this.db
          .prepare(
            `SELECT * FROM confidence_assessments WHERE case_id = ?
             AND reconciliation_run_id = (SELECT id FROM reconciliation_runs WHERE case_id = ? ORDER BY rowid DESC LIMIT 1)`
          )
          .all<ConfidenceRow>(caseId, caseId);

    return rows.map((r) => ({
      id: r.id,
      caseId: r.case_id,
      reconciliationRunId: r.reconciliation_run_id,
      findingId: r.finding_id,
      level: r.level,
      criteria: r.criteria,
      inputFieldsVerified: r.input_fields_verified,
      inputFieldsTotal: r.input_fields_total,
      createdAt: r.created_at,
    }));
  }

  syncPaymentBlockers(
    caseId: string,
    runId: string | null,
    blockers: PaymentBlocker[]
  ): PaymentBlocker[] {
    return this.db.transaction(() => {
      const existing = runId
        ? this.db
            .prepare('SELECT * FROM payment_blockers WHERE case_id = ? AND reconciliation_run_id = ?')
            .all<BlockerRow>(caseId, runId)
        : this.db
            .prepare('SELECT * FROM payment_blockers WHERE case_id = ? AND reconciliation_run_id IS NULL')
            .all<BlockerRow>(caseId);

      // Preserve existing human-acknowledged/resolved blockers for identical rule+title on the same run
      const existingByKey = new Map<string, BlockerRow>();
      for (const row of existing) {
        existingByKey.set(`${row.rule_id}::${row.title}`, row);
      }

      if (runId) {
        this.db
          .prepare('DELETE FROM payment_blockers WHERE case_id = ? AND (reconciliation_run_id = ? OR reconciliation_run_id IS NULL)')
          .run(caseId, runId);
      } else {
        this.db
          .prepare('DELETE FROM payment_blockers WHERE case_id = ? AND reconciliation_run_id IS NULL')
          .run(caseId);
      }

      const insert = this.db.prepare(
        `INSERT INTO payment_blockers
         (id, case_id, reconciliation_run_id, rule_id, title, reason, impact, resolution_required, evidence_references, status, acknowledged_by, acknowledged_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const saved: PaymentBlocker[] = [];
      for (const b of blockers) {
        const prior = existingByKey.get(`${b.ruleId}::${b.title}`);
        const status = prior ? prior.status : b.status;
        const acknowledgedBy = prior ? prior.acknowledged_by : b.acknowledgedBy;
        const acknowledgedAt = prior ? prior.acknowledged_at : b.acknowledgedAt;
        const id = prior ? prior.id : b.id;

        insert.run(
          id,
          b.caseId,
          runId,
          b.ruleId,
          b.title,
          b.reason,
          b.impact,
          b.resolutionRequired,
          JSON.stringify(b.evidenceReferences),
          status,
          acknowledgedBy,
          acknowledgedAt,
          b.createdAt
        );

        saved.push({
          ...b,
          id,
          reconciliationRunId: runId,
          status,
          acknowledgedBy,
          acknowledgedAt,
        });
      }

      return saved;
    })();
  }

  listPaymentBlockers(caseId: string): PaymentBlocker[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM payment_blockers WHERE case_id = ?
         AND (
           reconciliation_run_id = (SELECT id FROM reconciliation_runs WHERE case_id = ? ORDER BY rowid DESC LIMIT 1)
           OR (reconciliation_run_id IS NULL AND NOT EXISTS (SELECT 1 FROM reconciliation_runs WHERE case_id = ?))
         )
         ORDER BY created_at ASC`
      )
      .all<BlockerRow>(caseId, caseId, caseId);

    return rows.map(mapBlocker);
  }

  getPaymentBlocker(caseId: string, blockerId: string): PaymentBlocker | null {
    const row = this.db
      .prepare('SELECT * FROM payment_blockers WHERE id = ? AND case_id = ?')
      .get<BlockerRow>(blockerId, caseId);
    return row ? mapBlocker(row) : null;
  }

  updatePaymentBlockerStatus(
    blockerId: string,
    status: BlockerStatus,
    actorId: string
  ): void {
    this.db
      .prepare(
        'UPDATE payment_blockers SET status = ?, acknowledged_by = ?, acknowledged_at = ? WHERE id = ?'
      )
      .run(status, actorId, new Date().toISOString(), blockerId);
  }

  // === Evidence Graph ===

  saveEvidenceGraph(caseId: string, graph: EvidenceGraphData): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM evidence_relationships WHERE case_id = ?').run(caseId);
      const nodeTypes = new Map(graph.nodes.map((n) => [n.id, n.type]));
      const now = new Date().toISOString();
      const insert = this.db.prepare(
        `INSERT INTO evidence_relationships
         (id, case_id, source_node_id, source_node_type, target_node_id, target_node_type, edge_type, rule_id, source_reference, derivation_rule, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const edge of graph.edges) {
        insert.run(
          edge.id,
          caseId,
          edge.source,
          nodeTypes.get(edge.source) || 'EVIDENCE_ITEM',
          edge.target,
          nodeTypes.get(edge.target) || 'CASE',
          edge.type,
          edge.ruleId,
          edge.label,
          edge.ruleId || edge.type,
          now
        );
      }
    })();
  }

  listEvidenceRelationships(caseId: string): EvidenceRelationship[] {
    return this.db
      .prepare('SELECT * FROM evidence_relationships WHERE case_id = ? ORDER BY created_at ASC')
      .all<RelationshipRow>(caseId)
      .map((r) => ({
        id: r.id,
        caseId: r.case_id,
        sourceNodeId: r.source_node_id,
        sourceNodeType: r.source_node_type,
        targetNodeId: r.target_node_id,
        targetNodeType: r.target_node_type,
        edgeType: r.edge_type,
        ruleId: r.rule_id,
        sourceReference: r.source_reference,
        derivationRule: r.derivation_rule,
        createdAt: r.created_at,
      }));
  }

  // === Hash-Chained Events & MCP Audit ===

  appendEvent(
    caseId: string,
    eventType: EventType,
    actorId: string,
    description: string,
    metadata: Record<string, unknown> = {}
  ): InvestigationEvent {
    return this.db.transaction(() => {
      const last = this.db
        .prepare('SELECT event_hash FROM investigation_events WHERE case_id = ? ORDER BY rowid DESC LIMIT 1')
        .get<{ event_hash: string }>(caseId);

      const id = generateId();
      const createdAt = new Date().toISOString();
      const previousEventHash = last ? last.event_hash : null;
      const eventHash = createEventHash(
        id,
        eventType,
        caseId,
        createdAt,
        previousEventHash,
        actorId,
        description,
        metadata
      );

      this.db
        .prepare(
          `INSERT INTO investigation_events
           (id, case_id, event_type, actor_id, description, metadata, previous_event_hash, event_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          caseId,
          eventType,
          actorId,
          description,
          JSON.stringify(metadata),
          previousEventHash,
          eventHash,
          createdAt
        );

      return {
        id,
        caseId,
        eventType,
        actorId,
        description,
        metadata,
        previousEventHash,
        eventHash,
        createdAt,
      };
    })();
  }

  listEvents(caseId: string): InvestigationEvent[] {
    return this.db
      .prepare('SELECT * FROM investigation_events WHERE case_id = ? ORDER BY rowid ASC')
      .all<EventRow>(caseId)
      .map((r) => ({
        id: r.id,
        caseId: r.case_id,
        eventType: r.event_type,
        actorId: r.actor_id,
        description: r.description,
        metadata: JSON.parse(r.metadata) as Record<string, unknown>,
        previousEventHash: r.previous_event_hash,
        eventHash: r.event_hash,
        createdAt: r.created_at,
      }));
  }

  logMcpToolCall(call: Omit<McpToolCall, 'createdAt'> & { createdAt?: string }): McpToolCall {
    const createdAt = call.createdAt || new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mcp_tool_calls
         (id, case_id, tool_name, actor_id, input_hash, status, duration_ms, output_hash, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        call.id,
        call.caseId,
        call.toolName,
        call.actorId,
        call.inputHash,
        call.status,
        call.durationMs,
        call.outputHash,
        call.error,
        createdAt
      );
    return { ...call, createdAt };
  }

  listMcpToolCalls(caseId: string): McpToolCall[] {
    return this.db
      .prepare('SELECT * FROM mcp_tool_calls WHERE case_id = ? ORDER BY rowid DESC')
      .all<McpCallRow>(caseId)
      .map((r) => ({
        id: r.id,
        caseId: r.case_id,
        toolName: r.tool_name,
        actorId: r.actor_id,
        inputHash: r.input_hash,
        status: r.status,
        durationMs: r.duration_ms,
        outputHash: r.output_hash,
        error: r.error,
        createdAt: r.created_at,
      }));
  }

  // === Reports & Follow-Up Drafts ===

  findReportBySnapshot(
    caseId: string,
    reconciliationRunId: string,
    snapshotHash: string
  ): Report | null {
    const row = this.db
      .prepare(
        `SELECT * FROM reports
         WHERE case_id = ? AND reconciliation_run_id = ? AND snapshot_hash = ?`
      )
      .get<ReportRow>(caseId, reconciliationRunId, snapshotHash);
    return row ? mapReport(row) : null;
  }

  saveReport(report: Report): void {
    this.db
      .prepare(
        `INSERT INTO reports
         (id, case_id, reconciliation_run_id, snapshot_hash, content_json, content_html, generated_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        report.id,
        report.caseId,
        report.reconciliationRunId,
        report.snapshotHash,
        report.contentJson,
        report.contentHtml,
        report.generatedBy,
        report.createdAt
      );
  }

  listReports(caseId: string): Report[] {
    return this.db
      .prepare('SELECT * FROM reports WHERE case_id = ? ORDER BY rowid DESC')
      .all<ReportRow>(caseId)
      .map(mapReport);
  }

  getReport(caseId: string, reportId: string): Report | null {
    const row = this.db
      .prepare('SELECT * FROM reports WHERE id = ? AND case_id = ?')
      .get<ReportRow>(reportId, caseId);
    return row ? mapReport(row) : null;
  }

  saveFollowUpDraft(draft: FollowUpDraft): void {
    this.db
      .prepare(
        `INSERT INTO follow_up_drafts (id, case_id, report_id, questions, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        draft.id,
        draft.caseId,
        draft.reportId,
        JSON.stringify(draft.questions),
        draft.createdBy,
        draft.createdAt
      );
  }

  listFollowUpDrafts(caseId: string): FollowUpDraft[] {
    return this.db
      .prepare('SELECT * FROM follow_up_drafts WHERE case_id = ? ORDER BY created_at DESC')
      .all<FollowUpRow>(caseId)
      .map((r) => ({
        id: r.id,
        caseId: r.case_id,
        reportId: r.report_id,
        questions: JSON.parse(r.questions) as string[],
        createdBy: r.created_by,
        createdAt: r.created_at,
      }));
  }
}

function mapUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    organizationId: r.organization_id,
    name: r.name,
    createdAt: r.created_at,
  };
}

function mapCase(r: CaseRow): InvestigationCase {
  return {
    id: r.id,
    caseNumber: r.case_number,
    title: r.title,
    description: r.description,
    status: r.status,
    organizationId: r.organization_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapDoc(r: DocRow): SourceDocument {
  return {
    id: r.id,
    caseId: r.case_id,
    documentType: r.document_type,
    originalFilename: r.original_filename,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    sha256: r.sha256,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
  };
}

function mapField(r: FieldRow): ExtractedField {
  return {
    id: r.id,
    documentId: r.document_id,
    caseId: r.case_id,
    fieldName: r.field_name,
    rawText: r.raw_text,
    extractedValue: r.extracted_value,
    numericValue: r.numeric_value,
    currency: r.currency,
    unit: r.unit,
    presence: r.presence,
    sourcePageNumber: r.source_page_number,
    sourceOffset: r.source_offset,
    extractionMethod: r.extraction_method,
    extractionVersion: r.extraction_version,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapRun(r: RunRow): ReconciliationRun {
  return {
    id: r.id,
    caseId: r.case_id,
    inputSnapshotHash: r.input_snapshot_hash,
    rulesVersion: r.rules_version,
    previousRunId: r.previous_run_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function mapBlocker(r: BlockerRow): PaymentBlocker {
  return {
    id: r.id,
    caseId: r.case_id,
    reconciliationRunId: r.reconciliation_run_id,
    ruleId: r.rule_id,
    title: r.title,
    reason: r.reason,
    impact: r.impact,
    resolutionRequired: r.resolution_required,
    evidenceReferences: JSON.parse(r.evidence_references) as string[],
    status: r.status,
    acknowledgedBy: r.acknowledged_by,
    acknowledgedAt: r.acknowledged_at,
    createdAt: r.created_at,
  };
}

function mapReport(r: ReportRow): Report {
  return {
    id: r.id,
    caseId: r.case_id,
    reconciliationRunId: r.reconciliation_run_id,
    snapshotHash: r.snapshot_hash,
    contentJson: r.content_json,
    contentHtml: r.content_html,
    generatedBy: r.generated_by,
    createdAt: r.created_at,
  };
}
